/**
 * The live-workout state machine — distance, elapsed time, route and pace
 * window — owned by a store rather than by the tracking screen.
 *
 * ## Why this isn't component state any more
 *
 * Until now the GPS subscription lived inside `LiveTracker`, and every metre
 * was accumulated in that component's refs. That works exactly as long as the
 * component is on screen: the moment the phone is locked or FORMA is
 * backgrounded, `watchPositionAsync` stops delivering and the run flatlines at
 * 0.00 km. Nobody stares at their screen while running, so that made live
 * tracking useless for the thing it exists for.
 *
 * Background location on Expo works through **expo-task-manager**: the OS wakes
 * the JS bundle and calls a task defined at module scope (see
 * `services/liveLocationTask.ts`). That task runs *outside* React — there may be
 * no component mounted at all, and after a low-memory kill there may be no
 * previous JS context either. So the accumulation logic has to live somewhere
 * both the task and the UI can reach, and it has to survive the JS context
 * dying. Hence: a Zustand store (shared, subscribable) backed by AsyncStorage
 * (durable).
 *
 * Everything the tracking screen used to compute in `handleLocation` now lives
 * in {@link ingestLocations}. The screen renders the store; it no longer owns
 * the numbers.
 *
 * ## Battery
 *
 * See {@link locationOptions} for the accuracy/interval tradeoff.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { create } from 'zustand'
import {
  haversineDistance,
  isValidCoordinate,
  trimPaceSamples,
  type PaceSample,
} from '../utils/geo'
import type { RoutePoint, SportType } from '../types/session'

/* ------------------------------------------------------------------ */
/* Task identity + storage                                             */
/* ------------------------------------------------------------------ */

/**
 * Name the background location task is registered under. Defined here (rather
 * than in the task module) so this store can start/stop updates without
 * importing the task module and creating an import cycle.
 *
 * Task registrations are persisted by the OS across launches, so this string is
 * effectively a stable identifier — changing it would orphan any registration
 * left behind by a previous build.
 */
export const LIVE_LOCATION_TASK = 'forma-live-location'

const STORAGE_KEY = 'forma.liveTracking.v1'

/**
 * A persisted session older than this is assumed to be debris — the app was
 * killed mid-run and never came back — and is discarded on hydrate rather than
 * resurrected as a 9-hour workout.
 */
const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

/**
 * Don't rewrite AsyncStorage more than this often. Writes are only a safety net
 * for the case where the OS kills the JS context between fixes; the live path
 * reads the in-memory store. A hard kill can therefore cost at most this much
 * of the tail, which is why pause/resume/stop always flush immediately.
 */
const PERSIST_MIN_INTERVAL_MS = 4000

/* ------------------------------------------------------------------ */
/* GPS filtering constants                                             */
/* ------------------------------------------------------------------ */
/* Moved verbatim out of LiveTracker: the filtering has to run wherever the fix
 * arrives, and in the background that is the task, not the component. */

/**
 * GPS fixes worse than this (metres) are too noisy to trust for distance.
 *
 * A 50 m-accurate fix can sit anywhere in a 50 m circle, so two of them in a row
 * can invent ~100 m of "distance" out of nothing. Every phantom metre makes the
 * pace look faster than it is, and the wander between them makes it jump.
 * Outdoors with a clear sky a modern chip reports 3-10 m, so 20 m still accepts
 * everything usable and only rejects fixes that would lie.
 */
const MAX_ACCURACY_M = 20

/**
 * …but never let the accuracy gate silence a whole run.
 *
 * 20 m is the right gate when fixes stream in from a foreground watcher on a
 * phone with a clear view of the sky. It is *not* safe as an absolute rule: on a
 * backgrounded phone in a pocket, under cloud, or indoors at the start of a run,
 * a device can spend minutes reporting nothing better than 30-40 m. The original
 * gate then rejects every single fix, and the athlete gets 0.00 km with no
 * indication anything is wrong — silently recording nothing is a far worse
 * failure than recording something slightly noisy.
 *
 * So after {@link ACCURACY_RELAX_AFTER} consecutive rejections the gate opens to
 * this. `MIN_SEGMENT_M` and the stationary filter still hold the line against
 * phantom drift, so the cost is a little jitter, not invented kilometres.
 */
const RELAXED_ACCURACY_M = 50

/** Consecutive accuracy rejections before the gate relaxes. */
const ACCURACY_RELAX_AFTER = 8

/**
 * The first few fixes after the countdown arrive while the chip is still
 * locking on: they are typically a coarse cell/wifi estimate that then snaps
 * tens of metres to the real position, and that snap is otherwise counted as
 * distance run. Discard them outright — they cost a couple of seconds of
 * tracking at the start line, where nobody is moving yet anyway.
 */
const WARMUP_FIXES = 3

/**
 * Reported speed (m/s) below which the athlete counts as standing still. ~0.5
 * m/s is 1.8 km/h — slower than an amble, so no real movement falls under it.
 */
const STATIONARY_SPEED_MS = 0.5

/**
 * …but only discard a stationary segment if it is also this short.
 *
 * Android's fused provider reports `speed: 0` when it simply doesn't know rather
 * than when it knows you've stopped, and its speed estimate lags a step-off by a
 * fix or two — so an uncapped rule would silently freeze distance on some
 * devices, and would shave the first few metres off every restart from a traffic
 * light. 5 m is the `distanceInterval` we ask for, so genuine movement arrives as
 * segments of *at least* that.
 */
const STATIONARY_MAX_SEGMENT_M = 5

