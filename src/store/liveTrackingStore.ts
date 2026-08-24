/**
 * The live-workout state machine — elapsed time, distance, route, pace window
 * and GPS quality — owned by a store rather than by the tracking screen.
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
 * ## THE ONE RULE: the session never depends on GPS
 *
 * A workout is a duration and an effort rating. sRPE training load is
 * `duration × RPE` — it needs no satellites at all. GPS only ever contributes
 * *distance* and *pace*, which are extras.
 *
 * So nothing in this module may pause, stop, or gate a session on the state of
 * the GPS. {@link elapsedMsFrom} is derived from the wall clock and knows
 * nothing about fixes; a fix that fails every filter costs distance and nothing
 * else; and a total signal blackout is reported as {@link GpsQuality} `'lost'`
 * for the UI to render as a small chip, never as a blocking state. An athlete on
 * a treadmill in a basement must still finish with a complete, saveable session.
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

/**
 * Bumped to v2 when the clock moved from a `segmentStartedAt`/`accumulatedMs`
 * pair to the `startedAt`/`pausedDurationMs` model below. A v1 snapshot has no
 * `pausedDurationMs`, so reading one would silently count every paused minute as
 * training time; a new key discards those instead of mis-restoring them.
 */
const STORAGE_KEY = 'forma.liveTracking.v2'

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
/* These decide what counts towards DISTANCE. None of them can affect the clock,
 * the session, or whether the UI is usable — see "THE ONE RULE" above. */

/**
 * Fixes worse than this (metres) don't contribute to distance or the route.
 *
 * A 50 m-accurate fix can sit anywhere in a 50 m circle, so two of them in a row
 * can invent ~100 m of "distance" out of nothing. Every phantom metre makes the
 * pace look faster than it is, and the wander between them makes it jump.
 * Outdoors with a clear sky a modern chip reports 3-10 m, so 25 m still accepts
 * everything usable and only rejects fixes that would lie.
 *
 * This gate is deliberately *fixed*. An earlier version relaxed it to 50 m after
 * a run of rejections, because back then a rejected fix meant a run that
 * recorded 0.00 km with no explanation. That is no longer the failure mode: the
 * clock runs regardless, the GPS chip says "GPS weak" / "GPS lost", and after a
 * minute of no signal the screen says the session is indoors and the training
 * load is still being recorded. Given the athlete is told what is happening,
 * recording *honest* distance beats recording invented distance.
 */
const MAX_ACCURACY_M = 25

/**
 * The first fixes after the countdown arrive while the chip is still locking on:
 * they are typically a coarse cell/wifi estimate that then snaps tens of metres
 * to the real position, and that snap is otherwise counted as distance run.
 * Discard them outright — they cost a couple of seconds of tracking at the start
 * line, where nobody is moving yet anyway.
 *
 * They still count as *fixes* for {@link gpsQualityFrom}, so the chip goes green
 * the moment the receiver has a lock even though the first metres are thrown
 * away.
 */
const WARMUP_FIXES = 2

/**
 * Per-sport ceiling (m/s) on the speed a single segment may imply. Anything
 * above it is a provider jump — the fused provider routinely leaps hundreds of
 * metres when it switches between a cell/wifi estimate and a satellite fix —
 * and is dropped from distance.
 *
 * 6.5 m/s (≈2:34 /km) is the running figure: fast enough that no real run
 * touches it, slow enough to catch the jumps. It is emphatically *not* safe for
 * every sport — a cyclist passes 6.5 m/s at 23 km/h and would have essentially
 * their whole ride discarded — so the ceiling is chosen per sport rather than
 * applied globally.
 */
const MAX_PLAUSIBLE_SPEED_MS: Record<SportType, number> = {
  running: 6.5,
  swimming: 3.5,
  /** 72 km/h — a descent, not a teleport. */
  cycling: 20,
  combat: 6.5,
  football: 6.5,
  gym: 6.5,
  strength: 6.5,
}

function maxSpeedFor(sport: SportType | null): number {
  return (sport && MAX_PLAUSIBLE_SPEED_MS[sport]) || 6.5
}

/**
 * Floor on the elapsed time used for the jump test, in seconds.
 *
 * This constant is the fix for a bug that zeroed out entire runs. The jump test
 * is `segment / elapsed > ceiling`, and `elapsed` used to be floored at **1
 * second** — so any segment longer than the ceiling was classified as a
 * teleport. That is fine while fixes arrive every second from a foreground
 * watcher (a runner covers ~3 m), and catastrophic as soon as they don't:
 * batched background delivery produces perfectly ordinary 25-50 m segments that
 * were *all* discarded, and because the discard branch re-anchors without
 * appending, the route froze at a single point and distance stayed at exactly
 * 0.00 km for the whole workout.
 *
 * Two changes make that impossible now: elapsed is measured from the **wall
 * clock** rather than from provider timestamps (which can collapse or repeat
 * across a batch), and the floor is small enough that it only ever guards
 * against a divide-by-zero, never against a real segment.
 */
