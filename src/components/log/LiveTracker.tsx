// Live GPS tracking screen: map, live stats and session controls.

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
import type { SportOption } from '../../constants/training'
import { useTheme } from '../../theme/ThemeProvider'
import { onColor } from '../../theme/tokens'

export interface LiveResult {
  durationMinutes: number
  rpe: number
  distanceKm: number
  notes?: string
  routeCoordinates: RoutePoint[]
  averagePace?: string
  averageSpeed?: number
  startedAt?: number
  gpsQuality?: GpsQualitySummary
  title?: string
  movingTimeMs?: number
  splits?: SessionSplit[]
  elevationGain?: number
}

export interface LiveSnapshot {
  elapsedSec: number
  distanceM: number
  route: RoutePoint[]
  startedAt: number
}

interface LiveTrackerProps {
  sport: SportType
  sportLabel: string
  sportOptions: SportOption[]
  onSportChange: (value: SportType) => void
  weightKg?: number
  saving: boolean
  saved?: boolean
  onSummaryChange?: (inSummary: boolean) => void
  resumeFrom?: LiveSnapshot | null
  snapshotRef?: MutableRefObject<LiveSnapshot | null>
  onExit: () => void
  onComplete: (result: LiveResult) => void
}

type Phase = 'ready' | 'permission' | 'countdown' | 'tracking' | 'summary'

const LIVE_ASSUMED_RPE = 6

const KEEP_AWAKE_TAG = 'forma-live-tracker'

const MAP_FILL_STYLE = { flex: 1 } as const