/** Below this segment length (m) we treat movement as GPS wander / standing still. */
const MIN_SEGMENT_M = 2

/**
 * Reject any segment implying a speed above this (m/s ≈ 108 km/h). The fused
 * provider routinely jumps hundreds of metres when it switches between a
 * cell/wifi estimate and a satellite fix; without this, one jump silently adds
 * a kilometre or more to the run.
 */
const MAX_PLAUSIBLE_SPEED_MS = 30

/**
 * Floor on the elapsed time used for the jump test above, in seconds.
 *
 * This constant is the fix for a bug that zeroed out entire runs. The jump test
 * is `segment / elapsed > 30 m/s`, and `elapsed` used to be floored at **1
 * second** — so any segment longer than 30 m was classified as a teleport. That
 * is fine while fixes arrive every 3 s from a foreground watcher (a runner
 * covers ~10 m), and catastrophic as soon as they don't: batched background
 * delivery, or a provider that reports every 25 m, produces perfectly ordinary
 * 25-50 m segments that were *all* discarded. And because the discard branch
 * re-anchors without appending, the route froze at a single point and distance
 * stayed at exactly 0.00 km for the whole workout.
 *
 * Two changes make that impossible now: elapsed is measured from the **wall
 * clock** rather than from provider timestamps (which can collapse or repeat
 * across a batch), and the floor is small enough that it only ever guards
 * against a divide-by-zero, never against a real segment.
 */
const MIN_JUMP_DT_SEC = 0.25

/**
 * Hard cap on stored route points. Past that the route is halved in resolution
 * (see `appendPoint`) so memory, render cost, the size of the AsyncStorage
 * snapshot and the saved Firestore document all stay bounded no matter how long
 * the session runs. Distance is accumulated separately, fix by fix, so thinning
 * the array costs no accuracy in the recorded total.
 */
const MAX_ROUTE_POINTS = 1000

/* ---- Rolling "current pace" window ------------------------------- */

/**
 * How far back the current-pace readout looks. Long enough to ride out one bad
 * fix, short enough to react within a block or two — the same feel as Strava's
 * current pace.
 */
export const PACE_WINDOW_MS = 45_000

/** Under this much movement inside the window the pace is noise, not a pace. */
export const PACE_WINDOW_MIN_M = 30

/** Newest accepted fix older than this → we've stopped; show "--:--". */
export const PACE_SAMPLE_STALE_MS = 12_000

/** Slower than 30 min/km isn't a pace, it's a stall. Show "--:--" instead. */
export const PACE_MAX_SEC_PER_KM = 1_800

/** No usable fix for this long → tell the user we've lost signal. */
export const GPS_STALE_MS = 15_000

/* ------------------------------------------------------------------ */
/* Diagnostics                                                         */
/* ------------------------------------------------------------------ */

/**
 * Trace every stage of the pipeline to the device log.
 *
 * Left on: live tracking fails *silently* — a rejected fix looks exactly like a
 * stationary athlete — so when a run comes back at 0.00 km the only way to tell
 * which stage dropped it is a log line per stage. Read it with
 * `adb logcat -s ReactNativeJS:V | grep liveTracking`.
 *
 * Volume is one line per GPS fix (~1 every 3 s), which is nothing next to what
 * the location subsystem itself logs. Flip to false once the feature has been
 * trusted on real hardware for a while.
 */
const DEBUG = true

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[liveTracking]', ...args)
}

/* ------------------------------------------------------------------ */
/* Location request options                                            */
/* ------------------------------------------------------------------ */

/**
 * Options handed to `startLocationUpdatesAsync` / `watchPositionAsync`.
 *
 * ### Battery tradeoff (deliberate, documented per the brief)
 *
 * - **`Accuracy.Highest`, not `BestForNavigation`.** `Highest` asks the chip for
 *   its best satellite fix. `BestForNavigation` layers extra sensor fusion on
 *   top for turn-by-turn navigation; on Android it is materially heavier for no
 *   gain on a run, where a 3-10 m fix every few seconds is already better than
 *   the 20 m filter above needs. `High` (~10 m) would save a little more, but it
 *   sits right on the filter threshold, so a meaningful share of fixes would be
 *   rejected and distance would under-report.
 * - **`timeInterval: 3000` / `distanceInterval: 5`** are unchanged from the
 *   original foreground watcher *on purpose*: sampling cadence is the one knob
 *   that moves the recorded distance itself, so background and foreground must
 *   agree or a run would measure differently depending on whether the screen was
 *   on. At a jogging pace this is roughly one fix every 3-4 seconds.
 * - **Deferred updates are left off** (`deferredUpdatesInterval`/`Distance`
 *   default to 0). Setting them lets Android batch background fixes and sleep the
 *   radio between them — real battery savings — but the batch only lands when the
 *   thresholds are crossed, so a run that ends mid-batch loses its tail and the
 *   screen shows stale numbers the instant you unlock. Accuracy wins here; the
 *   foreground service is already keeping the process alive either way.
 *
 * Measured cost is broadly Strava-like: continuous GPS plus a foreground service
 * is on the order of 5-8% battery per hour on a modern Android phone. That is
 * the price of the feature, not a bug to tune away.
 */
function locationOptions(): Location.LocationOptions {
  return {
    accuracy: Location.Accuracy.Highest,
    timeInterval: 3000,
    distanceInterval: 5,
  }
}