const MIN_JUMP_DT_SEC = 0.25

/**
 * Below this segment length (m) we treat movement as GPS wander.
 *
 * Sized for the 1 Hz sampling {@link locationOptions} now asks for: at one fix a
 * second even a stationary phone drifts a metre or two between readings, and
 * summing that drift over an hour is how a run that never happened records
 * 400 m. Slow real movement is not lost, because a discarded segment does **not**
 * move the anchor — it accumulates across several fixes and lands as one segment
 * the moment it clears the threshold.
 */
const MIN_SEGMENT_M = 3

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
 * light.
 */
const STATIONARY_MAX_SEGMENT_M = 5

/**
 * Hard cap on stored route points. Past that the route is halved in resolution
 * (see `appendPoint`) so memory, render cost, the size of the AsyncStorage
 * snapshot and the saved Firestore document all stay bounded no matter how long
 * the session runs. Distance is accumulated separately, fix by fix, so thinning
 * the array costs no accuracy in the recorded total.
 */
const MAX_ROUTE_POINTS = 1000

/** How many rejected fixes to keep for diagnosis. In memory only, never saved. */
const MAX_DEBUG_REJECTS = 100

/* ---- Rolling "current pace" window ------------------------------- */

/**
 * How far back the current-pace readout looks. Long enough to ride out one bad
 * fix, short enough to react within a block or two — the same feel as Strava's
 * current pace.
 */
export const PACE_WINDOW_MS = 30_000

/** Under this much movement inside the window the pace is noise, not a pace. */
export const PACE_WINDOW_MIN_M = 30

/** No accepted movement for this long → we've stopped; show "--:--". */
export const PACE_SAMPLE_STALE_MS = 20_000

/** Slower than 30 min/km isn't a pace, it's a stall. Show "--:--" instead. */
export const PACE_MAX_SEC_PER_KM = 1_800

/* ------------------------------------------------------------------ */
/* GPS quality                                                         */
/* ------------------------------------------------------------------ */

/**
 * How well the GPS is doing *right now*. Purely a display state: nothing in this
 * module branches on it, and no value of it stops, pauses or gates anything.
 *
 * - `acquiring` — no fix yet since the session began, and we haven't waited long
 *   enough to call it hopeless.
 * - `good` — a fix in the last {@link GPS_GOOD_MAX_AGE_MS} accurate to
 *   {@link GPS_GOOD_ACCURACY_M} or better. Distance and pace are trustworthy.
 * - `weak` — we have recent fixes, but they are older or coarser than that.
 *   Distance may be under-counting (fixes past {@link MAX_ACCURACY_M} are
 *   dropped) while the clock carries on exactly as before.
 * - `lost` — nothing at all for {@link GPS_LOST_AFTER_MS}. Indoors, a tunnel, a
 *   dead receiver. Duration and RPE are unaffected, so the session is unaffected.
 */
export type GpsQuality = 'acquiring' | 'good' | 'weak' | 'lost'

/** A fix newer than this can qualify as `good`. */
export const GPS_GOOD_MAX_AGE_MS = 5_000
/** …if it is also at least this accurate. */
export const GPS_GOOD_ACCURACY_M = 20
/** A fix newer than {@link GPS_LOST_AFTER_MS} and at least this accurate is `weak`. */
export const GPS_WEAK_ACCURACY_M = 50
/** No fix at all for this long → `lost`. */
export const GPS_LOST_AFTER_MS = 15_000

/**
 * `lost` for longer than this and we stop implying the distance is coming back:
 * the screen says the session is indoors and that training load is still being
 * recorded. Measured from the last fix, so a session that never got one at all
 * (the treadmill case) reaches it a minute after the countdown.
 */
export const GPS_INDOOR_AFTER_MS = 60_000

/**
 * Classify the current signal. Pure, so the UI can call it on its own tick
 * without the store having to recompute and publish a value on every fix.
 *
 * Note the deliberate fall-through: a fix that is recent but *worse* than
 * {@link GPS_WEAK_ACCURACY_M} is still reported as `weak`, not `lost`. The chip
 * is a statement about the signal, and a 90 m fix means the radio is hearing
 * something — the athlete's actionable read ("distance may be off") is the same
 * as for a 40 m fix, and there is nothing they could usefully do differently.
 */
export function gpsQualityFrom(s: LiveTrackingState, now = Date.now()): GpsQuality {
  if (s.status === 'idle' || !s.startedAt) return 'acquiring'
  const age = now - s.lastFixAt
  if (!s.hasFix) return age > GPS_LOST_AFTER_MS ? 'lost' : 'acquiring'
  if (age > GPS_LOST_AFTER_MS) return 'lost'
  const acc = s.lastAccuracyM
  if (age <= GPS_GOOD_MAX_AGE_MS && acc != null && acc <= GPS_GOOD_ACCURACY_M) return 'good'
  return 'weak'
}

