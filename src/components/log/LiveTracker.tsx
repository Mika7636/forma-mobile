import { useEffect, useMemo, useRef, useState, type MutableRefObject } from 'react'
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeIn } from 'react-native-reanimated'
import Slider from '@react-native-community/slider'
import { formatDistanceKm } from '../../utils/formatting'
import { haptics } from '../../utils/haptics'
import * as Location from 'expo-location'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import PrimaryButton from '../ui/PrimaryButton'
import RouteMap from '../session/RouteMap'
import { COLORS } from '../../constants/theme'
import { estimateCalories } from '../../algorithms/calories'
import {
  calculateSpeed,
  formatPace,
  formatPaceValue,
  rollingPaceSecPerKm,
  isValidCoordinate,
} from '../../utils/geo'
import {
  GPS_STALE_MS,
  PACE_MAX_SEC_PER_KM,
  PACE_SAMPLE_STALE_MS,
  PACE_WINDOW_MIN_M,
  PACE_WINDOW_MS,
  beginSession,
  clearSession,
  elapsedMsFrom,
  ensureHydrated,
  hasActiveSession,
  hasBackgroundPermission,
  pauseSession,
  requestBackgroundPermission,
  restartFeed,
  resumeSession,
  stopLocationFeed,
  stopSession,
  useLiveTrackingStore,
  type FeedMode,
} from '../../store/liveTrackingStore'
import type { RoutePoint, SportType } from '../../types/session'
import type { MapRegion } from '../../utils/maps'

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

const ZONE_GREEN = '#22c55e'
const ZONE_AMBER = '#f59e0b'
const ZONE_RED = '#ef4444'

function rpeColor(rpe: number): string {
  if (rpe <= 3) return ZONE_GREEN
  if (rpe <= 7) return ZONE_AMBER
  return ZONE_RED
}

/**
 * Turn whatever expo-location rejected with into something an athlete mid-run
 * can act on. The raw messages ("Call to function 'ExpoLocation.watchPosition'
 * has been rejected") are useless on a lock screen.
 */
function gpsErrorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err ?? '')
  const lower = raw.toLowerCase()
  if (lower.includes('location services are disabled') || lower.includes('services are not enabled')) {
    return 'Location services are turned off. Switch GPS on to keep tracking.'
  }
  if (lower.includes('permission') || lower.includes('denied')) {
    return 'Location access was revoked. Re-enable it to keep tracking.'
  }
  if (lower.includes('unavailable') || lower.includes('provider')) {
    return 'GPS is unavailable right now. Your time is still being recorded.'
  }
  if (lower.includes('background')) {
    return 'Background tracking could not start. Keep the screen on to keep recording.'
  }
  return 'GPS signal lost. Your time is still being recorded.'
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
  resumeFrom,
  snapshotRef,
  onExit,
  onComplete,
}: LiveTrackerProps) {
  const [permission, requestPermission] = Location.useForegroundPermissions()

  // A recovered workout skips straight to the summary: the location feed is
  // gone, but the distance and time it collected are intact and worth saving.
  const [phase, setPhase] = useState<Phase>(resumeFrom ? 'summary' : 'ready')
  const [count, setCount] = useState(3)
  const [permissionDenied, setPermissionDenied] = useState(false)

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
  const hasFix = useLiveTrackingStore((s) => s.hasFix)

  // A recovered snapshot outranks the store: LogScreen hands it over precisely
  // because the live path is no longer trustworthy.
  const distanceM = resumeFrom ? resumeFrom.distanceM : storeDistanceM
  const route = resumeFrom ? resumeFrom.route : storeRoute
  const sessionStartedAt = resumeFrom ? resumeFrom.startedAt : storeStartedAt
  const paused = status === 'paused'

  const [elapsedSec, setElapsedSec] = useState(resumeFrom?.elapsedSec ?? 0)
  // Derived on the timer tick rather than from a re-rendered `now` timestamp —
  // see the timer effect for why that distinction matters here.
  const [gpsStale, setGpsStale] = useState(false)
  /** Non-null when GPS has failed outright: shown as a banner, tracking pauses. */
  const [gpsError, setGpsError] = useState<string | null>(null)
  /**
   * Pace over the trailing PACE_WINDOW_MS, in seconds per km, or null when
   * there isn't enough recent movement to say. Recomputed once a second on the
   * timer tick rather than per fix, so it decays while the athlete stands still
   * instead of freezing on their last moving pace.
   */
  const [currentPaceSec, setCurrentPaceSec] = useState<number | null>(null)

  // Summary inputs
  const [rpe, setRpe] = useState(6)
  const [notes, setNotes] = useState('')

  const lastMilestoneRef = useRef(0)
  /** Last whole second the tick published, so pace recomputes once per second. */
  const lastTickSecRef = useRef(-1)
  const lastRpeRef = useRef(rpe)
  /**
   * False from the moment React tears this component down. Location and
   * permission work resolves outside React's lifecycle, so a continuation can
   * land after unmount; every setState below is gated on this.
   */
  const mountedRef = useRef(true)

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
          setPhase('summary')
          return
        }
        const bg = await hasBackgroundPermission()
        if (cancelled || !mountedRef.current) return
        setBackgroundGranted(bg)
        setPhase('tracking')
      } catch (err) {
        console.warn('[LiveTracker] restore failed', err)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  /* ---- Timer + GPS-staleness ticker -------------------------------- */
  useEffect(() => {
    // A recovered snapshot is a frozen record — nothing left to tick.
    if (resumeFrom) return
    if (phase !== 'tracking' && phase !== 'summary') return

    const sync = () => {
      if (!mountedRef.current) return
      const s = useLiveTrackingStore.getState()
      // Elapsed comes off the wall clock via the store, not from counting
      // ticks. That is what makes a locked-screen run come back with the right
      // duration: JS timers are throttled (or stopped outright) in the
      // background, so a counted clock would under-report every backgrounded
      // minute even while GPS kept flowing.
      const secs = Math.floor(elapsedMsFrom(s) / 1000)
      // Both setters are usually passed *unchanged* values, so React bails out
      // of the re-render. That is the point: this fires 4× per second, and
      // storing a fresh `Date.now()` in state each time would re-render the
      // whole tracker — map included — 4× a second for the entire workout.
      setElapsedSec((prev) => (prev === secs ? prev : secs))
      setGpsStale(s.status === 'tracking' && Date.now() - s.lastFixAt > GPS_STALE_MS)

      // Rolling pace is refreshed on the second boundary, not on all four
      // ticks: that is exactly when this component re-renders anyway, so the
      // readout stays live without adding a single extra render.
      if (secs !== lastTickSecRef.current) {
        lastTickSecRef.current = secs
        const next = rollingPaceSecPerKm(s.paceSamples, Date.now(), {
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
  async function handleStart() {
    setPermissionDenied(false)
    setGpsError(null)
    try {
      let granted = permission?.granted ?? false
      if (!granted) {
        const res = await requestPermission()
        granted = res?.granted ?? false
      }
      if (!granted) {
        setPermissionDenied(true)
        haptics.warning()
        return
      }

      // Permission granted is *not* the same as GPS being usable: the user can
      // hold the permission while the device's location toggle is off, in which
      // case the location request rejects a few seconds later — mid-countdown,
      // where the failure is much harder to explain. Check up front instead.
      const servicesOn = await Location.hasServicesEnabledAsync()
      if (!servicesOn) {
        setGpsError('Location services are turned off. Switch GPS on to start tracking.')
        haptics.warning()
        return
      }

      // Already holding "Allow all the time" from a previous run: nothing to
      // explain, don't make the athlete tap through a screen they've answered.
      if (await hasBackgroundPermission()) {
        setBackgroundGranted(true)
        setPhase('countdown')
        return
      }
    } catch (err) {
      setGpsError(gpsErrorMessage(err))
      haptics.warning()
      return
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

  async function beginTracking() {
    if (!mountedRef.current) return
    setElapsedSec(0)
    setGpsStale(false)
    setGpsError(null)
    setCurrentPaceSec(null)
    lastMilestoneRef.current = 0
    lastTickSecRef.current = -1
    setPhase('tracking')
    try {
      await beginSession(sport, backgroundGranted)
    } catch (err) {
      // The session is open and the clock is running regardless — a workout with
      // no GPS is still worth recording — so surface the failure and let the
      // athlete retry rather than dropping them back to the start screen.
      if (!mountedRef.current) return
      setGpsError(gpsErrorMessage(err))
      haptics.warning()
    }
  }

  function handlePause() {
    haptics.medium()
    void pauseSession()
    setCurrentPaceSec(null)
  }

  async function handleResume() {
    haptics.medium()
    setGpsError(null)
    try {
      await resumeSession(backgroundGranted)
    } catch (err) {
      if (!mountedRef.current) return
      setGpsError(gpsErrorMessage(err))
      haptics.warning()
    }
  }

  /** Retry GPS after a signal loss without ending the workout. */
  async function handleRetryGps() {
    setGpsError(null)
    try {
      await restartFeed(backgroundGranted)
    } catch (err) {
      if (!mountedRef.current) return
      setGpsError(gpsErrorMessage(err))
      haptics.warning()
    }
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
    if (!mountedRef.current) return
    setElapsedSec(Math.floor(elapsedMsFrom(useLiveTrackingStore.getState()) / 1000))
    setPhase('summary')
  }

  function handleRpeChange(raw: number) {
    const next = Math.round(raw)
    if (next !== lastRpeRef.current) {
      lastRpeRef.current = next
      haptics.light()
      setRpe(next)
    }
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
    console.log(
      `[LiveTracker] saving: ${safeDistance.toFixed(3)} km · ${safeDuration} min · ` +
        `${safeRoute.length} route pts`,
    )
    onComplete({
      durationMinutes: safeDuration,
      rpe,
      distanceKm: safeDistance,
      notes: notes.trim() || undefined,
      routeCoordinates: safeRoute,
      averagePace: isCycling ? undefined : formatPace(finalElapsedSec, safeDistance),
      averageSpeed: isCycling ? calculateSpeed(finalElapsedSec, safeDistance) : undefined,
      startedAt: finalStartedAt || undefined,
    })
  }

  /** Throw the workout away — and with it the persisted snapshot and any feed. */
  function handleDiscard() {
    void clearSession()
    onExit()
  }

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

  const searching = phase === 'tracking' && !paused && !gpsError && (!hasFix || gpsStale)

  /* ================================================================= */
  /* Render                                                             */
  /* ================================================================= */
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.ink }} edges={['top', 'bottom']}>
      <StatusBar style="light" />

      {phase === 'ready' ? (
        <ReadyView
          sportLabel={sportLabel}
          permissionDenied={permissionDenied}
          gpsError={gpsError}
          onStart={handleStart}
          onExit={onExit}
        />
      ) : null}

      {phase === 'permission' ? (
        <BackgroundPermissionView
          blocked={backgroundBlocked}
          requesting={requestingBackground}
          onAllow={handleGrantBackground}
          onOpenSettings={() => Linking.openSettings()}
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
          searching={searching}
          gpsError={gpsError}
          feedMode={feedMode}
          onRetryGps={handleRetryGps}
          onPause={handlePause}
          onResume={handleResume}
          onStop={handleStop}
        />
      ) : null}

      {phase === 'summary' ? (
        <SummaryView
          sportLabel={sportLabel}
          clock={formatClock(elapsedSec)}
          elapsedSec={elapsedSec}
          isCycling={isCycling}
          distanceKm={distanceKm}
          pace={formatPace(elapsedSec, distanceKm)}
          speed={calculateSpeed(elapsedSec, distanceKm)}
          calories={estimateCalories(sport, elapsedSec / 60, rpe, weightKg)}
          route={route}
          rpe={rpe}
          onRpeChange={handleRpeChange}
          notes={notes}
          onNotesChange={setNotes}
          saving={saving}
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
  return (
    <View style={{ flex: 1, paddingHorizontal: 24, justifyContent: 'center' }}>
      <View
        style={{
          backgroundColor: '#1f2937',
          borderRadius: 20,
          padding: 24,
          borderWidth: 1,
          borderColor: '#374151',
        }}
      >
        <Text style={{ fontSize: 40, textAlign: 'center' }}>🔒</Text>
        <Text
          style={{
            marginTop: 10,
            fontSize: 20,
            fontWeight: '800',
            color: COLORS.white,
            textAlign: 'center',
          }}
        >
          Keep tracking with the screen off
        </Text>
        <Text
          style={{
            marginTop: 10,
            fontSize: 15,
            color: COLORS.subtle,
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
            color: COLORS.subtle,
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
          <Text style={{ color: COLORS.subtle, fontSize: 14, fontWeight: '700' }}>
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
function ReadyView({
  sportLabel,
  permissionDenied,
  gpsError,
  onStart,
  onExit,
}: {
  sportLabel: string
  permissionDenied: boolean
  gpsError: string | null
  onStart: () => void
  onExit: () => void
}) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 24 }}>
      <Pressable onPress={onExit} style={{ paddingVertical: 12, alignSelf: 'flex-start' }}>
        <Text style={{ color: COLORS.subtle, fontSize: 16, fontWeight: '600' }}>✕ Cancel</Text>
      </Pressable>

      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 15, color: COLORS.subtle, letterSpacing: 1, fontWeight: '700' }}>
          LIVE TRACKING
        </Text>
        <Text style={{ marginTop: 6, fontSize: 28, fontWeight: '800', color: COLORS.white }}>
          {sportLabel}
        </Text>

        {permissionDenied ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              marginTop: 28,
              backgroundColor: '#1f2937',
              borderRadius: 16,
              padding: 18,
              borderWidth: 1,
              borderColor: '#374151',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.white, textAlign: 'center' }}>
              📍 Location needed
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: COLORS.subtle, textAlign: 'center', lineHeight: 20 }}>
              GPS is required to track your distance, pace and route. Enable location access
              for FORMA to start a live workout.
            </Text>
            <Pressable
              onPress={() => Linking.openSettings()}
              style={{
                marginTop: 14,
                alignSelf: 'center',
                paddingVertical: 10,
                paddingHorizontal: 20,
                borderRadius: 10,
                borderWidth: 1.5,
                borderColor: COLORS.teal,
              }}
            >
              <Text style={{ color: COLORS.teal, fontWeight: '700', fontSize: 14 }}>
                Open Settings
              </Text>
            </Pressable>
          </Animated.View>
        ) : gpsError ? (
          <Animated.View
            entering={FadeIn.duration(200)}
            style={{
              marginTop: 28,
              backgroundColor: '#1f2937',
              borderRadius: 16,
              padding: 18,
              borderWidth: 1,
              borderColor: '#374151',
            }}
          >
            <Text style={{ fontSize: 16, fontWeight: '700', color: COLORS.white, textAlign: 'center' }}>
              🛰️ GPS unavailable
            </Text>
            <Text style={{ marginTop: 8, fontSize: 14, color: COLORS.subtle, textAlign: 'center', lineHeight: 20 }}>
              {gpsError}
            </Text>
          </Animated.View>
        ) : (
          <Text
            style={{
              marginTop: 16,
              fontSize: 15,
              color: COLORS.subtle,
              textAlign: 'center',
              lineHeight: 22,
              maxWidth: 300,
            }}
          >
            We'll track your distance, pace and route with GPS. Rate your effort after you finish.
          </Text>
        )}
      </View>

      <View style={{ paddingBottom: 24 }}>
        <StartButton onPress={onStart} label={permissionDenied || gpsError ? 'Try Again' : 'Start'} />
      </View>
    </View>
  )
}

function StartButton({ onPress, label }: { onPress: () => void; label: string }) {
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
        backgroundColor: COLORS.teal,
        opacity: pressed ? 0.9 : 1,
      }}
    >
      <Text style={{ color: COLORS.white, fontSize: 22, fontWeight: '800', letterSpacing: 0.5 }}>
        {label}
      </Text>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Phase: COUNTDOWN                                                    */