/**
 * The Android foreground-service notification. Its presence is what stops the OS
 * from freezing the process once the screen goes off, and it doubles as the
 * "still tracking" indicator — the Android equivalent of Strava's lock-screen
 * widget. Tapping it reopens FORMA (expo-location wires the notification's
 * content intent to the app's launch intent), and `LogScreen` puts the user back
 * on the tracking screen from there.
 *
 * ### Why the body has no live stats
 *
 * The brief asked for distance/time in the notification. expo-location can only
 * change it by re-registering the task with new `foregroundService` options —
 * and `LocationTaskConsumer.maybeStartForegroundService()` bails out with
 * *"Foreground location task cannot be started while the app is in the
 * background"* whenever the activity is paused. In other words the notification
 * can only be updated at exactly the times the user is already looking at the
 * live screen. Re-registering also tears down and recreates the underlying
 * location request, so polling it would risk dropping fixes mid-run for a
 * benefit that never lands. Static copy it is.
 */
const FOREGROUND_SERVICE = {
  notificationTitle: 'FORMA is tracking your run',
  notificationBody: 'Tap to return to your workout',
  notificationColor: '#1D9E75',
  /**
   * Keep recording if the user swipes FORMA out of the recents list. Swiping
   * away the *app* is not the same gesture as ending a *workout*, and losing an
   * hour of running to a stray swipe is exactly the failure this whole feature
   * exists to prevent. The service is stopped explicitly on Stop.
   */
  killServiceOnDestroy: false,
} as const

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

export type LiveStatus = 'idle' | 'tracking' | 'paused'

/** How the OS is currently feeding us fixes. */
export type FeedMode =
  /** Nothing running. */
  | 'none'
  /** Background task + foreground service: survives lock/background. */
  | 'background'
  /** Plain `watchPositionAsync`: dies when the screen goes off. */
  | 'foreground'

export interface LiveTrackingState {
  status: LiveStatus
  /** Which sport this workout is, so a restored session comes back correctly. */
  sport: SportType | null
  /** Wall-clock ms when the workout began (survives pauses). */
  startedAt: number
  /** Wall-clock ms the current running segment began; 0 while paused. */
  segmentStartedAt: number
  /** Banked ms from segments before the current one. */
  accumulatedMs: number
  distanceM: number
  route: RoutePoint[]
  /** Cumulative-distance samples backing the rolling current-pace readout. */
  paceSamples: PaceSample[]
  /** Anchor for the next segment; null after a pause so the gap isn't measured. */
  lastPoint: RoutePoint | null
  /**
   * Wall-clock ms at which {@link lastPoint} was accepted.
   *
   * The speed sanity check is measured against this rather than against the
   * difference of two provider timestamps. Provider clocks repeat, collapse
   * across a batched delivery, and on some Android builds sit seconds away from
   * the system clock — and a bad elapsed value turns the jump filter into a
   * filter that rejects the entire run. See {@link MIN_JUMP_DT_SEC}.
   */
  lastPointAt: number
  /**
   * Newest provider timestamp already folded in, so the same physical fix
   * delivered by *both* feeds is only counted once. See {@link startLocationFeed}.
   */
  lastStamp: number
  /**
   * Consecutive fixes rejected for poor accuracy, driving the adaptive gate.
   * Reset by any accepted fix. See {@link RELAXED_ACCURACY_M}.
   */
  accuracyRejects: number
  /**
   * True once this device has proved it cannot hold {@link MAX_ACCURACY_M}, so
   * the gate stays open at {@link RELAXED_ACCURACY_M}.
   *
   * This has to **latch** rather than be re-derived from the rejection streak.
   * A streak alone is self-cancelling: the fix that finally gets through resets
   * the counter, the next one is measured against the tight gate again and is
   * rejected, and the device settles into letting exactly one fix in nine
   * through — which, since the first of those is consumed by the warm-up, means
   * the trail never gets an anchor and the run records 0.00 km forever. Latching
   * is the difference between a gate that adapts and one that only looks like it.
   *
   * Cleared again the moment a genuinely accurate fix arrives, so a phone that
   * regains a clear sky goes back to the strict gate for the rest of the run.
   */
  accuracyRelaxed: boolean
  /** Counts down the throwaway fixes taken while the GPS chip locks on. */
  warmupLeft: number
  /** Wall-clock ms of the last accepted fix; drives the "GPS lost" banner. */
  lastFixAt: number
  /**
   * True once any fix has been accepted this session, so the UI can tell
   * "still acquiring satellites" from "we had a lock and lost it". Deliberately
   * not reset by pause/resume — the chip does not forget where it is.
   */
  hasFix: boolean
  /**
   * The athlete has tapped Stop: the clock is settled and the feed is down, but
   * the workout has not been rated or saved yet. Distinct from `paused` so a
   * relaunch between Stop and Save returns to the summary rather than offering
   * to resume a run that is already over.
   */
  finished: boolean
  feedMode: FeedMode
  /** True once this JS context has read (or written) the persisted snapshot. */
  hydrated: boolean
}

const EMPTY: LiveTrackingState = {
  status: 'idle',
  sport: null,
  startedAt: 0,
  segmentStartedAt: 0,
  accumulatedMs: 0,
  distanceM: 0,
  route: [],
  paceSamples: [],
  lastPoint: null,
  lastPointAt: 0,
  lastStamp: 0,
  accuracyRejects: 0,
  accuracyRelaxed: false,
  warmupLeft: 0,
  lastFixAt: 0,
  hasFix: false,
  finished: false,
  feedMode: 'none',
  hydrated: false,
}

export const useLiveTrackingStore = create<LiveTrackingState>(() => ({ ...EMPTY }))

const get = useLiveTrackingStore.getState
const set = useLiveTrackingStore.setState