/** True once the blackout has lasted long enough to call the session indoors. */
export function isIndoorBlackout(s: LiveTrackingState, now = Date.now()): boolean {
  if (s.status !== 'tracking' || !s.startedAt) return false
  return now - s.lastFixAt > GPS_INDOOR_AFTER_MS
}

/**
 * The single value persisted on the saved session, summarising how much of the
 * workout the GPS actually covered.
 *
 * - `none` — nothing usable was recorded (indoor session, or signal never came).
 * - `good` — most fixes cleared the accuracy gate; treat the distance as real.
 * - `partial` — a route exists but a meaningful share of fixes was discarded, so
 *   the distance is a floor rather than a measurement.
 */
export type GpsQualitySummary = 'good' | 'partial' | 'none'

/** Share of fixes that must have been usable for the session to count as `good`. */
const GOOD_SUMMARY_RATIO = 0.7

export function gpsQualitySummaryFrom(s: LiveTrackingState): GpsQualitySummary {
  if (s.distanceM <= 0 || s.route.length < 2) return 'none'
  const total = s.acceptedFixes + s.discardedFixes
  if (total === 0) return 'none'
  return s.acceptedFixes / total >= GOOD_SUMMARY_RATIO ? 'good' : 'partial'
}

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
 * Volume is one line per GPS fix (~1/s), which is nothing next to what the
 * location subsystem itself logs. Flip to false once the feature has been
 * trusted on real hardware for a while.
 */
const DEBUG = true

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[liveTracking]', ...args)
}

/** One fix that did not make it into the distance total, kept for diagnosis. */
export interface RejectedFix {
  /** Wall-clock ms the fix was received. */
  at: number
  reason: 'accuracy' | 'jump'
  latitude: number
  longitude: number
  accuracyM: number | null
  /** The speed (m/s) that failed the plausibility test — `'jump'` only. */
  impliedSpeedMs?: number
}

/* ------------------------------------------------------------------ */
/* Location request options                                            */
/* ------------------------------------------------------------------ */

/**
 * Options handed to `startLocationUpdatesAsync` **and** `watchPositionAsync`.
 *
 * Typed as `LocationTaskOptions` (the superset) and passed to both calls
 * unchanged. The two extra keys — `pausesUpdatesAutomatically` and
 * `activityType` — are iOS `CLLocationManager` settings that the plain watcher
 * ignores; sharing one object is worth more than trimming them, because the
 * sampling cadence is the one knob that moves the recorded distance itself, and
 * the two feeds must agree or a run would measure differently depending on
 * whether the screen was on.
 *
 * ### Battery tradeoff (deliberate)
 *
 * - **`Accuracy.BestForNavigation`** asks for the best fix the receiver can
 *   produce, with sensor fusion on top. It is the heaviest setting there is, and
 *   it is the right one here: the 25 m gate throws away everything coarser, so a
 *   cheaper accuracy class does not save battery, it just converts fixes into
 *   rejections and under-reports the distance.
 * - **`timeInterval: 1000`, `distanceInterval: 0`** — one fix a second, no
 *   distance threshold. A distance threshold is what makes a slow or indoor
 *   athlete look stationary to the provider: with none, the stream never dries
 *   up, so {@link gpsQualityFrom} can tell "signal is fine, you are standing
 *   still" from "the radio has stopped talking to us", which are the two cases
 *   the GPS chip exists to distinguish.
 * - **`mayShowUserSettingsDialog: true`** lets Android offer to switch improved
 *   accuracy (wifi/cell scanning) on, rather than silently handing back 100 m
 *   fixes for the whole run.
 * - **`pausesUpdatesAutomatically: false`** — iOS would otherwise decide the
 *   athlete has stopped, power down the GPS and *never resume it on its own*,
 *   silently ending the run.
 * - **`activityType: Fitness`** tells CoreLocation this is a workout so it tunes
 *   its filtering for it.
 * - **Deferred updates are left off.** Batching lets Android sleep the radio
 *   between fixes, but the batch only lands when its thresholds are crossed, so
 *   a run that ends mid-batch loses its tail. Accuracy wins here; the foreground
 *   service is already keeping the process alive either way.
 *
 * Measured cost is broadly Strava-like: continuous GPS plus a foreground service
 * is on the order of 5-8% battery per hour on a modern Android phone. That is
 * the price of the feature, not a bug to tune away.
 */
function locationOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    mayShowUserSettingsDialog: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
  }
}

/**
 * Lighter options for the pre-start warm-up watcher (see `useGpsWarmup`).
 *
 * `Accuracy.High` rather than `BestForNavigation`: the job here is only to get
 * the receiver out of cold-start and give the athlete a "GPS ready" light before
 * they tap Start, and it runs while they are still standing at the door deciding
 * whether to go. A cold GPS start otherwise costs 30-60 s of the run — exactly
 * the window in which the first kilometre is measured worst.
 */