/* ------------------------------------------------------------------ */
function CountdownView({ count }: { count: number }) {
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.Text
        key={count}
        entering={FadeIn.duration(180)}
        style={{
          fontSize: count === 0 ? 96 : 160,
          fontWeight: '900',
          color: COLORS.teal,
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
  searching,
  gpsError,
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
  searching: boolean
  gpsError: string | null
  /** Which feed is running — decides whether the lock-screen promise holds. */
  feedMode: FeedMode
  onRetryGps: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  return (
    <View style={{ flex: 1, paddingHorizontal: 20 }}>
      {/* Timer */}
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: COLORS.subtle, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>
          {paused ? 'PAUSED' : 'ELAPSED'}
        </Text>
        <Text
          style={{
            color: COLORS.white,
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
        <Text style={{ color: COLORS.teal, fontSize: 64, fontWeight: '900', fontFamily: TIMER_FONT }}>
          {distanceKm.toFixed(2)}
        </Text>
        <Text style={{ color: COLORS.subtle, fontSize: 16, fontWeight: '700', marginTop: -4 }}>
          km
        </Text>
      </View>

      {/* GPS failed outright: say so, keep the timer running, and make it clear
          the workout is still saveable. Losing signal must never cost a run. */}
      {gpsError ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{
            marginTop: 8,
            backgroundColor: '#3f2d16',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: ZONE_AMBER,
            paddingVertical: 10,
            paddingHorizontal: 14,
          }}
        >
          <Text style={{ color: ZONE_AMBER, fontSize: 13, fontWeight: '800', textAlign: 'center' }}>
            🛰️ {gpsError}
          </Text>
          <Pressable onPress={onRetryGps} hitSlop={8} style={{ marginTop: 6, alignSelf: 'center' }}>
            <Text
              style={{
                color: COLORS.white,
                fontSize: 13,
                fontWeight: '700',
                textDecorationLine: 'underline',
              }}
            >
              Retry GPS
            </Text>
          </Pressable>
        </Animated.View>
      ) : searching ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', marginTop: 6 }}>
          <Text style={{ color: ZONE_AMBER, fontSize: 13, fontWeight: '700' }}>
            🛰️ Searching for GPS…
          </Text>
        </Animated.View>
      ) : feedMode === 'background' ? (
        // Mirrors the foreground-service notification the athlete will see on
        // their lock screen, so the promise is made on both surfaces: they can
        // pocket the phone without wondering whether it kept counting.
        <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', marginTop: 6 }}>
          <Text style={{ color: ZONE_GREEN, fontSize: 13, fontWeight: '700' }}>
            🔒 Recording with the screen off
          </Text>
        </Animated.View>
      ) : feedMode === 'foreground' && !paused ? (
        // Background permission was refused, so this run really does stop when
        // the screen does. Say it plainly rather than letting them find out at
        // the end of an hour.
        <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', marginTop: 6 }}>
          <Text style={{ color: ZONE_AMBER, fontSize: 13, fontWeight: '700' }}>
            ⚠️ Keep the screen on — background tracking is off
          </Text>
        </Animated.View>
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
          <ControlButton label="Resume" color={COLORS.teal} onPress={onResume} />
        ) : (
          <ControlButton label="Pause" color={ZONE_AMBER} onPress={onPause} />
        )}
        <View style={{ width: 12 }} />
        <ControlButton label="Stop" color={ZONE_RED} onPress={onStop} />
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
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: '#1f2937',
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
        // Both tiles stretch to the taller one; centring keeps the calories
        // figure level with the pace figure now that pace carries a sub-line.
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: COLORS.subtle, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
        <Text style={{ color: COLORS.white, fontSize: 30, fontWeight: '800', fontFamily: TIMER_FONT }}>
          {value}
        </Text>
        <Text style={{ color: COLORS.subtle, fontSize: 13, fontWeight: '600', marginLeft: 4, marginBottom: 4 }}>
          {unit}
        </Text>
      </View>
      {sub ? (
        <Text style={{ color: COLORS.subtle, fontSize: 12, fontWeight: '600', marginTop: 2 }}>
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
      <Text style={{ color: COLORS.white, fontSize: 18, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Phase: SUMMARY                                                      */
/* ------------------------------------------------------------------ */
function SummaryView({
  sportLabel,
  clock,
  elapsedSec,
  isCycling,
  distanceKm,
  pace,
  speed,
  calories,
  route,
  rpe,
  onRpeChange,
  notes,
  onNotesChange,
  saving,
  onSave,
  onDiscard,
}: {
  sportLabel: string
  clock: string
  elapsedSec: number
  isCycling: boolean
  distanceKm: number
  pace: string
  speed: number
  calories: number
  route: RoutePoint[]
  rpe: number
  onRpeChange: (v: number) => void
  notes: string
  onNotesChange: (v: string) => void
  saving: boolean
  onSave: () => void
  onDiscard: () => void
}) {
  const color = rpeColor(rpe)
  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text style={{ fontSize: 26, fontWeight: '800', color: COLORS.white }}>Workout complete</Text>
          <Pressable onPress={onDiscard} hitSlop={10}>
            <Text style={{ color: COLORS.subtle, fontSize: 22 }}>✕</Text>
          </Pressable>
        </View>
        <Text style={{ marginTop: 4, fontSize: 15, color: COLORS.subtle }}>{sportLabel}</Text>

        {elapsedSec < 60 ? (
          <Text style={{ marginTop: 10, fontSize: 13, color: ZONE_AMBER }}>
            Short session — under a minute of tracking. It'll still be saved.
          </Text>
        ) : null}

        {/* Route map */}
        <View style={{ marginTop: 16 }}>
          <RouteMap coordinates={route} height={200} showMarkers dark />
        </View>

        {/* Summary stats */}
        <View
          style={{
            marginTop: 16,
            backgroundColor: '#1f2937',
            borderRadius: 18,
            padding: 18,
          }}
        >
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            <SummaryStat label="Duration" value={clock} />
            <SummaryStat label="Distance" value={formatDistanceKm(distanceKm)} />
            <SummaryStat
              label={isCycling ? 'Avg Speed' : 'Avg Pace'}
              value={isCycling ? `${speed.toFixed(1)} km/h` : pace}
            />
            <SummaryStat label="Est. Calories" value={`🔥 ${calories} kcal`} />
          </View>
        </View>

        {/* RPE — rated AFTER the session (sRPE best practice) */}
        <View
          style={{
            marginTop: 18,
            backgroundColor: '#1f2937',
            borderRadius: 18,
            padding: 18,
          }}
        >
          <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.white }}>
            How hard was that session?
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: COLORS.subtle }}>
            Rate your effort 1–10 (best measured ~30 min post-workout).
          </Text>
          <View style={{ alignItems: 'center', marginTop: 8 }}>
            <Text style={{ fontSize: 48, fontWeight: '800', color }}>{rpe}</Text>
          </View>
          <Slider
            style={{ width: '100%', height: 44 }}
            minimumValue={1}
            maximumValue={10}
            step={1}
            value={rpe}
            onValueChange={onRpeChange}
            minimumTrackTintColor={color}
            maximumTrackTintColor="#374151"
            thumbTintColor={color}
          />
        </View>

        {/* Notes */}
        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.subtle, marginBottom: 8 }}>
            NOTES (OPTIONAL)
          </Text>
          <View
            style={{
              backgroundColor: '#1f2937',
              borderRadius: 12,
              paddingHorizontal: 14,
              paddingVertical: 4,
            }}
          >
            <TextInput
              value={notes}
              onChangeText={onNotesChange}
              multiline
              placeholder="How did it feel?"
              placeholderTextColor={COLORS.muted}
              style={{
                minHeight: 60,
                maxHeight: 100,
                fontSize: 16,
                color: COLORS.white,
                paddingTop: 10,
                textAlignVertical: 'top',
              }}
            />
          </View>
        </View>

        <View style={{ marginTop: 24 }}>
          <PrimaryButton label="Save Session" onPress={onSave} loading={saving} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}

function SummaryStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 8 }}>
      <Text style={{ color: COLORS.subtle, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ color: COLORS.white, fontSize: 20, fontWeight: '800', marginTop: 2 }}>
        {value}
      </Text>
    </View>
  )
}