/**
 * Elapsed workout milliseconds, derived from the wall clock rather than counted.
 *
 * This is what makes backgrounded time correct for free: JS timers are throttled
 * or stopped outright while the app is in the background, so anything that
 * *counted* ticks would under-report a locked-screen run even with GPS flowing.
 */
export function elapsedMsFrom(s: LiveTrackingState, now = Date.now()): number {
  const live = s.status === 'tracking' && s.segmentStartedAt > 0 ? now - s.segmentStartedAt : 0
  const total = s.accumulatedMs + Math.max(0, live)
  return Number.isFinite(total) ? total : 0
}

/** True when there is a workout in progress that the UI should return to. */
export function hasActiveSession(s: LiveTrackingState): boolean {
  return s.status !== 'idle'
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

type Persisted = Omit<LiveTrackingState, 'hydrated' | 'feedMode'>

let lastPersistAt = 0

/**
 * Write the snapshot AsyncStorage-side.
 *
 * `force` bypasses the throttle and is used at every state transition
 * (begin/pause/resume/stop) — those are the moments a lost write would actually
 * change what the athlete sees, unlike a single missed fix.
 */
async function persist(force = false): Promise<void> {
  const s = get()
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_MIN_INTERVAL_MS) return
  lastPersistAt = now
  try {
    if (s.status === 'idle') {
      await AsyncStorage.removeItem(STORAGE_KEY)
      return
    }
    const snapshot: Persisted = {
      status: s.status,
      sport: s.sport,
      startedAt: s.startedAt,
      segmentStartedAt: s.segmentStartedAt,
      accumulatedMs: s.accumulatedMs,
      distanceM: s.distanceM,
      route: s.route,
      paceSamples: s.paceSamples,
      lastPoint: s.lastPoint,
      lastPointAt: s.lastPointAt,
      lastStamp: s.lastStamp,
      accuracyRejects: s.accuracyRejects,
      accuracyRelaxed: s.accuracyRelaxed,
      warmupLeft: s.warmupLeft,
      lastFixAt: s.lastFixAt,
      hasFix: s.hasFix,
      finished: s.finished,
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch (err) {
    // A failed write costs crash-resilience, not the run in progress — the
    // in-memory store is still authoritative. Never let it reach the caller: on
    // the background path the caller is a TaskManager executor, where an
    // unhandled rejection is fatal in a release build.
    console.warn('[liveTracking] persist failed', err)
  }
}

let hydrating: Promise<void> | null = null

/**
 * Load the persisted workout into this JS context, once.
 *
 * The case that matters: Android killed FORMA's JS context while the phone was
 * in a pocket, then relaunched it *headlessly* to deliver a location batch. The
 * store starts empty in that context, so without this the batch would be
 * accumulated onto a zeroed session and the run would restart from 0.00 km
 * halfway through.
 */
export function ensureHydrated(): Promise<void> {
  if (get().hydrated) return Promise.resolve()
  if (!hydrating) {
    hydrating = readSnapshot().finally(() => {
      hydrating = null
    })
  }
  return hydrating
}

async function readSnapshot(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      set({ hydrated: true })
      return
    }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const startedAt = Number(parsed.startedAt) || 0
    // Debris from a run that was never stopped. Resurrecting it would present
    // the athlete with a nine-hour workout to save.
    if (!startedAt || Date.now() - startedAt > SESSION_MAX_AGE_MS) {
      set({ ...EMPTY, hydrated: true })
      await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
      return
    }
    set({
      ...EMPTY,
      status: parsed.status === 'paused' ? 'paused' : 'tracking',
      sport: parsed.sport ?? null,
      startedAt,
      segmentStartedAt: Number(parsed.segmentStartedAt) || 0,
      accumulatedMs: Number(parsed.accumulatedMs) || 0,
      distanceM: Number(parsed.distanceM) || 0,
      route: Array.isArray(parsed.route) ? parsed.route : [],
      paceSamples: Array.isArray(parsed.paceSamples) ? parsed.paceSamples : [],
      lastPoint: parsed.lastPoint ?? null,
      lastPointAt: Number(parsed.lastPointAt) || 0,
      lastStamp: Number(parsed.lastStamp) || 0,
      accuracyRejects: Number(parsed.accuracyRejects) || 0,
      accuracyRelaxed: parsed.accuracyRelaxed === true,
      warmupLeft: Number(parsed.warmupLeft) || 0,
      lastFixAt: Number(parsed.lastFixAt) || 0,
      hasFix: parsed.hasFix === true,
      finished: parsed.finished === true,
      hydrated: true,
    })
  } catch (err) {
    console.warn('[liveTracking] hydrate failed', err)
    set({ ...EMPTY, hydrated: true })
  }
}

/* ------------------------------------------------------------------ */
/* Ingest — the GPS filtering pipeline                                 */
/* ------------------------------------------------------------------ */

/**
 * Append a point, keeping the stored route bounded.
 *
 * Once the cap is hit the route is halved — every other point is dropped and the
 * newest is always kept — so a 3-hour run costs the same memory as a 30-minute
 * one, at gently decreasing resolution.
 */
function appendPoint(route: RoutePoint[], point: RoutePoint): RoutePoint[] {
  if (route.length + 1 <= MAX_ROUTE_POINTS) return [...route, point]
  const halved = route.filter((_, i) => i % 2 === 0)
  halved.push(point)
  return halved
}