export function warmupLocationOptions(): Location.LocationOptions {
  return {
    accuracy: Location.Accuracy.High,
    timeInterval: 2000,
    distanceInterval: 0,
    mayShowUserSettingsDialog: true,
  }
}

/**
 * The Android foreground-service notification. Its presence is what stops the OS
 * from freezing the process once the screen goes off.
 *
 * ### Why the copy is this thin
 *
 * It used to be the "still tracking" indicator, and it carried that whole job in
 * a body it can never update: expo-location reads these strings once, when the
 * task is registered, and changing them means re-registering the task — which
 * tears down and rebuilds the location request (dropping fixes mid-run), and
 * which `LocationTaskConsumer.maybeStartForegroundService()` refuses outright
 * while the activity is paused, i.e. exactly when the lock screen is up.
 *
 * The metrics now live in a second, separately-managed notification that *can*
 * be updated — see `services/liveNotification.ts`. This one is demoted to what
 * it actually is: the receipt for a running service. It is pushed onto a
 * MIN-importance, SECRET-visibility channel (created by `setupTrackingChannels`
 * before this ever starts) so it sinks to the bottom of the shade and shows
 * nothing on the lock screen, leaving the rich notification to speak for FORMA.
 *
 * Tapping it still reopens the app — expo-location wires the content intent to
 * the launch intent, and `LogScreen` puts the athlete back on the tracker.
 */
const FOREGROUND_SERVICE = {
  notificationTitle: 'FORMA',
  notificationBody: 'Recording location',
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

  /* ---- The clock. Wall-clock only; see elapsedMsFrom. ---- */
  /** `Date.now()` when the workout began. Never moves. */
  startedAt: number
  /** Total ms spent paused across the whole session. */
  pausedDurationMs: number
  /** `Date.now()` the current pause began; 0 while running. */
  pausedAt: number

  /* ---- Distance, the only thing GPS feeds ---- */
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
  /** Counts down the throwaway fixes taken while the GPS receiver locks on. */
  warmupLeft: number

  /* ---- Signal quality. Display only — nothing branches on these. ---- */
  /**
   * Wall-clock ms of the last fix *received*, however bad it was.
   *
   * Deliberately not "last fix accepted": a 90 m fix does not move the distance,
   * but it does prove the radio is still delivering, and conflating the two is
   * what made the old screen announce "Searching for GPS" at an athlete whose
   * GPS was working fine and merely imprecise.
   */
  lastFixAt: number
  /** Reported accuracy (m) of that fix, or null if the provider didn't say. */
  lastAccuracyM: number | null
  /**
   * True once any fix at all has arrived this session, so the UI can tell
   * "still acquiring satellites" from "we had a lock and lost it". Deliberately
   * not reset by pause/resume — the receiver does not forget where it is.
   */
  hasFix: boolean
  /** Fixes that cleared the accuracy gate. Feeds {@link gpsQualitySummaryFrom}. */
  acceptedFixes: number
  /** Fixes dropped by the accuracy or jump filter. */
  discardedFixes: number
  /**
   * The most recent rejects, newest last, for diagnosis on a device with no
   * debugger attached. In memory only — never persisted, never saved, and
   * capped at {@link MAX_DEBUG_REJECTS}.
   */
  debugRejects: RejectedFix[]

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
  pausedDurationMs: 0,
  pausedAt: 0,
  distanceM: 0,
  route: [],
  paceSamples: [],
  lastPoint: null,
  lastPointAt: 0,
  lastStamp: 0,
  warmupLeft: 0,
  lastFixAt: 0,
  lastAccuracyM: null,
  hasFix: false,
  acceptedFixes: 0,
  discardedFixes: 0,
  debugRejects: [],
  finished: false,
  feedMode: 'none',
  hydrated: false,
}

export const useLiveTrackingStore = create<LiveTrackingState>(() => ({ ...EMPTY }))

const get = useLiveTrackingStore.getState
const set = useLiveTrackingStore.setState

/**
 * Elapsed workout milliseconds — `now - startedAt - pausedDurationMs`.
 *
 * **This function is the whole reason live tracking survives a lost signal.** It
 * reads the wall clock and the pause ledger and nothing else: no fix count, no
 * `lastFixAt`, no feed mode. A session in a basement with the GPS stone dead
 * ticks at exactly the same rate as one under an open sky, which is what makes
 * the sRPE load (duration × RPE) correct either way.
 *
 * Deriving it from the clock rather than counting ticks is also what makes
 * backgrounded time correct for free: JS timers are throttled or stopped
 * outright while the app is in the background, so anything that *counted* would
 * under-report a locked-screen run even with GPS flowing.
 */
