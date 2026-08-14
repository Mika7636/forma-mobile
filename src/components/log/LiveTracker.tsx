import { useEffect, useMemo, useRef, useState } from 'react'
import {
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
import { haptics } from '../../utils/haptics'
import * as Location from 'expo-location'
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake'
import PrimaryButton from '../ui/PrimaryButton'
import RouteMap from '../session/RouteMap'
import { COLORS } from '../../constants/theme'
import { estimateCalories } from '../../algorithms/calories'
import { calculateSpeed, formatPace, haversineDistance } from '../../utils/geo'
import type { RoutePoint, SportType } from '../../types/session'
import type { Region } from 'react-native-maps'

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

interface LiveTrackerProps {
  sport: SportType
  sportLabel: string
  weightKg?: number
  /** True while LogScreen is persisting the session — drives the Save spinner. */
  saving: boolean
  onExit: () => void
  onComplete: (result: LiveResult) => void
}

type Phase = 'ready' | 'countdown' | 'tracking' | 'summary'

/** Assumed effort for the *live* calorie ticker before the athlete rates RPE. */
const LIVE_ASSUMED_RPE = 6

/** GPS fixes worse than this (metres) are too noisy to trust for distance. */
const MAX_ACCURACY_M = 50

/** Below this segment length (m) we treat movement as GPS wander / standing still. */
const MIN_SEGMENT_M = 2

const KEEP_AWAKE_TAG = 'forma-live-tracker'

const TIMER_FONT = Platform.select({ ios: 'Courier', android: 'monospace', default: 'monospace' })

const ZONE_GREEN = '#22c55e'
const ZONE_AMBER = '#f59e0b'
const ZONE_RED = '#ef4444'

function rpeColor(rpe: number): string {
  if (rpe <= 3) return ZONE_GREEN
  if (rpe <= 7) return ZONE_AMBER
  return ZONE_RED
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
  onExit,
  onComplete,
}: LiveTrackerProps) {
  const [permission, requestPermission] = Location.useForegroundPermissions()

  const [phase, setPhase] = useState<Phase>('ready')
  const [count, setCount] = useState(3)
  const [permissionDenied, setPermissionDenied] = useState(false)

  const [elapsedSec, setElapsedSec] = useState(0)
  const [distanceM, setDistanceM] = useState(0)
  const [route, setRoute] = useState<RoutePoint[]>([])
  const [paused, setPaused] = useState(false)
  const [hasFix, setHasFix] = useState(false)
  const [lastFixAt, setLastFixAt] = useState(0)
  const [now, setNow] = useState(Date.now())

  // Summary inputs
  const [rpe, setRpe] = useState(6)
  const [notes, setNotes] = useState('')

  const watchRef = useRef<Location.LocationSubscription | null>(null)
  const watchStartingRef = useRef(false)
  // Bumped by stopWatch() so an in-flight startWatch() can tell its subscription
  // is already obsolete by the time watchPositionAsync resolves.
  const watchGenRef = useRef(0)
  const lastPointRef = useRef<RoutePoint | null>(null)
  const lastMilestoneRef = useRef(0)
  const lastRpeRef = useRef(rpe)

  // Elapsed time is derived from the wall clock, not from counting interval
  // ticks: JS timers drift and are throttled while the app is backgrounded (a
  // phone in a pocket mid-run), and elapsed drives duration, pace, calories and
  // load. `startedAt` is when the current running segment began; `accumulated`
  // banks the milliseconds from segments before each pause.
  const startedAtRef = useRef(0)
  const accumulatedMsRef = useRef(0)
  // Wall-clock start of the whole session (unlike startedAtRef, this is not
  // reset by pause/resume) so the saved session is timestamped to its real start.
  const sessionStartAtRef = useRef(0)

  const isCycling = sport === 'cycling'
  const distanceKm = distanceM / 1000
  const speed = calculateSpeed(elapsedSec, distanceKm)
  const pace = formatPace(elapsedSec, distanceKm)
  const liveCalories = estimateCalories(sport, elapsedSec / 60, LIVE_ASSUMED_RPE, weightKg)

  /* ---- GPS subscription lifecycle ---------------------------------- */
  async function startWatch() {
    // Guard against a double subscription (e.g. rapid resume taps). The
    // `starting` flag matters as much as the ref: watchPositionAsync is async,
    // so two calls could both see a null ref and each subscribe, double-counting
    // every metre.
    if (watchRef.current || watchStartingRef.current) return
    watchStartingRef.current = true
    const gen = watchGenRef.current
    try {
      const sub = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        },
        handleLocation,
      )
      // Stopped, paused or unmounted while we were awaiting: this subscription
      // is already obsolete, and nothing else holds a reference to remove it.
      if (gen !== watchGenRef.current) {
        sub.remove()
        return
      }
      watchRef.current = sub
    } finally {
      watchStartingRef.current = false
    }
  }

  function stopWatch() {
    watchGenRef.current += 1
    watchRef.current?.remove()
    watchRef.current = null
  }

  function handleLocation(loc: Location.LocationObject) {
    const { latitude, longitude, accuracy } = loc.coords
    // Too imprecise to trust — don't corrupt distance, and don't count this as a
    // fix either, so the "Searching for GPS…" hint stays up while every reading
    // is being rejected rather than silently freezing the distance.
    if (accuracy != null && accuracy > MAX_ACCURACY_M) return

    setLastFixAt(Date.now())
    setHasFix(true)

    const point: RoutePoint = { latitude, longitude, timestamp: loc.timestamp }
    const prev = lastPointRef.current
    if (prev) {
      const seg = haversineDistance(prev.latitude, prev.longitude, latitude, longitude)
      // Ignore tiny wander so an indoor / stationary athlete doesn't accrue metres.
      if (seg < MIN_SEGMENT_M) return
      setDistanceM((d) => d + seg)
    }
    lastPointRef.current = point
    setRoute((r) => [...r, point])
  }

  // Tear down GPS + keep-awake if the component unmounts mid-session.
  useEffect(() => {
    return () => {
      stopWatch()
      deactivateKeepAwake(KEEP_AWAKE_TAG)
    }
  }, [])

  /* ---- Timer + "now" ticker ---------------------------------------- */
  useEffect(() => {
    if (phase !== 'tracking' || paused) return
    const tick = () => {
      const ms = accumulatedMsRef.current + (Date.now() - startedAtRef.current)
      setElapsedSec(Math.floor(ms / 1000))
      setNow(Date.now())
    }
    tick()
    // Sub-second polling so the displayed second flips close to its real
    // boundary; a 1s interval would visibly skip or repeat seconds as it slips.
    const id = setInterval(tick, 250)
    return () => clearInterval(id)
  }, [phase, paused])

  /* ---- Keep the screen awake while active -------------------------- */
  useEffect(() => {
    if (phase === 'countdown' || phase === 'tracking') {
      activateKeepAwakeAsync(KEEP_AWAKE_TAG)
      return () => {
        deactivateKeepAwake(KEEP_AWAKE_TAG)
      }
    }
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
    timers.push(setTimeout(beginTracking, 3600))
    return () => timers.forEach(clearTimeout)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

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
    let granted = permission?.granted ?? false
    if (!granted) {
      const res = await requestPermission()
      granted = res.granted
    }
    if (!granted) {
      setPermissionDenied(true)
      haptics.warning()
      return
    }
    setPhase('countdown')
  }

  async function beginTracking() {
    setElapsedSec(0)
    setDistanceM(0)
    setRoute([])
    setHasFix(false)
    setLastFixAt(Date.now())
    lastPointRef.current = null
    lastMilestoneRef.current = 0
    startedAtRef.current = Date.now()
    sessionStartAtRef.current = Date.now()
    accumulatedMsRef.current = 0
    setPaused(false)
    setPhase('tracking')
    await startWatch()
  }

  function handlePause() {
    accumulatedMsRef.current += Date.now() - startedAtRef.current
    setPaused(true)
    stopWatch()
    // Break the trail so resuming doesn't draw / count a straight line across the gap.
    lastPointRef.current = null
    haptics.medium()
  }

  async function handleResume() {
    startedAtRef.current = Date.now()
    setPaused(false)
    haptics.medium()
    await startWatch()
  }

  function handleStop() {
    stopWatch()
    // Bank the final segment (already banked if we stopped from a paused state),
    // then settle the timer on the exact elapsed total the summary will save.
    if (!paused) accumulatedMsRef.current += Date.now() - startedAtRef.current
    setElapsedSec(Math.floor(accumulatedMsRef.current / 1000))
    setPaused(false)
    setPhase('summary')
    haptics.success()
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
    onComplete({
      durationMinutes: Math.max(1, Math.round(elapsedSec / 60)),
      rpe,
      distanceKm,
      notes: notes.trim() || undefined,
      routeCoordinates: route,
      averagePace: isCycling ? undefined : formatPace(elapsedSec, distanceKm),
      averageSpeed: isCycling ? calculateSpeed(elapsedSec, distanceKm) : undefined,
      startedAt: sessionStartAtRef.current || undefined,
    })
  }

  // Live follow-cam region: keep the latest fix centred with a tight zoom.
  const liveRegion = useMemo<Region | undefined>(() => {
    const last = route[route.length - 1]
    if (!last) return undefined
    return {
      latitude: last.latitude,
      longitude: last.longitude,
      latitudeDelta: 0.006,
      longitudeDelta: 0.006,
    }
  }, [route])

  const searching = phase === 'tracking' && !paused && (!hasFix || now - lastFixAt > 6000)

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
          onStart={handleStart}
          onExit={onExit}
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
          calories={liveCalories}
          route={route}
          liveRegion={liveRegion}
          paused={paused}
          searching={searching}
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
          onDiscard={onExit}
        />
      ) : null}
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Phase: READY                                                        */
/* ------------------------------------------------------------------ */
function ReadyView({
  sportLabel,
  permissionDenied,
  onStart,
  onExit,
}: {
  sportLabel: string
  permissionDenied: boolean
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
        <StartButton onPress={onStart} label={permissionDenied ? 'Try Again' : 'Start'} />
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
  calories,
  route,
  liveRegion,
  paused,
  searching,
  onPause,
  onResume,
  onStop,
}: {
  clock: string
  isCycling: boolean
  distanceKm: number
  pace: string
  speed: number
  calories: number
  route: RoutePoint[]
  liveRegion: Region | undefined
  paused: boolean
  searching: boolean
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

      {searching ? (
        <Animated.View entering={FadeIn.duration(200)} style={{ alignItems: 'center', marginTop: 6 }}>
          <Text style={{ color: ZONE_AMBER, fontSize: 13, fontWeight: '700' }}>
            🛰️ Searching for GPS…
          </Text>
        </Animated.View>
      ) : null}

      {/* Secondary metrics */}
      <View style={{ flexDirection: 'row', marginTop: 18 }}>
        <Metric
          label={isCycling ? 'SPEED' : 'PACE'}
          value={isCycling ? `${speed.toFixed(1)}` : pace.replace(' /km', '')}
          unit={isCycling ? 'km/h' : '/km'}
        />
        <Metric label="CALORIES" value={`${calories}`} unit="kcal" />
      </View>

      {/* Live route map */}
      <View style={{ flex: 1, marginTop: 18, marginBottom: 14 }}>
        {/* `style` flex overrides RouteMap's default fixed height on the main axis. */}
        <RouteMap coordinates={route} region={liveRegion} showMarkers={false} style={{ flex: 1 }} />
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

function Metric({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: '#1f2937',
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
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
          <RouteMap coordinates={route} height={200} showMarkers />
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
            <SummaryStat label="Distance" value={`${distanceKm.toFixed(2)} km`} />
            <SummaryStat
              label={isCycling ? 'Avg Speed' : 'Avg Pace'}
              value={isCycling ? `${speed.toFixed(1)} km/h` : pace}
            />
            <SummaryStat label="Calories" value={`🔥 ${calories} kcal`} />
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