/**
 * Fold one fix into a state snapshot, applying every accuracy/plausibility
 * filter. Pure: returns a partial patch, or `null` when the fix is rejected.
 *
 * Split out from the store mutation so a whole background batch can be folded in
 * a single `set()` — the OS delivers backgrounded fixes in arrays, and applying
 * them one `set()` at a time would fan out that many store notifications.
 *
 * Every rejection is logged. These filters are the difference between a correct
 * run and a run that silently records nothing, and from the outside a rejected
 * fix is indistinguishable from standing still — so when a workout comes back at
 * 0.00 km, the log is what says which filter ate it.
 */
function foldLocation(
  s: LiveTrackingState,
  loc: Location.LocationObject,
  receivedAt: number,
): Partial<LiveTrackingState> | null {
  const coords = loc?.coords
  if (!coords) return null
  const { latitude, longitude, accuracy, speed: reportedSpeed } = coords

  // A non-finite or out-of-range coordinate must never reach state. It would
  // poison distance/pace/calories with NaN, and passing it to the map's Polyline
  // throws inside the Google Maps SDK — a native crash no JS try/catch or error
  // boundary can contain.
  if (!isValidCoordinate(latitude, longitude)) {
    log('reject: invalid coordinate', latitude, longitude)
    return null
  }

  const stamp = Number.isFinite(loc.timestamp) ? loc.timestamp : receivedAt

  // Both feeds run at once (see `startLocationFeed`), so the same physical fix
  // can be handed to us twice — once by the foreground watcher and once by the
  // background task. Counting it twice would inflate distance. Provider
  // timestamps are the same on both paths, so strictly-increasing is an exact
  // de-duplication; it is the same rule expo-location applies natively.
  if (Number.isFinite(loc.timestamp) && stamp <= s.lastStamp) return null

  // Too imprecise to trust — but never permanently. A device that can only
  // manage 30 m for a while must still record a run; see RELAXED_ACCURACY_M.
  const gate = s.accuracyRelaxed ? RELAXED_ACCURACY_M : MAX_ACCURACY_M
  if (accuracy != null && Number.isFinite(accuracy) && accuracy > gate) {
    const rejects = s.accuracyRejects + 1
    log(`reject: accuracy ${accuracy.toFixed(0)}m > ${gate}m (streak ${rejects})`)
    // Deliberately not counted as a fix: the "Searching for GPS…" hint should
    // stay up while every reading is being thrown away, rather than the distance
    // appearing to freeze for no reason.
    return {
      accuracyRejects: rejects,
      accuracyRelaxed: s.accuracyRelaxed || rejects >= ACCURACY_RELAX_AFTER,
    }
  }

  // Common to every accepted path below. The relax only lifts when the device
  // shows it can hold the strict gate again — see `accuracyRelaxed`.
  const accepted = {
    accuracyRejects: 0,
    accuracyRelaxed:
      accuracy != null && Number.isFinite(accuracy) && accuracy <= MAX_ACCURACY_M
        ? false
        : s.accuracyRelaxed,
  }

  // Warm-up: the chip is still settling, so this position is not to be trusted —
  // and deliberately not adopted as an anchor either, or the snap from the coarse
  // first estimate to the real fix would be measured as distance covered.
  if (s.warmupLeft > 0) {
    log(`warm-up: discarding fix (${s.warmupLeft} left)`)
    return {
      warmupLeft: s.warmupLeft - 1,
      lastFixAt: receivedAt,
      lastStamp: stamp,
      hasFix: true,
      ...accepted,
    }
  }

  const point: RoutePoint = { latitude, longitude, timestamp: stamp }
  const prev = s.lastPoint

  if (!prev) {
    // First anchor of a segment (start, or the first fix after a resume): it
    // contributes no distance, but it *does* open the pace window, so the very
    // next fix already has something to measure against.
    log('anchor: first point of segment')
    return {
      lastFixAt: receivedAt,
      lastStamp: stamp,
      hasFix: true,
      ...accepted,
      lastPoint: point,
      lastPointAt: receivedAt,
      paceSamples: [{ t: receivedAt, m: s.distanceM }],
      route: appendPoint(s.route, point),
    }
  }

  const seg = haversineDistance(prev.latitude, prev.longitude, latitude, longitude)

  // Ignore tiny wander so an indoor / stationary athlete doesn't accrue metres.
  // The anchor is deliberately *not* moved: slow real movement accumulates across
  // several fixes and lands as one segment once it clears the threshold, so
  // nothing is lost — only noise.
  if (seg < MIN_SEGMENT_M) {
    return { lastFixAt: receivedAt, lastStamp: stamp, hasFix: true, ...accepted }
  }

  // Same again, but driven by the provider's own reported speed rather than by
  // segment length alone: standing at a crossing produces a stream of 2-5 m hops
  // that clear MIN_SEGMENT_M and are still pure drift. Wait two minutes at a
  // light and that is ~75 phantom metres.
  if (
    reportedSpeed != null &&
    Number.isFinite(reportedSpeed) &&
    reportedSpeed >= 0 &&
    reportedSpeed < STATIONARY_SPEED_MS &&
    seg < STATIONARY_MAX_SEGMENT_M
  ) {
    log(`stationary: dropping ${seg.toFixed(1)}m of drift`)
    return { lastFixAt: receivedAt, lastStamp: stamp, hasFix: true, ...accepted }
  }

  // Discard provider jumps (cell/wifi estimate → satellite fix), which otherwise
  // add hundreds of phantom metres in a single tick. The point is still adopted
  // as the new anchor so the trail resumes from reality.
  //
  // Elapsed is taken from the WALL CLOCK, not from the difference of two provider
  // timestamps — see MIN_JUMP_DT_SEC for the run-destroying bug that caused.
  const dtSec = Math.max((receivedAt - s.lastPointAt) / 1000, MIN_JUMP_DT_SEC)
  const impliedSpeed = seg / dtSec
  if (impliedSpeed > MAX_PLAUSIBLE_SPEED_MS) {
    log(
      `reject: implausible ${seg.toFixed(0)}m in ${dtSec.toFixed(1)}s ` +
        `(${impliedSpeed.toFixed(0)} m/s) — re-anchoring`,
    )
    return {
      lastFixAt: receivedAt,
      lastStamp: stamp,
      hasFix: true,
      ...accepted,
      lastPoint: point,
      lastPointAt: receivedAt,
    }
  }

  const total = s.distanceM + seg
  if (!Number.isFinite(total)) {
    return {
      lastFixAt: receivedAt,
      lastStamp: stamp,
      hasFix: true,
      ...accepted,
      lastPoint: point,
      lastPointAt: receivedAt,
    }
  }

  const samples = trimPaceSamples(s.paceSamples, receivedAt, PACE_WINDOW_MS)
  return {
    lastFixAt: receivedAt,
    lastStamp: stamp,
    hasFix: true,
    ...accepted,
    lastPoint: point,
    lastPointAt: receivedAt,
    distanceM: total,
    // Spread because trimPaceSamples returns the same array reference when
    // nothing needed dropping, and mutating stored state in place would leave
    // subscribers unable to tell the value changed.
    paceSamples: [...samples, { t: receivedAt, m: total }],
    route: appendPoint(s.route, point),
  }
}