export function elapsedMsFrom(s: LiveTrackingState, now = Date.now()): number {
  if (!s.startedAt) return 0
  // While paused the clock is frozen at the instant the pause began; the pause
  // itself is banked into pausedDurationMs when the athlete resumes.
  const end = s.pausedAt > 0 ? s.pausedAt : now
  const total = end - s.startedAt - s.pausedDurationMs
  return Number.isFinite(total) && total > 0 ? total : 0
}

/** True when there is a workout in progress that the UI should return to. */
export function hasActiveSession(s: LiveTrackingState): boolean {
  return s.status !== 'idle'
}

/* ------------------------------------------------------------------ */
/* Persistence                                                         */
/* ------------------------------------------------------------------ */

/** `debugRejects` is excluded: diagnostic noise, and no use after a restore. */
type Persisted = Omit<LiveTrackingState, 'hydrated' | 'feedMode' | 'debugRejects'>

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
      pausedDurationMs: s.pausedDurationMs,
      pausedAt: s.pausedAt,
      distanceM: s.distanceM,
      route: s.route,
      paceSamples: s.paceSamples,
      lastPoint: s.lastPoint,
      lastPointAt: s.lastPointAt,
      lastStamp: s.lastStamp,
      warmupLeft: s.warmupLeft,
      lastFixAt: s.lastFixAt,
      lastAccuracyM: s.lastAccuracyM,
      hasFix: s.hasFix,
      acceptedFixes: s.acceptedFixes,
      discardedFixes: s.discardedFixes,
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
    const status: LiveStatus = parsed.status === 'paused' ? 'paused' : 'tracking'
    const pausedAt = Number(parsed.pausedAt) || 0
    set({
      ...EMPTY,
      status,
      sport: parsed.sport ?? null,
      startedAt,
      pausedDurationMs: Number(parsed.pausedDurationMs) || 0,
      // A snapshot that claims to be paused with no pause instant would let the
      // clock run straight through the pause on the next tick; anchor it to the
      // last thing we know happened.
      pausedAt: status === 'paused' ? pausedAt || Number(parsed.lastFixAt) || startedAt : 0,
      distanceM: Number(parsed.distanceM) || 0,
      route: Array.isArray(parsed.route) ? parsed.route : [],
      paceSamples: Array.isArray(parsed.paceSamples) ? parsed.paceSamples : [],
      lastPoint: parsed.lastPoint ?? null,
      lastPointAt: Number(parsed.lastPointAt) || 0,
      lastStamp: Number(parsed.lastStamp) || 0,
      warmupLeft: Number(parsed.warmupLeft) || 0,
      lastFixAt: Number(parsed.lastFixAt) || startedAt,
      lastAccuracyM:
        parsed.lastAccuracyM != null && Number.isFinite(Number(parsed.lastAccuracyM))
          ? Number(parsed.lastAccuracyM)
          : null,
      hasFix: parsed.hasFix === true,
      acceptedFixes: Number(parsed.acceptedFixes) || 0,
      discardedFixes: Number(parsed.discardedFixes) || 0,
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

/** Push onto the capped debug ring. */
function noteReject(s: LiveTrackingState, reject: RejectedFix): RejectedFix[] {
  const next = [...s.debugRejects, reject]
  return next.length > MAX_DEBUG_REJECTS ? next.slice(next.length - MAX_DEBUG_REJECTS) : next
}

/**
 * Fold one fix into a state snapshot, applying every accuracy/plausibility
 * filter. Pure: returns a partial patch, or `null` when the fix is not a fix at
 * all (unusable coordinate, or a duplicate we have already counted).
 *
 * Split out from the store mutation so a whole background batch can be folded in
 * a single `set()` — the OS delivers backgrounded fixes in arrays, and applying
 * them one `set()` at a time would fan out that many store notifications.
 *
 * Note what this function is *not* allowed to touch: `status`, `startedAt`,
 * `pausedDurationMs`, `pausedAt`. The clock is not a function of the GPS.
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

  const accuracyM = accuracy != null && Number.isFinite(accuracy) ? accuracy : null

  // Every fix that gets this far is a *fix*, whatever the filters below decide
  // about its contribution to distance. This is what the GPS chip reads, and it
  // is why a stream of 80 m fixes now shows "GPS weak" rather than "GPS lost".
  const seen = {
    lastFixAt: receivedAt,
    lastAccuracyM: accuracyM,
    lastStamp: stamp,
    hasFix: true,
  }

  // Too imprecise to trust for distance. Recorded rather than silently dropped:
  // from the outside a rejected fix is indistinguishable from standing still.
  if (accuracyM != null && accuracyM > MAX_ACCURACY_M) {
    log(`reject: accuracy ${accuracyM.toFixed(0)}m > ${MAX_ACCURACY_M}m`)
    return {
      ...seen,
      discardedFixes: s.discardedFixes + 1,
      debugRejects: noteReject(s, {
        at: receivedAt,
        reason: 'accuracy',
        latitude,
        longitude,
        accuracyM,
      }),
    }
  }

  const accepted = { ...seen, acceptedFixes: s.acceptedFixes + 1 }

  // Warm-up: the receiver is still settling, so this position is not to be
  // trusted — and deliberately not adopted as an anchor either, or the snap from
  // the coarse first estimate to the real fix would be measured as distance
  // covered.
  if (s.warmupLeft > 0) {
    log(`warm-up: discarding fix (${s.warmupLeft} left)`)
    return { ...accepted, warmupLeft: s.warmupLeft - 1 }
  }

  const point: RoutePoint = { latitude, longitude, timestamp: stamp }
  const prev = s.lastPoint

  if (!prev) {
    // First anchor of a segment (start, or the first fix after a resume): it
    // contributes no distance, but it *does* open the pace window, so the very
    // next fix already has something to measure against.
    log('anchor: first point of segment')
    return {
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
  if (seg < MIN_SEGMENT_M) return accepted

  // Same again, but driven by the provider's own reported speed rather than by
  // segment length alone: standing at a crossing produces a stream of 3-5 m hops
  // that clear MIN_SEGMENT_M and are still pure drift.
  if (
    reportedSpeed != null &&
    Number.isFinite(reportedSpeed) &&
    reportedSpeed >= 0 &&
    reportedSpeed < STATIONARY_SPEED_MS &&
    seg < STATIONARY_MAX_SEGMENT_M
  ) {
    log(`stationary: dropping ${seg.toFixed(1)}m of drift`)
    return accepted
  }

  // Discard provider jumps (cell/wifi estimate → satellite fix), which otherwise
  // add hundreds of phantom metres in a single tick.
  //
  // The point is still adopted as the new anchor. That is not an oversight: if
  // the jump were left un-anchored, every subsequent fix would be measured
  // against a position the athlete left minutes ago and would fail the same test
  // forever — one tunnel would end distance recording for the rest of the run.
  // Re-anchoring drops the jump's metres (correct — we cannot know how far they
  // really went) and lets the trail resume from reality on the very next fix.
  //
  // Elapsed is taken from the WALL CLOCK, not from the difference of two provider
  // timestamps — see MIN_JUMP_DT_SEC for the run-destroying bug that caused.
  const ceiling = maxSpeedFor(s.sport)
  const dtSec = Math.max((receivedAt - s.lastPointAt) / 1000, MIN_JUMP_DT_SEC)
  const impliedSpeed = seg / dtSec
  if (impliedSpeed > ceiling) {
    log(
      `reject: implausible ${seg.toFixed(0)}m in ${dtSec.toFixed(1)}s ` +
        `(${impliedSpeed.toFixed(1)} m/s > ${ceiling} m/s) — re-anchoring`,
    )
    return {
      ...seen,
      discardedFixes: s.discardedFixes + 1,
      debugRejects: noteReject(s, {
        at: receivedAt,
        reason: 'jump',
        latitude,
        longitude,
        accuracyM,
        impliedSpeedMs: impliedSpeed,
      }),
      lastPoint: point,
      lastPointAt: receivedAt,
    }
  }

  const total = s.distanceM + seg
  if (!Number.isFinite(total)) {
    return { ...accepted, lastPoint: point, lastPointAt: receivedAt }
  }

  const samples = trimPaceSamples(s.paceSamples, receivedAt, PACE_WINDOW_MS)
  return {
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

/* ------------------------------------------------------------------ */
/* Ingest observer                                                     */
/* ------------------------------------------------------------------ */

/**
 * Called once after any batch that changed the store.
 *
 * ### Why a registered callback and not an import
 *
 * The one subscriber is `services/liveNotification.ts`, which redraws the
 * lock-screen notification — and that module already imports half of this one
 * (`elapsedMsFrom`, `gpsQualityFrom`, the pause/resume/stop actions). Importing
 * it back from here would close an ES module cycle that **crashes the app at
 * launch**, not merely lint badly: `liveLocationTask` pulls in this module at
 * bundle scope, this module would pull in `liveNotification`, and
 * `liveNotification`'s own module scope evaluates
 * `LOCATION_SERVICE_CHANNEL_ID` — which reads {@link LIVE_LOCATION_TASK} from a
 * module body that has not run yet. That is a temporal-dead-zone
 * `ReferenceError` behind a clean typecheck and a clean bundle.
 *
 * Inverting the dependency keeps this module free of everything to do with
 * notifications, which is also the right shape: the store publishes that
 * something changed and has no opinion about who cares.
 */
type IngestObserver = () => void

let ingestObserver: IngestObserver | null = null

/** Register (or, with `null`, clear) the post-ingest observer. */
export function setIngestObserver(observer: IngestObserver | null): void {
  ingestObserver = observer
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
  // deliberate. An earlier version wrote an explicit whitelist of keys out of
  // the folded state — and silently dropped a field that had been added to the
  // fold and forgotten here, so the filter computed the right answer and then
  // threw it away. A whitelist of state fields is a bug waiting for the next
  // field; this cannot miss one.
  let working = before
  let merged: Partial<LiveTrackingState> = {}
  let used = 0
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
    used += 1
  }

  if (used === 0) {
    log(`batch from ${source}: ${locations.length} fix(es), none usable`)
    return
  }

  set(merged)

  log(
    `batch from ${source}: ${used}/${locations.length} used · ` +
      `total ${working.distanceM.toFixed(1)}m · route ${working.route.length} pts · ` +
      `gps ${gpsQualityFrom(working, batchAt)}`,
  )
  await persist()

  // Tell whoever is listening that the numbers moved.
  //
  // This is what keeps the lock-screen notification ticking with the screen off:
  // React Native stops JS timers once the Android host pauses, so the tracking
  // screen's interval — the update path while the app is visible — is frozen at
  // exactly the moment the athlete is most likely to be reading the notification.
  // A location batch is one of the few things the OS still wakes us for, so it
  // becomes the heartbeat instead. The observer applies its own throttle; this
  // is deliberately not the place to decide how often a notification redraws.
  //
  // Wrapped because on the background path the caller is a TaskManager executor,
  // where an unhandled throw would take down the process recording the run.
  try {
    ingestObserver?.()
  } catch (err) {
    console.warn('[liveTracking] ingest observer failed', err)
  }
}

/* ------------------------------------------------------------------ */
/* Location feed lifecycle                                             */
/* ------------------------------------------------------------------ */

/** Live subscription; always running, alongside the background task. */
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
 * So now:
 *
 * - **`watchPositionAsync` always runs.** It is exactly the call that recorded
 *   distance correctly before any of this existed. While the screen is on, this
 *   alone is enough, and it is the baseline that must never regress again.
 * - **The background task runs *in addition*,** when permission allows. It is the
 *   only thing still delivering once the screen goes off and the watcher is
 *   frozen, and it brings the foreground-service notification with it.
 *
 * Overlap is free: both feeds surface the same physical fixes with the same
 * provider timestamps, and `foldLocation` de-duplicates on a strictly-increasing
 * timestamp, so a fix delivered twice is counted once. Battery cost is not
 * doubled either — the fused provider merges concurrent requests from the same
 * app and services them once, at the stricter of the two.
 *
 * **Neither failure is fatal to the session.** If both feeds fail this resolves
 * to `'none'` rather than throwing: the workout is a clock and an RPE rating,
 * and the caller shows a chip, not a dead end.
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
        // has the GPS.
        showsBackgroundLocationIndicator: true,
      })
      background = true
      log('background task started')
    } catch (err) {
      // Not fatal: losing background means losing screen-off tracking, not
      // losing the run.
      console.warn('[liveTracking] background task failed to start', err)
    }
  }

  // --- foreground watcher (always) ---
  let foreground = false
  try {
    const sub = await Location.watchPositionAsync(
      locationOptions(),
      (loc) => {
        // Deliberately not awaited: this is a native callback, and returning a
        // promise into it does nothing. ingestLocations swallows its own errors.
        void ingestLocations([loc], 'watch')
      },
      // Error handler, added precisely so a provider hiccup mid-run is a log
      // line and nothing else. The quality machine notices the missing fixes on
      // its own and the chip turns amber; there is nothing to stop and nothing
      // to tell the athlete that the chip doesn't already say.
      (reason) => {
        console.warn('[liveTracking] watcher error', reason)
      },
    )
    if (generation !== watchGeneration) {
      // Stopped while we were awaiting — nothing else holds this reference.
      sub.remove()
      return 'none'
    }
    foregroundWatch = sub
    foreground = true
    log('foreground watcher started')
  } catch (err) {
    // Swallowed, not rethrown. Starting the GPS is not a precondition for
    // recording a session — see "THE ONE RULE".
    console.warn('[liveTracking] foreground watcher failed to start', err)
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
 * The clock starts *before* the feed, and the feed's outcome cannot stop it.
 * Note there is no `throw` path any more: {@link startLocationFeed} resolves to
 * `'none'` when nothing could be started, and a GPS-less session is a perfectly
 * valid session.
 *
 * @param useBackground whether "Allow all the time" was granted.
 * @returns the feed actually established, so the UI can say what it got.
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
    pausedDurationMs: 0,
    pausedAt: 0,
    warmupLeft: WARMUP_FIXES,
    // Not a fix — `hasFix` stays false — but the instant the acquiring window
    // and the indoor countdown are measured from.
    lastFixAt: now,
    hydrated: true,
  })
  log(`session begin: sport=${sport} background=${useBackground}`)
  await persist(true)
  return startLocationFeed(useBackground)
}