const TIMER_FONT = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' })


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
  sportOptions,
  onSportChange,
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

  const [phase, setPhase] = useState<Phase>(resumeFrom ? 'summary' : 'ready')
  const [count, setCount] = useState(3)
  const [starting, setStarting] = useState(false)

  const [backgroundGranted, setBackgroundGranted] = useState(false)
  const [backgroundBlocked, setBackgroundBlocked] = useState(false)
  const [requestingBackground, setRequestingBackground] = useState(false)

  const storeDistanceM = useLiveTrackingStore((s) => s.distanceM)
  const storeRoute = useLiveTrackingStore((s) => s.route)
  const storeStartedAt = useLiveTrackingStore((s) => s.startedAt)
  const status = useLiveTrackingStore((s) => s.status)
  const feedMode = useLiveTrackingStore((s) => s.feedMode)

  const distanceM = resumeFrom ? resumeFrom.distanceM : storeDistanceM
  const route = resumeFrom ? resumeFrom.route : storeRoute
  const sessionStartedAt = resumeFrom ? resumeFrom.startedAt : storeStartedAt
  const paused = status === 'paused'

  const warmupQuality = useGpsWarmup(phase === 'ready' && !resumeFrom)

  const [elapsedSec, setElapsedSec] = useState(resumeFrom?.elapsedSec ?? 0)
  const [gpsQuality, setGpsQuality] = useState<GpsQuality>('acquiring')
  const [indoor, setIndoor] = useState(false)
  const [currentPaceSec, setCurrentPaceSec] = useState<number | null>(null)

  const [rpe, setRpe] = useState<number | null>(null)
  const [notes, setNotes] = useState('')
  const [title, setTitle] = useState('')
  const [summaryMovingMs, setSummaryMovingMs] = useState(0)
  const [summaryFrozen, setSummaryFrozen] = useState<{
    distanceM: number
    route: RoutePoint[]
  } | null>(null)

  const lastMilestoneRef = useRef(0)
  const lastTickSecRef = useRef(-1)
  const mountedRef = useRef(true)

  const metrics = useMetrics()
  const userId = useAuthStore((s) => s.user?.uid)
  const profile = useAuthStore((s) => s.profile)

  const isCycling = sport === 'cycling'
  const distanceKm = distanceM / 1000
  const speed = calculateSpeed(elapsedSec, distanceKm)
  const pace = formatPace(elapsedSec, distanceKm)
  const currentPace = formatPaceValue(currentPaceSec)
  const currentSpeed = currentPaceSec != null ? 3600 / currentPaceSec : null
  const liveCalories = estimateCalories(sport, elapsedSec / 60, LIVE_ASSUMED_RPE, weightKg)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      deactivateKeepAwake(KEEP_AWAKE_TAG)
      if (!hasActiveSession(useLiveTrackingStore.getState())) void stopLiveNotification()
      if (!hasActiveSession(useLiveTrackingStore.getState())) void stopLocationFeed()
    }
  }, [])

  useEffect(() => {
    if (resumeFrom) {
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
        if (live.finished) {
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

  useEffect(() => {
    if (resumeFrom) return
    if (phase !== 'tracking' && phase !== 'summary') return

    const sync = () => {
      if (!mountedRef.current) return
      const s = useLiveTrackingStore.getState()
      const now = Date.now()
      const secs = Math.floor(elapsedMsFrom(s, now) / 1000)
      setElapsedSec((prev) => (prev === secs ? prev : secs))

      const quality = gpsQualityFrom(s, now)
      setGpsQuality((prev) => (prev === quality ? prev : quality))
      const dark = isIndoorBlackout(s, now)
      setIndoor((prev) => (prev === dark ? prev : dark))

      if (secs !== lastTickSecRef.current) {
        lastTickSecRef.current = secs
        const next = rollingPaceSecPerKm(s.paceSamples, now, {
          windowMs: PACE_WINDOW_MS,
          minDistanceM: PACE_WINDOW_MIN_M,
          staleMs: PACE_SAMPLE_STALE_MS,
          maxSecPerKm: PACE_MAX_SEC_PER_KM,
        })
        const rounded = next == null ? null : Math.round(next)
        setCurrentPaceSec((prev) => (prev === rounded ? prev : rounded))
      }
    }

    sync()
    if (phase !== 'tracking' || status !== 'tracking') return

    const id = setInterval(sync, 250)
    const appStateSub = AppState.addEventListener('change', (next) => {
      if (next === 'active') sync()
    })
    return () => {
      clearInterval(id)
      appStateSub.remove()
    }
  }, [phase, status, resumeFrom])

  useEffect(() => {
    if (phase === 'countdown' || phase === 'tracking') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG)
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG)
      }
    }
  }, [phase])

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
        setCount(0)
        haptics.success()
      }, 3000),
    )
    timers.push(
      setTimeout(() => {
        void beginTracking()
      }, 3600),
    )
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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

  useEffect(() => {
    if (phase !== 'tracking') return
    updateLiveNotification({
      elapsedMs: elapsedSec * 1000,
      distanceKm,
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

  useEffect(() => {
    onSummaryChange?.(phase === 'summary')
  }, [phase, onSummaryChange])

  useEffect(() => {
    return () => onSummaryChange?.(false)
  }, [onSummaryChange])

  useEffect(() => {
    if (phase !== 'summary') return
    setTitle((prev) => (prev.trim().length > 0 ? prev : defaultWorkoutTitle(sport, sessionStartedAt)))
  }, [phase, sport, sessionStartedAt])

  useEffect(() => {
    const milestone = Math.floor(distanceKm)
    if (milestone > lastMilestoneRef.current) {
      lastMilestoneRef.current = milestone
      if (milestone > 0) {
        haptics.success()
      }
    }
  }, [distanceKm])

  async function handleStart() {
    if (starting) return
    setStarting(true)
    try {
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

      if (pre.background) {
        setBackgroundGranted(true)
        setPhase('countdown')
        return
      }
    } catch (err) {
      console.warn('[LiveTracker] pre-flight failed', err)
    } finally {
      if (mountedRef.current) setStarting(false)
    }
    setBackgroundGranted(false)
    setBackgroundBlocked(false)
    setPhase('permission')
  }

  async function handleGrantBackground() {
    setRequestingBackground(true)
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
    setBackgroundBlocked(mustUseSettings)
    haptics.warning()
  }

  function handleSkipBackground() {
    setBackgroundGranted(false)
    setPhase('countdown')
  }

  async function beginTracking() {
    if (!mountedRef.current) return
    setElapsedSec(0)
    setGpsQuality('acquiring')
    setIndoor(false)
    setCurrentPaceSec(null)
    lastMilestoneRef.current = 0
    lastTickSecRef.current = -1
    setPhase('tracking')
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

  function handleRetryGps() {
    haptics.light()
    void restartFeed(backgroundGranted)
  }

  async function handleStop() {
    haptics.success()
    try {
      await stopSession()
    } catch (err) {
      console.warn('[LiveTracker] stopping the session failed', err)
    }
    void stopLiveNotification()
    if (!mountedRef.current) return
    const settled = useLiveTrackingStore.getState()
    setElapsedSec(Math.floor(elapsedMsFrom(settled) / 1000))
    setSummaryMovingMs(movingTimeMsFrom(settled))
    setSummaryFrozen({ distanceM: settled.distanceM, route: settled.route })
    setPhase('summary')
  }

  function handleRpeChange(next: number) {
    setRpe(next)
  }

  function handleSave() {
    const live = useLiveTrackingStore.getState()
    const finalDistanceKm = resumeFrom ? resumeFrom.distanceM / 1000 : live.distanceM / 1000
    const finalRoute = resumeFrom ? resumeFrom.route : live.route
    const finalStartedAt = resumeFrom ? resumeFrom.startedAt : live.startedAt
    const finalElapsedSec = resumeFrom
      ? resumeFrom.elapsedSec
      : Math.floor(elapsedMsFrom(live) / 1000)

    const safeDuration = Number.isFinite(finalElapsedSec)
      ? Math.max(1, Math.round(finalElapsedSec / 60))
      : 1
    const safeDistance =
      Number.isFinite(finalDistanceKm) && finalDistanceKm > 0 ? finalDistanceKm : 0
    const safeRoute = finalRoute.filter((p) => isValidCoordinate(p.latitude, p.longitude))
    const finalMovingMs = resumeFrom
      ? resumeFrom.elapsedSec * 1000
      : movingTimeMsFrom(live)
    const quality: GpsQualitySummary = resumeFrom
      ? safeRoute.length >= 2 && safeDistance > 0
        ? 'partial'
        : 'none'
      : gpsQualitySummaryFrom(live)
    console.log(
      `[LiveTracker] saving: ${safeDistance.toFixed(3)} km · ${safeDuration} min · ` +
        `${safeRoute.length} route pts · gps ${quality}`,
    )
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

  function handleDiscard() {
    void clearSession()
    void stopLiveNotification()
    onExit()
  }

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
          sportOptions={sportOptions}
          onSportChange={onSportChange}
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

function BackgroundPermissionView({
  blocked,
  requesting,
  onAllow,
  onOpenSettings,
  onSkip,
}: {
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
            color: colors.text,
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


function ReadyView({
  sportLabel,
  warmupQuality,
  starting,
  onStart,
  onExit,
}: {
  sportLabel: string
  warmupQuality: GpsQuality
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
        <Text style={{ marginTop: 6, fontSize: 28, fontWeight: '800', color: colors.text }}>
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
  pace: string
  speed: number
  currentPace: string
  currentSpeed: number | null
  calories: number
  route: RoutePoint[]
  liveRegion: MapRegion | undefined
  paused: boolean
  gpsQuality: GpsQuality
  indoor: boolean
  feedMode: FeedMode
  onRetryGps: () => void
  onPause: () => void
  onResume: () => void
  onStop: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, paddingHorizontal: 20 }}>
      <View style={{ alignItems: 'center', marginTop: 12 }}>
        <Text style={{ color: colors.textSubtle, fontSize: 13, fontWeight: '700', letterSpacing: 1 }}>
          {paused ? 'PAUSED' : 'ELAPSED'}
        </Text>
        <Text
          style={{
            color: colors.text,
            fontSize: 56,
            fontWeight: '800',
            fontFamily: TIMER_FONT,
            marginTop: 2,
          }}
        >
          {clock}
        </Text>
      </View>

      <View style={{ alignItems: 'center', marginTop: 10 }}>
        <Text style={{ color: colors.accent, fontSize: 64, fontWeight: '900', fontFamily: TIMER_FONT }}>
          {distanceKm.toFixed(2)}
        </Text>
        <Text style={{ color: colors.textSubtle, fontSize: 16, fontWeight: '700', marginTop: -4 }}>
          km
        </Text>
      </View>

      {!paused ? (
        <View style={{ marginTop: 8, alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <GpsChip quality={gpsQuality} />
            {gpsQuality === 'lost' ? (
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
            <Text
              style={{ marginTop: 6, color: colors.warnText, fontSize: 12, fontWeight: '600' }}
            >
              Keep the screen on — background tracking is off
            </Text>
          ) : null}
        </View>
      ) : null}

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

      <View style={{ flex: 1, marginTop: 18, marginBottom: 14 }}>
        <RouteMap
          coordinates={route}
          region={liveRegion}
          showMarkers={false}
          dark
          style={MAP_FILL_STYLE}
        />
      </View>

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
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: colors.textSubtle, fontSize: 12, fontWeight: '700', letterSpacing: 1 }}>
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 }}>
        <Text style={{ color: colors.text, fontSize: 30, fontWeight: '800', fontFamily: TIMER_FONT }}>
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
      <Text style={{ color: onColor(color), fontSize: 18, fontWeight: '800' }}>{label}</Text>
    </Pressable>
  )
}