/**
 * Fold a batch of fixes into the store. **This is the single entry point for
 * both feeds** — the background TaskManager task and the foreground
 * `watchPositionAsync` watcher both land here, so a run measures identically
 * whether or not the screen was on, and a fix delivered by both is counted once.
 *
 * @param source which feed delivered this batch, for the log only.
 */
export async function ingestLocations(
  locations: Location.LocationObject[],
  source: 'watch' | 'task' = 'task',
): Promise<void> {
  if (!locations?.length) return
  // The background task can run in a JS context that has never seen this
  // session. Load it before accumulating onto it.
  await ensureHydrated()

  const before = get()
  // Fixes that arrive while paused (the provider can have one in flight when the
  // user hits Pause) must not extend the trail across the break.
  if (before.status !== 'tracking') {
    log(`ignoring ${locations.length} fix(es) from ${source} — status ${before.status}`)
    return
  }

  const batchAt = Date.now()
  // Map each fix onto the system clock, preserving the spacing *between* fixes.
  //
  // A backgrounded batch can hold several fixes covering a minute or more, and
  // stamping them all with the batch's arrival time would collapse the rolling
  // pace window onto a single instant — zero elapsed seconds across the window,
  // so "current pace" would read "--:--" every time the athlete unlocked the
  // phone. Using the provider's raw timestamps instead is no good either: on some
  // Android builds the provider clock sits seconds away from the system one,
  // and the window is aged against `Date.now()` on the UI tick.
  //
  // So: anchor the *newest* fix to now and shift the rest by the same offset.
  // Intra-batch spacing is exact, and the provider/system clock skew cancels out.
  // A single foreground fix reduces to `Date.now()`, exactly as before.
  const stamps = locations
    .map((loc) => (Number.isFinite(loc?.timestamp) ? loc.timestamp : NaN))
    .filter((t) => Number.isFinite(t))
  const newest = stamps.length ? Math.max(...stamps) : NaN
  const skew = Number.isFinite(newest) ? batchAt - newest : 0

  // `working` is the running state each fold is applied against; `merged` is the
  // union of the patches they produced, and is what gets written.
  //
  // Accumulating the patches rather than listing the fields to copy is
  // deliberate. The previous version wrote an explicit whitelist of keys out of
  // the folded state — and silently dropped `accuracyRelaxed` because it was
  // added to the fold and forgotten here, so the adaptive accuracy gate computed
  // the right answer and then threw it away. A whitelist of state fields is a
  // bug waiting for the next field; this cannot miss one.
  let working = before
  let merged: Partial<LiveTrackingState> = {}
  let contributed = 0
  for (const loc of locations) {
    const raw = Number.isFinite(loc?.timestamp) ? loc.timestamp + skew : batchAt
    // Never let a fix claim to be from the future — a clock jump mid-run would
    // otherwise put a sample beyond `now` and make the window's elapsed time
    // negative.
    const receivedAt = Math.min(raw, batchAt)
    const patch = foldLocation(working, loc, receivedAt)
    if (!patch) continue
    working = { ...working, ...patch }
    merged = { ...merged, ...patch }
    // Only fixes that actually advanced the trail carry `lastStamp`; a patch
    // that merely bumped the rejection streak is not a fix we used.
    if ('lastStamp' in patch) contributed += 1
  }

  const touched = Object.keys(merged).length
  if (touched === 0) {
    log(`batch from ${source}: ${locations.length} fix(es), all discarded`)
    return
  }

  set(merged)

  log(
    `batch from ${source}: ${contributed}/${locations.length} used · ` +
      `total ${working.distanceM.toFixed(1)}m · route ${working.route.length} pts` +
      (working.accuracyRelaxed ? ' · accuracy gate relaxed' : ''),
  )
  // Nothing worth persisting if the batch only moved the rejection counter.
  if (contributed > 0) await persist()
}

/* ------------------------------------------------------------------ */
/* Location feed lifecycle                                             */
/* ------------------------------------------------------------------ */