/**
 * Pause the clock and the feed.
 *
 * The whole feed is torn down rather than merely ignored, so a paused workout
 * costs no battery and drops the foreground-service notification — a paused run
 * is not "tracking your run", and leaving that claim on the lock screen while
 * nothing is recorded would be a lie.
 *
 * Only ever called from the athlete's own tap. Nothing in this module pauses on
 * its own, and specifically nothing pauses because the GPS went quiet.
 */
export async function pauseSession(): Promise<void> {
  const s = get()
  if (s.status !== 'tracking') return
  set({
    status: 'paused',
    // The clock freezes here; the elapsed pause is banked on resume.
    pausedAt: Date.now(),
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
  set({
    status: 'tracking',
    // Bank the pause we just finished, then run the clock from now.
    pausedDurationMs: s.pausedDurationMs + Math.max(0, now - (s.pausedAt || now)),
    pausedAt: 0,
    lastFixAt: now,
    // Forget the pre-pause accuracy. Keeping it would let the chip read "GPS
    // good" on the strength of a reading taken before the break, for the first
    // few seconds after resuming — i.e. exactly when the feed is coming back up
    // and we in fact know nothing. Null reads as `weak` until a real fix lands.
    lastAccuracyM: null,
  })
  await persist(true)
  return startLocationFeed(useBackground)
}

/**
 * Restart the feed without touching the accumulated workout — the "Retry GPS"
 * affordance the athlete can tap next to the GPS chip.
 */
export async function restartFeed(useBackground: boolean): Promise<FeedMode> {
  // Only meaningful while actually recording. Restarting the feed from a paused
  // or finished session would leave the GPS (and, on Android, the foreground
  // service notification) running with `ingestLocations` dropping every fix.
  if (get().status !== 'tracking') return get().feedMode
  // Same reasoning as `resumeSession`: the feed is being rebuilt, so the last
  // accuracy we saw is no longer a claim we can make.
  set({ lastFixAt: Date.now(), lastAccuracyM: null })
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
    // Freeze the clock at this instant, or keep the existing freeze if the
    // athlete stopped from an already-paused state.
    pausedAt: s.pausedAt || Date.now(),
  })
  await persist(true)
  await stopLocationFeed()
  const done = get()
  log(
    `session stopped: ${(done.distanceM / 1000).toFixed(3)} km · ` +
      `${Math.round(elapsedMsFrom(done) / 1000)}s · ${done.route.length} route pts · ` +
      `gps ${gpsQualitySummaryFrom(done)} ` +
      `(${done.acceptedFixes} kept / ${done.discardedFixes} dropped)`,
  )
  if (done.debugRejects.length > 0) {
    log(`rejected fixes (last ${done.debugRejects.length})`, done.debugRejects)
  }
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
/* Permissions + pre-flight                                            */
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

/**
 * What a pre-flight check found, in the order the UI should act on it.
 *
 * `'ok'` and `'no-background'` both mean *start the session*; only the first two
 * are worth stopping for, and even those stop a session that has not begun
 * rather than interrupting one that has.
 */
export type PreflightStatus =
  /** The device's location toggle is off — offer to open location settings. */
  | 'services-off'
  /** Foreground location permission refused — offer to open app settings. */
  | 'no-foreground'
  /** Foreground held, "Allow all the time" not — start, but say what it costs. */
  | 'no-background'
  | 'ok'

export interface PreflightResult {
  status: PreflightStatus
  /** Whether the background feed can be started. */
  background: boolean
  /** True when the OS won't prompt for background again; Settings is the route. */
  backgroundBlocked: boolean
}

/**
 * Everything that has to be true before a session can record *distance*, checked
 * up front instead of failing three seconds into the countdown.
 *
 * Order matters: services first (a permission grant is meaningless with the
 * device's location toggle off), then foreground, then background. What to do
 * about each is the caller's decision — this function has no side effects beyond
 * the OS permission prompts it is asked to raise.
 *
 * @param requestBackground ask for "Allow all the time" if it isn't already held.
 */
export async function preflightLocation(requestBackground = true): Promise<PreflightResult> {
  const fail = (status: PreflightStatus): PreflightResult => ({
    status,
    background: false,
    backgroundBlocked: false,
  })

  try {
    if (!(await Location.hasServicesEnabledAsync())) return fail('services-off')
  } catch (err) {
    console.warn('[liveTracking] services check failed', err)
    return fail('services-off')
  }

  try {
    let fg = await Location.getForegroundPermissionsAsync()
    if (!fg.granted && fg.canAskAgain) fg = await Location.requestForegroundPermissionsAsync()
    if (!fg.granted) return fail('no-foreground')
  } catch (err) {
    console.warn('[liveTracking] foreground permission check failed', err)
    return fail('no-foreground')
  }

  if (await hasBackgroundPermission()) {
    return { status: 'ok', background: true, backgroundBlocked: false }
  }
  if (!requestBackground) {
    return { status: 'no-background', background: false, backgroundBlocked: false }
  }
  const { granted, mustUseSettings } = await requestBackgroundPermission()
  return {
    status: granted ? 'ok' : 'no-background',
    background: granted,
    backgroundBlocked: mustUseSettings,
  }
}
