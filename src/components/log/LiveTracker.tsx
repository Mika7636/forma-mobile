import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import { Alert, AppState, Platform, Pressable, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../ui/ThemedStatusBar'
import Animated, { FadeIn } from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import PrimaryButton from '../ui/PrimaryButton'
import RouteMap from '../session/RouteMap'
import BatteryOptimizationTip from './BatteryOptimizationTip'
import GpsChip from './GpsChip'
import WorkoutSummary, { defaultWorkoutTitle } from './WorkoutSummary'
import { useGpsWarmup } from '../../hooks/useGpsWarmup'
import {
  setupTrackingChannels,
  startLiveNotification,
  stopLiveNotification,
  updateLiveNotification,
} from '../../services/liveNotification'
import { openAppSettings, openLocationSettings } from '../../utils/systemSettings'
import { estimateCalories } from '../../algorithms/calories'
import { calculateLoadScore } from '../../algorithms/sRPE'
import { detectConflicts } from '../../algorithms/conflictDetector'
import { computeElevationGain, computeSplits } from '../../algorithms/movingTime'
import { CALIBRATION_SESSION_TARGET } from '../../utils/calibration'
import { useMetrics } from '../../hooks/useMetrics'
import { useAuthStore } from '../../store/authStore'
import {
  calculateSpeed,
  formatPace,
  formatPaceValue,
  rollingPaceSecPerKm,
  isValidCoordinate,
} from '../../utils/geo'
import {
  PACE_MAX_SEC_PER_KM,
  PACE_SAMPLE_STALE_MS,
  PACE_WINDOW_MIN_M,
  PACE_WINDOW_MS,
  beginSession,
  clearSession,
  elapsedMsFrom,
  ensureHydrated,
  gpsQualityFrom,
  gpsQualitySummaryFrom,
  hasActiveSession,
  hasBackgroundPermission,
  isIndoorBlackout,
  movingTimeMsFrom,
  pauseSession,
  preflightLocation,
  requestBackgroundPermission,
  restartFeed,
  resumeSession,
  stopLocationFeed,
  stopSession,
  useLiveTrackingStore,
  type FeedMode,
  type GpsQuality,
  type GpsQualitySummary,
} from '../../store/liveTrackingStore'
import type { Conflict } from '../../types/conflict'
import type { RoutePoint, Session, SessionSplit, SportType } from '../../types/session'
import type { MapRegion } from '../../utils/maps'
import { useTheme } from '../../theme/ThemeProvider'

/** Data handed back to LogScreen when the user saves a live-tracked session. */
export interface LiveResult {
  durationMinutes: number
  rpe: number
  distanceKm: number
  notes?: string
  routeCoordinates: RoutePoint[]
  averagePace?: string
  averageSpeed?: number
  /** Epoch ms of when tracking began, so the session is timestamped to its
   *  real start rather than to whenever the summary was saved. */
  startedAt?: number
  /**
   * How much of the workout the GPS actually covered. Saved alongside the
   * session so a 45-minute treadmill run recorded as `'none'` reads as an
   * indoor session later, rather than as a run whose distance went missing.
   */
  gpsQuality?: GpsQualitySummary
  /** Athlete-editable workout name, defaulted from time of day + sport. */
  title?: string
  /** Elapsed minus established stops — the denominator average pace was computed from. */
  movingTimeMs?: number
  splits?: SessionSplit[]
  elevationGain?: number
}

/**
 * A crash-recoverable snapshot of an in-progress workout.
 *
 * Kept in a ref owned by LogScreen (writing a ref never re-renders), so if the
 * tracker's error boundary trips mid-run the collected distance and time
 * survive the remount and the athlete can still rate and save the session
 * instead of losing it.
 *
 * Note this is now the *second* line of defence. The workout itself lives in
 * `store/liveTrackingStore`, which is mirrored to AsyncStorage and survives the
 * whole JS context being killed; this ref only covers the narrower case where
 * the error boundary trips and LogScreen wants to jump the user straight to a
 * saveable summary.
 */
export interface LiveSnapshot {
  elapsedSec: number
  distanceM: number
  route: RoutePoint[]
  startedAt: number
}

interface LiveTrackerProps {
  sport: SportType
  sportLabel: string
  weightKg?: number
  /** True while LogScreen is persisting the session — drives the Save spinner. */
  saving: boolean
  /** True once the write has landed, for the Save button's checkmark beat. */
  saved?: boolean
  /** Fired when the summary is shown or left, so LogScreen can hide the tab bar. */
  onSummaryChange?: (inSummary: boolean) => void
  /** When set, mount straight into the summary with this recovered workout. */
  resumeFrom?: LiveSnapshot | null
  /** Written to on every tick/fix so a crash can be recovered from. */
  snapshotRef?: MutableRefObject<LiveSnapshot | null>
  onExit: () => void
  onComplete: (result: LiveResult) => void
}

/**
 * `permission` sits between `ready` and `countdown`: it is where we explain what
 * "Allow all the time" buys before the OS dialog appears. Asking cold, with no
 * context, is the single best way to get background location refused — and a
 * refusal here is what puts the athlete back on a run that stops at the lock
 * screen.
 */
type Phase = 'ready' | 'permission' | 'countdown' | 'tracking' | 'summary'

/** Assumed effort for the *live* calorie ticker before the athlete rates RPE. */
const LIVE_ASSUMED_RPE = 6

const KEEP_AWAKE_TAG = 'forma-live-tracker'

/** Stable style identity — a fresh object literal here would defeat RouteMap's memo. */
const MAP_FILL_STYLE = { flex: 1 } as const

const TIMER_FONT = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' })


/**
 * The pre-flight blockers, as alerts.
 *
 * These are the *only* two things that stop a session, and both do so before it
 * begins: with the device's location toggle off, or with location permission
 * refused, there is nothing to track and no prompt the app can raise from the
 * countdown that would be less confusing than this. Note neither is reachable
 * once a session is running — nothing interrupts a workout in progress.
 */
function alertServicesOff(): void {
  Alert.alert(
    'Turn on location',
    "Your device's location is switched off, so FORMA can't record distance or your route. Your time and effort would still be tracked.",
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: openLocationSettings },
    ],
  )
}