/** Live subscription used only when background permission was refused. */
let foregroundWatch: Location.LocationSubscription | null = null
/**
 * Bumped by every stop, so an in-flight `watchPositionAsync` can tell its
 * subscription is already obsolete by the time the promise resolves and remove
 * it instead of leaking a second feed that double-counts every metre.
 */
let watchGeneration = 0

/** Is the background task currently registered with the OS? */
export async function isBackgroundFeedRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)
  } catch {
    return false
  }
}

/**
 * Start feeding the store — **both feeds at once, on purpose.**
 *
 * ## Why two feeds and not one
 *
 * The first cut of background tracking replaced `watchPositionAsync` with the
 * TaskManager task whenever background permission was held. That was a mistake
 * that cost a real run: the task path goes through a completely different native
 * route (fused provider → PendingIntent broadcast → **JobScheduler** →
 * `TaskJobService` → JS), and when any link in that chain misbehaves on a
 * particular device or OEM build, the app records *nothing at all* — while the
 * timer keeps running, so it looks like it is working right up until you stop.
 *
 * Swapping a proven path for an unproven one and having no fallback is what made
 * a screen-on run — which had always worked — start returning 0.00 km.
 *
 * So now:
 *
 * - **`watchPositionAsync` always runs.** It is exactly the call that recorded
 *   distance correctly before any of this existed, with exactly the same options.
 *   While the screen is on, this alone is enough, and it is the baseline that
 *   must never regress again.
 * - **The background task runs *in addition*,** when permission allows. It is the
 *   only thing still delivering once the screen goes off and the watcher is
 *   frozen, and it brings the foreground-service notification with it.
 *
 * Overlap is free: both feeds surface the same physical fixes with the same
 * provider timestamps, and `foldLocation` de-duplicates on a strictly-increasing
 * timestamp, so a fix delivered twice is counted once. Battery cost is not
 * doubled either — the fused provider merges concurrent requests from the same
 * app and services them once, at the strictest of the two.
 *
 * Failure of *either* feed is survivable and logged; only failing to start both
 * rejects, so the caller can show the GPS error banner.
 */
export async function startLocationFeed(useBackground: boolean): Promise<FeedMode> {
  await stopLocationFeed()
  const generation = ++watchGeneration

  // --- background task (optional, additive) ---
  let background = false
  if (useBackground) {
    try {
      await Location.startLocationUpdatesAsync(LIVE_LOCATION_TASK, {
        ...locationOptions(),
        foregroundService: FOREGROUND_SERVICE,
        // iOS: keep the blue status-bar pill up so the user always knows FORMA
        // has the GPS, and tell CoreLocation this is a workout so it tunes for it.
        showsBackgroundLocationIndicator: true,
        activityType: Location.ActivityType.Fitness,
        // Left off deliberately: iOS would otherwise decide the athlete has
        // stopped, power down the GPS and *never resume it on its own*, silently
        // ending the run.
        pausesUpdatesAutomatically: false,
      })
      background = true
      log('background task started')
    } catch (err) {
      // Not fatal, and specifically not rethrown: the watcher below is the feed
      // that actually has to work. Losing background means losing screen-off
      // tracking, not losing the run.
      console.warn('[liveTracking] background task failed to start', err)
    }
  }

  // --- foreground watcher (always) ---
  let foreground = false
  try {
    const sub = await Location.watchPositionAsync(locationOptions(), (loc) => {
      // Deliberately not awaited: this is a native callback, and returning a
      // promise into it does nothing. ingestLocations swallows its own errors.
      void ingestLocations([loc], 'watch')
    })
    if (generation !== watchGeneration) {
      // Stopped while we were awaiting — nothing else holds this reference.
      sub.remove()
      return 'none'
    }
    foregroundWatch = sub
    foreground = true
    log('foreground watcher started')
  } catch (err) {
    console.warn('[liveTracking] foreground watcher failed to start', err)
    if (!background) throw err
  }

  const mode: FeedMode = background ? 'background' : foreground ? 'foreground' : 'none'
  set({ feedMode: mode })
  log(`feed mode: ${mode} (background=${background} foreground=${foreground})`)
  return mode
}

/**
 * Stop both feeds and tear down the foreground service / its notification.
 *
 * Safe to call when nothing is running, and never throws: it is used on the
 * cleanup path where a rejection would be an unhandled promise (fatal in a
 * release build).
 */
export async function stopLocationFeed(): Promise<void> {
  watchGeneration += 1
  try {
    foregroundWatch?.remove()
  } catch {
    // remove() can throw if the native subscription is already gone (e.g. the OS
    // tore it down when location services were disabled). We're dropping the
    // reference either way.
  }
  foregroundWatch = null

  try {
    // `hasStarted…` first: stopping a task that was never registered rejects on
    // Android ("Task 'forma-live-location' not found").
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK)
    }
  } catch (err) {
    console.warn('[liveTracking] stopping background updates failed', err)
  }
  set({ feedMode: 'none' })
}

/* ------------------------------------------------------------------ */
/* Session lifecycle                                                   */
/* ------------------------------------------------------------------ */

/**
 * Open a fresh workout and start the location feed.
 *
 * @param useBackground whether "Allow all the time" was granted.
 * @returns the feed actually established, so the UI can warn when it degraded.
 */