function alertPermissionDenied(): void {
  Alert.alert(
    'Location access needed',
    'FORMA needs location access to track your distance, pace and route. You can grant it in Settings → Permissions → Location.',
    [
      { text: 'Not now', style: 'cancel' },
      { text: 'Open settings', onPress: openAppSettings },
    ],
  )
}

/** Seconds → "HH:MM:SS". */
function formatClock(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600)
  const m = Math.floor((totalSeconds % 3600) / 60)
  const s = totalSeconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(h)}:${pad(m)}:${pad(s)}`
}

export default function LiveTracker({
  sport,
  sportLabel,
  weightKg,
  saving,
  saved = false,
  onSummaryChange,
  resumeFrom,
  snapshotRef,
  onExit,
  onComplete,
}: LiveTrackerProps) {
  const { colors } = useTheme()

  // A recovered workout skips straight to the summary: the location feed is
  // gone, but the distance and time it collected are intact and worth saving.
  const [phase, setPhase] = useState<Phase>(resumeFrom ? 'summary' : 'ready')
  const [count, setCount] = useState(3)
  const [starting, setStarting] = useState(false)

  /* ---- Background-permission state --------------------------------- */
  /** Whether "Allow all the time" is held, deciding which feed we start. */
  const [backgroundGranted, setBackgroundGranted] = useState(false)
  /** The OS won't ask again — the only route left is the app settings screen. */
  const [backgroundBlocked, setBackgroundBlocked] = useState(false)
  const [requestingBackground, setRequestingBackground] = useState(false)

  /* ---- The workout itself lives in the store ------------------------ */
  // Subscribed per-slice so a fix that only moves `lastFixAt` doesn't re-render
  // the map underneath the numbers.
  const storeDistanceM = useLiveTrackingStore((s) => s.distanceM)
  const storeRoute = useLiveTrackingStore((s) => s.route)
  const storeStartedAt = useLiveTrackingStore((s) => s.startedAt)
  const status = useLiveTrackingStore((s) => s.status)
  const feedMode = useLiveTrackingStore((s) => s.feedMode)

  // A recovered snapshot outranks the store: LogScreen hands it over precisely
  // because the live path is no longer trustworthy.
  const distanceM = resumeFrom ? resumeFrom.distanceM : storeDistanceM
  const route = resumeFrom ? resumeFrom.route : storeRoute
  const sessionStartedAt = resumeFrom ? resumeFrom.startedAt : storeStartedAt
  const paused = status === 'paused'

  // Warm the receiver up while they're still deciding to go, and tear it down
  // the instant the countdown starts so it isn't competing with the session's
  // own feed. See useGpsWarmup for why this is worth a watcher.
  const warmupQuality = useGpsWarmup(phase === 'ready' && !resumeFrom)

  const [elapsedSec, setElapsedSec] = useState(resumeFrom?.elapsedSec ?? 0)
  /**
   * Signal quality, re-derived on the timer tick rather than published by the
   * store on every fix.
   *
   * It has to decay on a clock, not on an event: "lost" is defined by fixes
   * *not* arriving, and nothing fires when nothing happens. Reading it here also
   * keeps it out of the store's subscriber notifications, so a run of weak fixes
   * doesn't re-render the map underneath the numbers.
   */
  const [gpsQuality, setGpsQuality] = useState<GpsQuality>('acquiring')
  /** True once the blackout has lasted long enough to call it an indoor session. */
  const [indoor, setIndoor] = useState(false)
  /**
   * Pace over the trailing PACE_WINDOW_MS, in seconds per km, or null when
   * there isn't enough recent movement to say. Recomputed once a second on the
   * timer tick rather than per fix, so it decays while the athlete stands still
   * instead of freezing on their last moving pace.
   */
  const [currentPaceSec, setCurrentPaceSec] = useState<number | null>(null)

  // Summary inputs.
  //
  // `rpe` starts NULL, not at a default. sRPE is the input every downstream
  // metric is built on, and a pre-filled 6 gets accepted unthinkingly — a
  // fabricated effort rating silently corrupts load, CTL/ATL, Form and conflict
  // detection alike. Save stays disabled until the athlete actually chooses.
  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  /**
   * Moving time, frozen when the workout ends.
   *
   * Settled once rather than re-derived on render: the session is over by the
   * time the summary is on screen, so this is a fixed property of it, and
   * recomputing it against a live `Date.now()` would let the displayed figure
   * drift while the athlete sits deciding on an RPE.
   */
  const [summaryMovingMs, setSummaryMovingMs] = useState(0)
  /**
   * Distance and route as they stood when the workout ended.
   *
   * Frozen for the same reason as the clock, plus one that bites harder:
   * LogScreen clears the live-tracking store as soon as the write lands, and the
   * summary stays on screen for a beat after that to show its "Saved" state.
   * Reading the store live would blank the distance to 0.00 and flip the hero map
   * to the indoor panel in the moment the athlete is looking at their finished
   * run. A finished workout is a fixed record; the screen should render it as one.
   */
  const [summaryFrozen, setSummaryFrozen] = useState<{
    distanceM: number
    route: RoutePoint[]
  } | null>(null)

  const lastMilestoneRef = useRef(0)
  /** Last whole second the tick published, so pace recomputes once per second. */
  const lastTickSecRef = useRef(-1)
  /**
   * False from the moment React tears this component down. Location and
   * permission work resolves outside React's lifecycle, so a continuation can
   * land after unmount; every setState below is gated on this.
   */
  const mountedRef = useRef(true)

  /* ---- Data the summary's training-load block needs ------------------ */
  // Read here rather than threaded down from LogScreen: the conflict preview has
  // to be recomputed on every RPE tap, and passing five props through two
  // components to do it would couple the tracker to the log form for no gain.
  const metrics = useMetrics()
  const userId = useAuthStore((s) => s.user?.uid)
  const profile = useAuthStore((s) => s.profile)

  const isCycling = sport === 'cycling'
  const distanceKm = distanceM / 1000
  const speed = calculateSpeed(elapsedSec, distanceKm)
  const pace = formatPace(elapsedSec, distanceKm)
  // Rolling readouts. `currentPaceSec` is null until the window holds real
  // movement, so both fall back to the placeholder rather than showing a 0.
  const currentPace = formatPaceValue(currentPaceSec)
  const currentSpeed = currentPaceSec != null ? 3600 / currentPaceSec : null
  const liveCalories = estimateCalories(sport, elapsedSec / 60, LIVE_ASSUMED_RPE, weightKg)

  /* ---- Mount / unmount --------------------------------------------- */
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      deactivateKeepAwake(KEEP_AWAKE_TAG)
      // Take the live notification down with the screen — but ONLY when no
      // workout is left running.
      //
      // Unmounting is not finishing. The athlete may have switched tabs, or
      // Android may have torn the activity down with the phone in a pocket, and
      // in both cases the run is still recording through the background task.
      // Dismissing unconditionally here would rip the lock-screen readout off a
      // live workout at exactly the moment it becomes the only way to see it —
      // the same reasoning that keeps the location feed alive below.
      if (!hasActiveSession(useLiveTrackingStore.getState())) void stopLiveNotification()
      // Deliberately NOT stopping the feed when a workout is in progress.
      // Unmounting is not the same as finishing — the athlete may have switched
      // tabs, or Android may have torn the activity down with the phone in a
      // pocket — and killing the background service here would reintroduce the
      // exact bug this feature exists to fix. A workout that really ended has
      // already had its feed stopped by `stopSession`/`clearSession`; anything
      // still running is picked up again by the restore effect below, and by
      // `reconcileLiveTrackingOnStart` on the next cold start.
      if (!hasActiveSession(useLiveTrackingStore.getState())) void stopLocationFeed()
    }
  }, [])

  /* ---- Restore an in-flight workout -------------------------------- */
  // The screen-off case this whole feature is about: FORMA may have been
  // backgrounded (React tree intact, store still populated) or killed outright
  // and relaunched by the OS to deliver GPS batches (store rebuilt from
  // AsyncStorage). Either way, if a workout is open we drop straight into it
  // rather than showing the athlete a "Start" button for a run already running.
  useEffect(() => {
    if (resumeFrom) {
      // A recovered snapshot means we're going to the summary, so nothing should
      // still be recording.
      void stopLocationFeed()
      return
    }
    let cancelled = false
    void (async () => {
      try {
        await ensureHydrated()
        if (cancelled || !mountedRef.current) return
        const live = useLiveTrackingStore.getState()
        if (!hasActiveSession(live)) return
        // Stopped but not yet saved → back to the summary, not to a run the
        // athlete already finished.
        if (live.finished) {
          // Reachable after Stop was tapped from the notification itself. The
          // workout is over, so nothing should still be counting in the shade.
          void stopLiveNotification()
          setSummaryMovingMs(movingTimeMsFrom(live))
          setSummaryFrozen({ distanceM: live.distanceM, route: live.route })
          setPhase('summary')
          return
        }
        const bg = await hasBackgroundPermission()
        if (cancelled || !mountedRef.current) return
        setBackgroundGranted(bg)
        setPhase('tracking')
        // The JS context may have been killed and rebuilt by the OS to deliver a
        // GPS batch, taking the notification's in-memory state with it. Re-present
        // it: the identifier is fixed, so this replaces whatever is in the shade
        // rather than stacking a second one.
        void startLiveNotification(sportLabel)
      } catch (err) {
        console.warn('[LiveTracker] restore failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- Timer + GPS-quality ticker ----------------------------------- */
  //
  // **The timer does not depend on the GPS in any way.** This interval reads the
  // wall clock through the store and publishes a second count; the GPS quality
  // it publishes alongside is a display value that nothing here branches on.
  // There is no path from a missing fix to a stopped clock, a paused session, or
  // a blocked screen — that was the bug, and this is where it would have to
  // reappear for it to come back.
  useEffect(() => {
    // A recovered snapshot is a frozen record — nothing left to tick.
    if (resumeFrom) return
    if (phase !== 'tracking' && phase !== 'summary') return

    const sync = () => {
      if (!mountedRef.current) return
      const s = useLiveTrackingStore.getState()
      const now = Date.now()
      // Elapsed comes off the wall clock via the store, not from counting
      // ticks. That is what makes a locked-screen run come back with the right
      // duration: JS timers are throttled (or stopped outright) in the
      // background, so a counted clock would under-report every backgrounded
      // minute even while GPS kept flowing.
      const secs = Math.floor(elapsedMsFrom(s, now) / 1000)
      // Every setter here is usually passed an *unchanged* value, so React bails
      // out of the re-render. That is the point: this fires 4× per second, and
      // storing a fresh `Date.now()` in state each time would re-render the
      // whole tracker — map included — 4× a second for the entire workout.
      setElapsedSec((prev) => (prev === secs ? prev : secs))

      const quality = gpsQualityFrom(s, now)
      setGpsQuality((prev) => (prev === quality ? prev : quality))
      const dark = isIndoorBlackout(s, now)
      setIndoor((prev) => (prev === dark ? prev : dark))

      // Rolling pace is refreshed on the second boundary, not on all four
      // ticks: that is exactly when this component re-renders anyway, so the
      // readout stays live without adding a single extra render.
      if (secs !== lastTickSecRef.current) {
        lastTickSecRef.current = secs
        const next = rollingPaceSecPerKm(s.paceSamples, now, {
          windowMs: PACE_WINDOW_MS,
          minDistanceM: PACE_WINDOW_MIN_M,
          staleMs: PACE_SAMPLE_STALE_MS,
          maxSecPerKm: PACE_MAX_SEC_PER_KM,
        })
        // Quantise to whole seconds/km before comparing: the raw figure drifts
        // by fractions every tick, and storing that would re-render on every
        // one of them for a change the display can't even show.
        const rounded = next == null ? null : Math.round(next)
        setCurrentPaceSec((prev) => (prev === rounded ? prev : rounded))
      }
    }

    sync()
    // Paused, or sitting on the summary: the numbers are settled, so one sync is
    // the whole job and an interval would just burn renders.
    if (phase !== 'tracking' || status !== 'tracking') return

    // Sub-second polling so the displayed second flips close to its real
    // boundary; a 1s interval would visibly skip or repeat seconds as it slips.
    const id = setInterval(sync, 250)
    // Coming back from the lock screen, the interval has been throttled for
    // however long the phone was away and the on-screen numbers are stale for up
    // to a quarter-second. Cheap to just redraw them the instant we're visible —
    // this is the moment the athlete is checking whether the run kept recording.
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync()
    })
    return () => {
      clearInterval(id)
      appStateSub.remove()
    }
  }, [phase, status, resumeFrom])

  /* ---- Keep the screen awake while active -------------------------- */
  // Still worth doing even now that backgrounding is survivable: it stops the
  // display sleeping while the athlete is actually looking at it mid-run.
  useEffect(() => {
    if (phase === 'countdown' || phase === 'tracking') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG)
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG)
      }
    }
  }, [phase])

  /* ---- Re-check background permission after a trip to Settings ------ */
  useEffect(() => {
    if (phase !== 'permission') return
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return
      void hasBackgroundPermission().then((ok) => {
        if (!ok || !mountedRef.current) return
        setBackgroundGranted(true)
        haptics.success()
        setPhase('countdown')
      })
    })
    return () => sub.remove()
  }, [phase])

  /* ---- Countdown 3…2…1…Go! ----------------------------------------- */
  useEffect(() => {
    if (phase !== 'countdown') return
    const timers: ReturnType<typeof setTimeout>[] = []
    setCount(3)
    haptics.medium()
    timers.push(
      setTimeout(() => {
        setCount(2)
        haptics.medium()
      }, 1000),
    )
    timers.push(
      setTimeout(() => {
        setCount(1)
        haptics.medium()
      }, 2000),
    )
    timers.push(
      setTimeout(() => {
        setCount(0) // renders "Go!"
        haptics.success()
      }, 3000),
    )
    timers.push(
      setTimeout(() => {
        // `void` is deliberate: beginTracking is async, and an un-awaited
        // rejection from a bare `setTimeout(beginTracking)` is an unhandled
        // promise rejection — fatal in a release build. beginTracking swallows
        // its own errors, so this is now belt and braces.
        void beginTracking()
      }, 3600),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  /* ---- Crash-recovery snapshot ------------------------------------- */
  // Mirrors the workout into a ref the parent owns, so an error boundary trip
  // (or any remount) doesn't take the collected data with it. A ref write is
  // not a state update, so this costs nothing per render.
  useEffect(() => {
    if (!snapshotRef) return
    if (phase !== 'tracking' && phase !== 'summary') {
      snapshotRef.current = null
      return
    }
    snapshotRef.current = {
      elapsedSec,
      distanceM,
      route,
      startedAt: sessionStartedAt,
    }
  }, [snapshotRef, phase, elapsedSec, distanceM, route, sessionStartedAt])

  /* ---- Mirror the on-screen numbers into the notification ---------- */
  //
  // Driven by the rendered values rather than from inside the timer tick, and
  // that is the point: whatever this component is showing is, by construction,
  // exactly what goes to the shade. There is no second derivation of elapsed
  // time, distance or pace that could drift from the screen — `elapsedSec` is
  // already the store's `elapsedMsFrom` floored to a second, and `gpsQuality` is
  // already `gpsQualityFrom`, so the notification is a projection of this render
  // and nothing more.
  //
  // These values change once a second; the service throttles the actual
  // re-present to one every two, and skips it entirely when the composed text
  // hasn't changed. Nothing here is on a location callback.
  useEffect(() => {
    if (phase !== 'tracking') return
    updateLiveNotification({
      elapsedMs: elapsedSec * 1000,
      distanceKm,
      // Cycling has no pace, so the notification carries speed with its own
      // unit rather than printing km/h under a "/km" label.
      paceStr: isCycling
        ? currentSpeed != null
          ? currentSpeed.toFixed(1)
          : '--.-'
        : currentPace.replace(' /km', ''),
      paceUnit: isCycling ? 'km/h' : '/km',
      calories: liveCalories,
      isPaused: paused,
      gpsQuality,
    })
  }, [
    phase,
    elapsedSec,
    distanceKm,
    isCycling,
    currentPace,
    currentSpeed,
    liveCalories,
    paused,
    gpsQuality,
  ])

  /* ---- Tell LogScreen when the summary is up ------------------------ */
  // The summary is a full-bleed dark page with its own sticky CTA; a white tab
  // bar under it both breaks the design and puts a second navigation target next
  // to the one action the athlete is meant to take.
  useEffect(() => {
    onSummaryChange?.(phase === 'summary')
  }, [phase, onSummaryChange])

  // Separate from the effect above so it fires only on teardown, not on every
  // phase change. Discarding a workout unmounts this component straight from the
  // summary, and a tab bar left hidden would strand the athlete on a screen with
  // no way out.
  useEffect(() => {
    return () => onSummaryChange?.(false)
  }, [onSummaryChange])

  /* ---- Default the workout title on arrival ------------------------- */
  // Seeded once, and only while empty, so it never overwrites something typed.
  useEffect(() => {
    if (phase !== 'summary') return
    setTitle((prev) => (prev.trim().length > 0 ? prev : defaultWorkoutTitle(sport, sessionStartedAt)))
  }, [phase, sport, sessionStartedAt])

  /* ---- Kilometre-milestone haptics --------------------------------- */
  useEffect(() => {
    const milestone = Math.floor(distanceKm)
    if (milestone > lastMilestoneRef.current) {
      lastMilestoneRef.current = milestone
      if (milestone > 0) {
        haptics.success()
      }
    }
  }, [distanceKm])

  /* ---- Actions ----------------------------------------------------- */
  /**
   * Pre-flight, then start.
   *
   * Everything that can go wrong with location is checked *here*, before the
   * countdown, because this is the last moment where stopping costs the athlete
   * nothing. Two outcomes stop the start — the device's location toggle being
   * off, and permission being refused — and each gets an alert with a button
   * straight to the screen that fixes it. Everything else proceeds: a run with a
   * foreground-only feed, or with no GPS at all, is still a run.
   */
  async function handleStart() {
    if (starting) return
    setStarting(true)
    try {
      // Requests foreground permission if it isn't held, and (unless already
      // granted) offers the "Allow all the time" prompt — see preflightLocation.
      // We ask for background *after* the rationale screen below, so pass false.
      const pre = await preflightLocation(false)
      if (!mountedRef.current) return

      if (pre.status === 'services-off') {
        haptics.warning()
        alertServicesOff()
        return
      }
      if (pre.status === 'no-foreground') {
        haptics.warning()
        alertPermissionDenied()
        return
      }

      // Already holding "Allow all the time" from a previous run: nothing to
      // explain, don't make the athlete tap through a screen they've answered.
      if (pre.background) {
        setBackgroundGranted(true)
        setPhase('countdown')
        return
      }
    } catch (err) {
      // preflightLocation resolves rather than rejects, but this handler is
      // fired from a Pressable — nothing awaits it, so anything that did throw
      // would be an unhandled rejection, which is fatal in a release build.
      // Falling through to the rationale screen is the right recovery: the
      // session can still start, it just won't have background permission.
      console.warn('[LiveTracker] pre-flight failed', err)
    } finally {
      if (mountedRef.current) setStarting(false)
    }
    setBackgroundGranted(false)
    setBackgroundBlocked(false)
    setPhase('permission')
  }

  /**
   * Ask for "Allow all the time" — Android 10+ insists this is a second,
   * separate request made only after foreground location is already held.
   */
  async function handleGrantBackground() {
    setRequestingBackground(true)
    // requestBackgroundPermission resolves rather than rejects, but this handler
    // is fired from a Pressable — nothing awaits it, so a rejection would be an
    // unhandled promise, which is fatal in a release build.
    const { granted, mustUseSettings } = await requestBackgroundPermission().catch(() => ({
      granted: false,
      mustUseSettings: true,
    }))
    if (!mountedRef.current) return
    setRequestingBackground(false)
    setBackgroundGranted(granted)
    if (granted) {
      haptics.success()
      setPhase('countdown')
      return
    }
    // On Android 11+ there is no in-app dialog for background location at all —
    // the OS only offers it inside app settings — so a refusal here is usually
    // "we were never asked" rather than "the user said no".
    setBackgroundBlocked(mustUseSettings)
    haptics.warning()
  }

  /** Proceed with a foreground-only feed; the tracking screen says what that costs. */
  function handleSkipBackground() {
    setBackgroundGranted(false)
    setPhase('countdown')
  }

  /**
   * Open the session. Note there is no failure path: `beginSession` starts the
   * clock first and resolves to whatever feed it managed to establish, so a
   * refused, broken or absent GPS lands us on the tracking screen with a
   * running timer and a red chip — which is exactly what should happen.
   */
  async function beginTracking() {
    if (!mountedRef.current) return
    setElapsedSec(0)
    setGpsQuality('acquiring')
    setIndoor(false)
    setCurrentPaceSec(null)
    lastMilestoneRef.current = 0
    lastTickSecRef.current = -1
    setPhase('tracking')
    // Before the feed, not after: expo-location creates its own notification
    // channel the first time the foreground service starts, and Android will not
    // let an app lower a channel's importance once it exists. Getting our
    // MIN/SECRET definition in first is the only way that notification stays out
    // of the way. Memoised, so this is a no-op after the first session.
    await setupTrackingChannels()
    await beginSession(sport, backgroundGranted)
    void startLiveNotification(sportLabel)
  }

  function handlePause() {
    haptics.medium()
    void pauseSession()
    setCurrentPaceSec(null)
  }

  function handleResume() {
    haptics.medium()
    void resumeSession(backgroundGranted)
  }

  /** Restart the feed after a signal loss, without touching the workout. */
  function handleRetryGps() {
    haptics.light()
    void restartFeed(backgroundGranted)
  }

  async function handleStop() {
    haptics.success()
    try {
      // Settles the clock, tears down the location feed and drops the foreground
      // service notification. The collected distance and route stay in the store
      // until the session is saved or discarded.
      await stopSession()
    } catch (err) {
      // Whatever went wrong tearing the feed down, the workout is still in the
      // store and the athlete must be allowed to save it — stranding them on the
      // tracking screen would cost them the run.
      console.warn('[LiveTracker] stopping the session failed', err)
    }
    // The workout is over, so the shade should stop claiming otherwise —
    // including when Stop was tapped from the notification itself and this
    // screen isn't even visible.
    void stopLiveNotification()
    if (!mountedRef.current) return
    const settled = useLiveTrackingStore.getState()
    setElapsedSec(Math.floor(elapsedMsFrom(settled) / 1000))
    setSummaryMovingMs(movingTimeMsFrom(settled))
    setSummaryFrozen({ distanceM: settled.distanceM, route: settled.route })
    setPhase('summary')
  }

  function handleRpeChange(next: number) {
    // The haptic fires inside RpeScale, next to the press it belongs to.
    setRpe(next)
  }

  function handleSave() {
    // Read the workout from the store at save time rather than from this
    // render's closure.
    //
    // The rendered values are almost always identical — but "almost" is not good
    // enough for the one irreversible step in the whole flow. A fix that lands
    // between the last commit and this tap (entirely possible: the background
    // task delivers outside React's lifecycle) would otherwise be dropped from
    // the saved session. `getState()` is by definition current.
    //
    // A recovered snapshot still wins, because LogScreen hands it over precisely
    // when the live path is no longer trustworthy.
    const live = useLiveTrackingStore.getState()
    const finalDistanceKm = resumeFrom ? resumeFrom.distanceM / 1000 : live.distanceM / 1000
    const finalRoute = resumeFrom ? resumeFrom.route : live.route
    const finalStartedAt = resumeFrom ? resumeFrom.startedAt : live.startedAt
    const finalElapsedSec = resumeFrom
      ? resumeFrom.elapsedSec
      : Math.floor(elapsedMsFrom(live) / 1000)

    // Last line of defence before anything is persisted: a NaN or out-of-range
    // value written to Firestore would corrupt every downstream metric (load,
    // CTL/ATL, charts) and crash the session-detail map on the way back in.
    //
    // Note the store is *not* cleared here. LogScreen clears it only once the
    // write has actually landed, so a failed save leaves the whole run — every
    // background-tracked metre of it — intact and retryable.
    const safeDuration = Number.isFinite(finalElapsedSec)
      ? Math.max(1, Math.round(finalElapsedSec / 60))
      : 1
    const safeDistance =
      Number.isFinite(finalDistanceKm) && finalDistanceKm > 0 ? finalDistanceKm : 0
    const safeRoute = finalRoute.filter((p) => isValidCoordinate(p.latitude, p.longitude))
    const finalMovingMs = resumeFrom
      ? resumeFrom.elapsedSec * 1000
      : movingTimeMsFrom(live)
    // A recovered snapshot carries no fix counters, so it can only be judged by
    // what it has: a route means the GPS was working, no route means it wasn't.
    const quality: GpsQualitySummary = resumeFrom
      ? safeRoute.length >= 2 && safeDistance > 0
        ? 'partial'
        : 'none'
      : gpsQualitySummaryFrom(live)
    console.log(
      `[LiveTracker] saving: ${safeDistance.toFixed(3)} km · ${safeDuration} min · ` +
        `${safeRoute.length} route pts · gps ${quality}`,
    )
    // Pace is reported over MOVING time, not elapsed. Charging every stop at a
    // crossing to the athlete's pace is what turned a genuine 8:30 /km run into
    // a reported 12:52 /km; see `algorithms/movingTime.ts`.
    const movingSec = Math.max(1, Math.round(finalMovingMs / 1000))
    onComplete({
      durationMinutes: safeDuration,
      rpe: rpe ?? 5,
      distanceKm: safeDistance,
      notes: notes.trim() || undefined,
      routeCoordinates: safeRoute,
      averagePace: isCycling ? undefined : formatPace(movingSec, safeDistance),
      averageSpeed: isCycling ? calculateSpeed(movingSec, safeDistance) : undefined,
      startedAt: finalStartedAt || undefined,
      gpsQuality: quality,
      title: title.trim() || undefined,
      movingTimeMs: finalMovingMs,
      splits: computeSplits(safeRoute),
      elevationGain: computeElevationGain(safeRoute),
    })
  }

  /** Throw the workout away — and with it the persisted snapshot and any feed. */
  function handleDiscard() {
    void clearSession()
    void stopLiveNotification()
    onExit()
  }

  /**
   * What the conflict engine would say about this session, recomputed live as
   * the RPE changes.
   *
   * The same pure `detectConflicts` the save path runs, against the same recent
   * sessions and the same profile — so the banner on this screen and the modal
   * after saving can never disagree. Empty until an effort is chosen: a conflict
   * is a function of load, and there is no load without an RPE.
   */
  const conflictPreview = useMemo<Conflict[]>(() => {
    if (phase !== 'summary' || rpe == null || !profile) return []
    const minutes = Math.max(1, Math.round(elapsedSec / 60))
    const candidate: Session = {
      id: '__preview__',
      userId: userId ?? '',
      sport,
      date: new Date(sessionStartedAt || Date.now()).toISOString(),
      durationMinutes: minutes,
      distanceKm: distanceKm > 0 ? distanceKm : undefined,
      rpe,
      loadScore: calculateLoadScore(minutes, rpe),
      createdAt: new Date().toISOString(),
    }
    try {
      return detectConflicts(candidate, metrics.sessions, profile, metrics.weeklyHours, {
        calibrating: metrics.totalSessionCount < CALIBRATION_SESSION_TARGET,
      })
    } catch (err) {
      // A preview is a nicety; the authoritative check still runs on save.
      console.warn('[LiveTracker] conflict preview failed', err)
      return []
    }
  }, [
    phase,
    rpe,
    profile,
    userId,
    sport,
    sessionStartedAt,
    elapsedSec,
    distanceKm,
    metrics.sessions,
    metrics.weeklyHours,
    metrics.totalSessionCount,
  ])

  // Live follow-cam region: keep the latest fix centred with a tight zoom.
  const liveRegion = useMemo<MapRegion | undefined>(() => {
    const last = route[route.length - 1]
    if (!last || !isValidCoordinate(last.latitude, last.longitude)) return undefined
    return {
      latitude: last.latitude,
      longitude: last.longitude,
      latitudeDelta: 0.006,
      longitudeDelta: 0.006,
    }
  }, [route])

  /* ================================================================= */
  /* Render                                                             */
  /* ================================================================= */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ThemedStatusBar />

      {phase === 'ready' ? (
        <ReadyView
          sportLabel={sportLabel}
          warmupQuality={warmupQuality}
          starting={starting}
          onStart={handleStart}
          onExit={onExit}
        />
      ) : null}

      {phase === 'permission' ? (
        <BackgroundPermissionView
          blocked={backgroundBlocked}
          requesting={requestingBackground}
          onAllow={handleGrantBackground}
          onOpenSettings={openAppSettings}
          onSkip={handleSkipBackground}
        />
      ) : null}

      {phase === 'countdown' ? <CountdownView count={count} /> : null}

      {phase === 'tracking' ? (
        <TrackingView
          clock={formatClock(elapsedSec)}
          isCycling={isCycling}
          distanceKm={distanceKm}
          pace={pace}
          speed={speed}
          currentPace={currentPace}
          currentSpeed={currentSpeed}
          calories={liveCalories}
          route={route}
          liveRegion={liveRegion}
          paused={paused}
          gpsQuality={gpsQuality}
          indoor={indoor}
          feedMode={feedMode}
          onRetryGps={handleRetryGps}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
        />
      ) : null}

      {phase === 'summary' ? (
        <WorkoutSummary
          sport={sport}
          sportLabel={sportLabel}
          elapsedMs={elapsedSec * 1000}
          movingTimeMs={summaryMovingMs}
          distanceKm={(summaryFrozen?.distanceM ?? distanceM) / 1000}
          route={summaryFrozen?.route ?? route}
          startedAt={sessionStartedAt}
          weightKg={weightKg}
          currentForm={metrics.formScore}
          conflicts={conflictPreview}
          title={title}
          onTitleChange={setTitle}
          rpe={rpe}
          onRpeChange={handleRpeChange}
          notes={notes}
          onNotesChange={setNotes}
          saving={saving}
          saved={saved}
          onSave={handleSave}
          onDiscard={handleDiscard}
        />
      ) : null}
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Phase: PERMISSION                                                   */
/* ------------------------------------------------------------------ */
/**
 * The background-location rationale, shown once before the OS dialog.
 *
 * Android deliberately makes "Allow all the time" hard to get: from Android 11
 * the system refuses to show an in-app dialog for it at all and only offers it
 * on the app's settings page, and it revokes the grant on its own if the app
 * goes unused. An app that asks cold, with no explanation, mostly gets refused —
 * so this screen exists to make the trade obvious *before* the system UI appears,
 * and to hand the athlete a working run either way.
 */
function BackgroundPermissionView({
  blocked,
  requesting,
  onAllow,
  onOpenSettings,
  onSkip,
}: {
  /** The OS won't prompt again; the settings screen is the only route. */
  blocked: boolean
  requesting: boolean
  onAllow: () => void
  onOpenSettings: () => void
  onSkip: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
      <View
        style={{
          backgroundColor: colors.surfaceAlt,
          borderRadius: 20,
          padding: 24,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: 40, textAlign: 'center' }}>🔒</Text>
        <Text
          style={{
            marginTop: 10,
            fontSize: 20,
            fontWeight: '800',
            color: colors.onAccent,
            textAlign: 'center',
          }}
        >
          Keep tracking with the screen off
        </Text>
        <Text
          style={{
            marginTop: 10,
            fontSize: 15,
            color: colors.textSubtle,
            textAlign: 'center',
            lineHeight: 21,
          }}
        >
          FORMA needs to track your route even when the screen is off. Nobody watches their
          phone while running — without this, your distance stops the moment you pocket it.
        </Text>
        <Text
          style={{
            marginTop: 12,
            fontSize: 14,
            color: colors.textSubtle,
            textAlign: 'center',
            lineHeight: 20,
          }}
        >
          {blocked
            ? 'Android only offers this on FORMA’s settings page. Choose Permissions → Location → Allow all the time.'
            : 'Choose “Allow all the time” on the next screen. FORMA only uses your location while a workout is recording.'}
        </Text>

        <View style={{ marginTop: 20 }}>
          <PrimaryButton
            label={blocked ? 'Open Settings' : 'Allow background tracking'}
            onPress={blocked ? onOpenSettings : onAllow}
            loading={requesting}
          />
        </View>

        <Pressable
          onPress={onSkip}
          hitSlop={8}
          style={{ marginTop: 16, alignSelf: 'center', paddingVertical: 6 }}
        >
          <Text style={{ color: colors.textSubtle, fontSize: 14, fontWeight: '700' }}>
            Not now — keep the screen on
          </Text>
        </Pressable>
      </View>
    </View>
  )
}


/* ------------------------------------------------------------------ */
/* Phase: READY                                                        */
/* ------------------------------------------------------------------ */
/**
 * The pre-start screen, and the place the GPS warm-up lives.
 *
 * Nothing here blocks Start. The warm-up chip is information — "wait five more
 * seconds if you want a clean first kilometre" — not a gate: an athlete who taps
 * Start on a grey chip gets a session with a running clock and a red chip, which
 * is a perfectly good indoor workout.
 */
function ReadyView({
  sportLabel,
  warmupQuality,
  starting,
  onStart,
  onExit,
}: {
  sportLabel: string
  /** Live from the warm-up watcher; same colours as the in-run chip. */
  warmupQuality: GpsQuality
  /** Pre-flight checks (and any permission prompt) are in flight. */
  starting: boolean
  onStart: () => void
  onExit: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, paddingHorizontal: 24 }}>
      <Pressable onPress={onExit} style={{ paddingVertical: 12, alignSelf: 'flex-start' }}>
        <Text style={{ color: colors.textSubtle, fontSize: 16, fontWeight: '600' }}>✕ Cancel</Text>
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, color: colors.textSubtle, letterSpacing: 1, fontWeight: '700' }}>
          LIVE TRACKING
        </Text>
        <Text style={{ marginTop: 6, fontSize: 28, fontWeight: '800', color: colors.onAccent }}>
          {sportLabel}
        </Text>

        <View style={{ marginTop: 18 }}>
          <GpsChip quality={warmupQuality} variant="warmup" />
        </View>

        <Text
          style={{
            marginTop: 14,
            fontSize: 15,
            color: colors.textSubtle,
            textAlign: 'center',
            lineHeight: 22,
            maxWidth: 300,
          }}
        >
          {warmupQuality === 'good'
            ? "Distance, pace and route are ready to record. Rate your effort after you finish."
            : "You can start any time — your time and effort are always recorded. Distance needs a GPS lock."}
        </Text>

        {/* Android only, once ever. See BatteryOptimizationTip. */}
        <BatteryOptimizationTip />
      </View>

      <View style={{ paddingBottom: 24 }}>
        <StartButton onPress={onStart} label={starting ? 'Checking…' : 'Start'} />
      </View>
    </View>
  )
}

function StartButton({ onPress, label }: { onPress: () => void; label: string }) {
  const { colors } = useTheme()

  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      onPress={() => {
        haptics.medium()
        onPress()
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        height: 64,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: colors.accent,
        opacity: pressed ? 0.9 : 1,
      }}
    >
      <Text style={{ color: colors.onAccent, fontSize: 22, fontWeight: '800', letterSpacing: 0.5 }}>
        {label}
      </Text>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Phase: COUNTDOWN                                                    */
/* ------------------------------------------------------------------ */
function CountdownView({ count }: { count: number }) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text
        key={count}
        entering={FadeIn.duration(180)}
        style={{
          fontSize: count === 0 ? 96 : 160,
          fontWeight: '900',
          color: colors.accent,
          fontFamily: TIMER_FONT,
        }}
      >
        {count === 0 ? 'Go!' : count}
      </Animated.Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Phase: TRACKING                                                     */
/* ------------------------------------------------------------------ */
function TrackingView({
  clock,
  isCycling,
  distanceKm,
  pace,
  speed,
  currentPace,
  currentSpeed,
  calories,
  route,
  liveRegion,
  paused,
  gpsQuality,
  indoor,
  feedMode,
  onRetryGps,
  onPause,
  onResume,
  onStop,
}: {
  clock: string
  isCycling: boolean
  distanceKm: number
  /** Session average, over total distance and total time. */
  pace: string
  speed: number
  /** Rolling readout over the last PACE_WINDOW_MS — "--:-- /km" when unknown. */
  currentPace: string
  /** Same window, expressed as km/h for cycling; null when unknown. */
  currentSpeed: number | null
  calories: number
  route: RoutePoint[]
  liveRegion: MapRegion | undefined
  paused: boolean
  /** Signal state. Rendered as a chip; never gates anything on this screen. */
  gpsQuality: GpsQuality
  /** Blackout has lasted long enough to call the session indoors. */
  indoor: boolean
  /** Which feed is running — decides whether the lock-screen promise holds. */
  feedMode: FeedMode
  onRetryGps: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, paddingHorizontal: 20 }}>
      {/* Timer */}
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: colors.textSubtle, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>
          {paused ? 'PAUSED' : 'ELAPSED'}
        </Text>
        <Text
          style={{
            color: colors.onAccent,
            fontSize: 56,
            fontWeight: '800',
            fontFamily: TIMER_FONT,
            marginTop: 2,
          }}
        >
          {clock}
        </Text>
      </View>

      {/* Primary metric: distance */}
      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <Text style={{ color: colors.accent, fontSize: 64, fontWeight: '900', fontFamily: TIMER_FONT }}>
          {distanceKm.toFixed(2)}
        </Text>
        <Text style={{ color: colors.textSubtle, fontSize: 16, fontWeight: '700', marginTop: -4 }}>
          km
        </Text>
      </View>

      {/* GPS status, and nothing more.
          This is the whole of what a lost signal is allowed to do to this
          screen: a small chip under the distance figure. It covers nothing,
          blocks nothing, and stops nothing. The timer above it and the Stop
          button below it behave identically at every quality level.
          Hidden while paused, where the feed is deliberately off and a signal
          reading would be stale by construction. */}
      {!paused ? (
        <View style={{ marginTop: 8, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <GpsChip quality={gpsQuality} />
            {gpsQuality === 'lost' ? (
              // Offered, never forced: restarting the feed occasionally shakes a
              // wedged provider loose, and it costs the athlete nothing to
              // ignore it.
              <Pressable onPress={onRetryGps} hitSlop={10} style={{ marginLeft: 10 }}>
                <Text
                  style={{
                    color: colors.textSubtle,
                    fontSize: 12,
                    fontWeight: '700',
                    textDecorationLine: 'underline',
                  }}
                >
                  Retry
                </Text>
              </Pressable>
            ) : null}
          </View>

          {/* A minute of nothing means this is almost certainly an indoor
              session. Say what is and isn't being recorded, in one line, and
              accurately: sRPE load is duration × RPE, so the session's actual
              training value is completely intact without a single fix. */}
          {indoor ? (
            <Animated.Text
              entering={FadeIn.duration(200)}
              style={{
                marginTop: 6,
                color: colors.textSubtle,
                fontSize: 12,
                fontWeight: '600',
                textAlign: 'center',
              }}
            >
              Indoor session — distance unavailable, training load still tracked.
            </Animated.Text>
          ) : feedMode === 'foreground' ? (
            // Background permission was refused, so this run really does stop
            // when the screen does. Say it plainly rather than letting them find
            // out at the end of an hour.
            <Text
              style={{ marginTop: 6, color: colors.warn, fontSize: 12, fontWeight: '600' }}
            >
              Keep the screen on — background tracking is off
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Secondary metrics. The headline figure is the *rolling* one — it's
          what tells you whether you're going too hard right now — with the
          session average underneath it for context, the way Strava splits the
          two. Keeping the average as a sub-line rather than a third tile leaves
          the numbers legible on a narrow screen at arm's length. */}
      <View style={{ flexDirection: 'row', marginTop: 18 }}>
        <Metric
          label={isCycling ? 'SPEED' : 'PACE'}
          value={
            isCycling
              ? currentSpeed != null
                ? currentSpeed.toFixed(1)
                : '--.-'
              : currentPace.replace(' /km', '')
          }
          unit={isCycling ? 'km/h' : '/km'}
          sub={isCycling ? `avg ${speed.toFixed(1)} km/h` : `avg ${pace}`}
        />
        <Metric label="EST. CALORIES" value={`${calories}`} unit="kcal" />
      </View>

      {/* Live route map */}
      <View style={{ flex: 1, marginTop: 18, marginBottom: 14 }}>
        {/* `style` flex overrides RouteMap's default fixed height on the main axis. */}
        <RouteMap
          coordinates={route}
          region={liveRegion}
          showMarkers={false}
          dark
          style={MAP_FILL_STYLE}
        />
      </View>

      {/* Controls */}
      <View style={{ flexDirection: 'row', paddingBottom: 12 }}>
        {paused ? (
          <ControlButton label="Resume" color={colors.accent} onPress={onResume} />
        ) : (
          <ControlButton label="Pause" color={colors.warn} onPress={onPause} />
        )}
        <View style={{ width: 12 }} />
        <ControlButton label="Stop" color={colors.danger} onPress={onStop} />
      </View>
    </View>
  )
}

function Metric({
  label,
  value,
  unit,
  sub,
}: {
  label: string
  value: string
  unit: string
  /** Optional smaller line beneath the figure, e.g. the session average. */
  sub?: string
}) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: colors.surfaceAlt,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
        // Both tiles stretch to the taller one; centring keeps the calories
        // figure level with the pace figure now that pace carries a sub-line.
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.textSubtle, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
        <Text style={{ color: colors.onAccent, fontSize: 30, fontWeight: '800', fontFamily: TIMER_FONT }}>
          {value}
        </Text>
        <Text style={{ color: colors.textSubtle, fontSize: 13, fontWeight: '600', marginLeft: 4, marginBottom: 4 }}>
          {unit}
        </Text>
      </View>
      {sub ? (
        <Text style={{ color: colors.textSubtle, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
          {sub}
        </Text>
      ) : null}
    </View>
  )
}

function ControlButton({
  label,
  color,
  onPress,
}: {
  label: string
  color: string
  onPress: () => void
}) {
  const { colors } = useTheme()

  const [pressed, setPressed] = useState(false)
  return (
    <Pressable
      onPress={() => {
        haptics.medium()
        onPress()
      }}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flex: 1,
        height: 58,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: color,
        opacity: pressed ? 0.85 : 1,
      }}
    >
      <Text style={{ color: colors.onAccent, fontSize: 18, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  )
}