export async function beginSession(
  sport: SportType,
  useBackground: boolean,
): Promise<FeedMode> {
  const now = Date.now()
  set({
    ...EMPTY,
    status: 'tracking',
    sport,
    startedAt: now,
    segmentStartedAt: now,
    accumulatedMs: 0,
    warmupLeft: WARMUP_FIXES,
    lastFixAt: now,
    hydrated: true,
  })
  log(`session begin: sport=${sport} background=${useBackground}`)
  await persist(true)
  try {
    return await startLocationFeed(useBackground)
  } catch (err) {
    // The session stays open: the timer is already running and is worth
    // recording even with no GPS at all. The caller surfaces the error.
    set({ feedMode: 'none' })
    throw err
  }
}

/**
 * Pause the clock and the feed.
 *
 * The whole feed is torn down rather than merely ignored, so a paused workout
 * costs no battery and drops the foreground-service notification — a paused run
 * is not "tracking your run", and leaving that claim on the lock screen while
 * nothing is recorded would be a lie.
 */
export async function pauseSession(): Promise<void> {
  const s = get()
  if (s.status !== 'tracking') return
  set({
    status: 'paused',
    accumulatedMs: elapsedMsFrom(s),
    segmentStartedAt: 0,
    // Break the trail so resuming doesn't draw / count a straight line across
    // the gap, and drop the pace window — its samples would otherwise straddle
    // the pause, measuring the paused minutes as time spent covering no ground.
    lastPoint: null,
    lastPointAt: 0,
    paceSamples: [],
  })
  await persist(true)
  await stopLocationFeed()
  log('session paused')
}

/** Restart the clock and the feed after a pause. */
export async function resumeSession(useBackground: boolean): Promise<FeedMode> {
  const s = get()
  if (s.status !== 'paused') return get().feedMode
  const now = Date.now()
  set({ status: 'tracking', segmentStartedAt: now, lastFixAt: now })
  await persist(true)
  return startLocationFeed(useBackground)
}

/**
 * Restart the feed without touching the accumulated workout — the "Retry GPS"
 * affordance after a signal loss.
 */
export async function restartFeed(useBackground: boolean): Promise<FeedMode> {
  // Only meaningful while actually recording. Restarting the feed from a paused
  // or finished session would leave the GPS (and, on Android, the foreground
  // service notification) running with `ingestLocations` dropping every fix.
  if (get().status !== 'tracking') return get().feedMode
  set({ lastFixAt: Date.now() })
  return startLocationFeed(useBackground)
}

/**
 * End the workout: settle the clock, stop the feed, drop the notification.
 *
 * The collected distance/route stay in the store — the athlete still has to rate
 * and save the session from the summary screen. {@link clearSession} is what
 * actually discards it, and it is called once the session is saved or dropped.
 */
export async function stopSession(): Promise<void> {
  const s = get()
  if (s.status === 'idle') return
  set({
    status: 'paused',
    finished: true,
    accumulatedMs: elapsedMsFrom(s),
    segmentStartedAt: 0,
  })
  await persist(true)
  await stopLocationFeed()
  const done = get()
  log(
    `session stopped: ${(done.distanceM / 1000).toFixed(3)} km · ` +
      `${Math.round(elapsedMsFrom(done) / 1000)}s · ${done.route.length} route pts`,
  )
}

/** Discard the workout entirely and clear its persisted snapshot. */
export async function clearSession(): Promise<void> {
  set({ ...EMPTY, hydrated: true })
  await stopLocationFeed()
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[liveTracking] clearing snapshot failed', err)
  }
}

/**
 * Called on cold start (and from the background task when it wakes with nothing
 * to accumulate onto): make sure we are not leaving a foreground service and its
 * notification running for a workout that no longer exists.
 */
export async function reconcileOrphanedFeed(): Promise<void> {
  await ensureHydrated()
  if (hasActiveSession(get())) return
  if (await isBackgroundFeedRunning()) {
    console.warn('[liveTracking] stopping orphaned background location task')
    await stopLocationFeed()
  }
}

/* ------------------------------------------------------------------ */
/* Permissions                                                         */
/* ------------------------------------------------------------------ */

export interface BackgroundPermissionResult {
  granted: boolean
  /**
   * True when the OS will not ask again, so the only route left is the system
   * settings screen. Android 11+ never shows an in-app dialog for "Allow all the
   * time" — it must be chosen in Settings — so this is the common answer there.
   */
  mustUseSettings: boolean
}

/**
 * Ask for "Allow all the time".
 *
 * Android 10+ requires this to be a *separate* request, made after foreground
 * location is already granted; on Android 11+ the system does not even show a
 * dialog, it only surfaces the option inside app settings. Both cases resolve to
 * `granted: false` here, which is why the caller offers a Settings shortcut
 * rather than treating refusal as a dead end.
 */
export async function requestBackgroundPermission(): Promise<BackgroundPermissionResult> {
  try {
    const current = await Location.getBackgroundPermissionsAsync()
    if (current.granted) return { granted: true, mustUseSettings: false }
    if (!current.canAskAgain) return { granted: false, mustUseSettings: true }
    const res = await Location.requestBackgroundPermissionsAsync()
    return {
      granted: res.granted,
      mustUseSettings: !res.granted && !res.canAskAgain,
    }
  } catch (err) {
    // Expo Go on Android cannot grant background location at all — the client
    // app's manifest has no ACCESS_BACKGROUND_LOCATION — and this rejects rather
    // than returning denied. Degrade to the foreground feed.
    console.warn('[liveTracking] background permission request failed', err)
    return { granted: false, mustUseSettings: Platform.OS === 'android' }
  }
}

/** Cheap read of the current background-permission state; never throws. */
export async function hasBackgroundPermission(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted
  } catch {
    return false
  }
}
