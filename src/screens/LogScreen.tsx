import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import {
  FlatList,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  FadeOutUp,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import Slider from '@react-native-community/slider'
import { haptics } from '../utils/haptics'
import ConflictModal from '../components/log/ConflictModal'
import LiveTracker, {
  type LiveResult,
  type LiveSnapshot,
} from '../components/log/LiveTracker'
import ErrorBoundary from '../components/ui/ErrorBoundary'
import PrimaryButton from '../components/ui/PrimaryButton'
import {
  clearSession as clearLiveSession,
  ensureHydrated as ensureLiveTrackingHydrated,
  useLiveTrackingStore,
} from '../store/liveTrackingStore'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { worstSeverity } from '../constants/conflictColors'
import { COLORS } from '../constants/theme'
import { SPORT_OPTIONS, type SportOption } from '../constants/training'
import {
  computeEstimates,
  deleteSession,
  isDistanceSport,
  logSession,
  type LogSessionInput,
} from '../services/sessionService'
import {
  checkAndNotifyStreak,
  sendConflictNotification,
} from '../services/notificationService'
import { useAuthStore } from '../store/authStore'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { useIsMounted, useSafeTimeout } from '../hooks/useSafeTimeout'
import { CALIBRATION_SESSION_TARGET } from '../utils/calibration'
import { withPreferenceDefaults } from '../types/notifications'
import type { Conflict } from '../types/conflict'
import type { SportType } from '../types/session'
import type { LogScreenProps } from '../navigation/types'

type LogMode = 'quick' | 'live'

/**
 * The timestamp to persist for a session.
 *
 * A Quick/Live log defaults to *now* (real date + time). A session logged for a
 * specific Planner day keeps that calendar day but stamps the actual wall-clock
 * time (from `at`, defaulting to now) — otherwise every planner-logged session
 * would land at the noon we parse the planner date to, which is why they all
 * read "12:00 PM". `at` lets a live session pass its true start time instead.
 */
function resolveSessionDate(plannerDay: Date | null, at: Date = new Date()): Date {
  if (!plannerDay) return at
  const d = new Date(plannerDay)
  d.setHours(at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds())
  return d
}

/* --- RPE zones -------------------------------------------------------- */
const ZONE_GREEN = '#22c55e'
const ZONE_AMBER = '#f59e0b'
const ZONE_RED = '#ef4444'
const ZONE_ORANGE = '#f97316'

interface RpeZone {
  label: string
  color: string
}

function rpeZone(rpe: number): RpeZone {
  if (rpe <= 3) return { label: 'EASY ZONE', color: ZONE_GREEN }
  if (rpe <= 7) return { label: 'MODERATE ZONE', color: ZONE_AMBER }
  return { label: 'MAX EFFORT', color: ZONE_RED }
}

const RPE_DESCRIPTIONS: Record<number, string> = {
  1: 'Very easy — barely any effort',
  2: 'Very easy — barely any effort',
  3: 'Easy — comfortable conversation',
  4: 'Easy — comfortable conversation',
  5: 'Moderate — noticeable but manageable',
  6: 'Moderate — noticeable but manageable',
  7: 'Hard — pushing your pace',
  8: "Very hard — can't hold a conversation",
  9: 'Extremely hard — near maximum',
  10: 'Maximum — all-out effort',
}

/* --- Training-load severity ------------------------------------------- */
function loadSeverity(load: number): { color: string; label: string } {
  if (load > 600) return { color: ZONE_RED, label: 'Very hard session' }
  if (load >= 400) return { color: ZONE_ORANGE, label: 'Hard session' }
  if (load >= 200) return { color: ZONE_AMBER, label: 'Moderate session' }
  return { color: ZONE_GREEN, label: 'Light session' }
}

const DURATION_MAX = 300

/** Hex colour + "10% opacity" alpha suffix for soft zone tints. */
function tint(hex: string): string {
  return `${hex}1A`
}

export default function LogScreen({ route, navigation }: LogScreenProps) {
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  // Count-based calibration gate: a user with < 7 sessions gets gentler conflict
  // detection (no volume warnings, sensitivity one notch softer).
  const { sessions } = useSessionHistory()

  // A date handed over from the Planner: pre-fill it and send the user back
  // there after saving. Parse at local noon so the calendar day never slips.
  const paramDate = route.params?.date
  const logDate = useMemo(
    () => (paramDate ? new Date(`${paramDate}T12:00:00`) : null),
    [paramDate],
  )
  const fromPlanner = logDate != null
  const bannerLabel = logDate
    ? logDate.toLocaleDateString(undefined, {
        weekday: 'long',
        month: 'short',
        day: 'numeric',
      })
    : null

  const sports = useMemo<SportOption[]>(
    () => SPORT_OPTIONS.filter((o) => profile?.sports?.includes(o.value)),
    [profile?.sports],
  )

  const [sport, setSport] = useState<SportType | null>(null)
  const [mode, setMode] = useState<LogMode>('quick')
  const [duration, setDuration] = useState('')
  const [distance, setDistance] = useState('')
  const [rpe, setRpe] = useState(5)
  const [notes, setNotes] = useState('')
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [avgBpm, setAvgBpm] = useState('')

  const [saving, setSaving] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const lastRpe = useRef(rpe)
  // Deferred "go back after the toast lands" navigation must not outlive the
  // screen — switching tabs inside that window used to navigate and setState on
  // a torn-down component.
  const schedule = useSafeTimeout()
  const isMounted = useIsMounted()

  // Live-tracking crash recovery. `liveSnapshot` is written by LiveTracker on
  // every tick; if its error boundary trips we remount the tracker seeded with
  // that snapshot (bumping `liveBoundaryKey` clears the boundary's error state)
  // so the athlete lands on the summary and can still save the run.
  const liveSnapshot = useRef<LiveSnapshot | null>(null)
  const [recoveredLive, setRecoveredLive] = useState<LiveSnapshot | null>(null)
  const [liveBoundaryKey, setLiveBoundaryKey] = useState(0)

  // Put the athlete back on their run.
  //
  // Tracking now survives the screen going off *and* FORMA's process being
  // killed — the workout lives in `liveTrackingStore`, mirrored to AsyncStorage,
  // and the OS keeps feeding it through the background location task. So a
  // relaunch (from the app icon, or from tapping the "FORMA is tracking your
  // run" notification) can easily land here with a run still in progress. Show
  // them the tracking screen rather than an empty log form for a workout that is
  // still recording.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureLiveTrackingHydrated()
      if (cancelled) return
      const live = useLiveTrackingStore.getState()
      if (live.status === 'idle' || !live.sport) return
      setSport(live.sport)
      setMode('live')
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // A tab's params outlive the visit that set them, so a date handed over by the
  // Planner would still be pinned here days later — the user would tap the Log
  // tab and be told they're logging for last Tuesday. Drop it on the way out.
  useEffect(
    () =>
      navigation.addListener('blur', () => {
        if (paramDate) navigation.setParams({ date: undefined })
      }),
    [navigation, paramDate],
  )

  const durationNum = parseInt(duration, 10) || 0
  const distanceNum = distance ? parseFloat(distance) : undefined
  const avgBpmNum = avgBpm ? parseInt(avgBpm, 10) : undefined
  const showDistance = isDistanceSport(sport)
  const canSave = sport != null && durationNum >= 1 && durationNum <= DURATION_MAX

  const zone = rpeZone(rpe)

  const estimates = useMemo(() => {
    if (!sport) return null
    return computeEstimates(
      { sport, durationMinutes: durationNum, rpe, distanceKm: distanceNum },
      profile,
    )
  }, [sport, durationNum, rpe, distanceNum, profile])

  const load = estimates?.loadScore ?? 0
  const severity = loadSeverity(load)

  // Pulse the load number whenever it changes.
  const loadScale = useSharedValue(1)
  useEffect(() => {
    loadScale.value = withSequence(
      withTiming(1.08, { duration: 90 }),
      withTiming(1, { duration: 140 }),
    )
  }, [load, loadScale])
  const loadAnimStyle = useAnimatedStyle(() => ({
    transform: [{ scale: loadScale.value }],
  }))

  const resetForm = () => {
    setSport(null)
    setMode('quick')
    setDuration('')
    setDistance('')
    setRpe(5)
    setNotes('')
    setAvgBpm('')
    setAdvancedOpen(false)
  }

  const handleSelectSport = (value: SportType) => {
    haptics.light()
    setSport(value)
    // Live tracking only makes sense for distance sports; reset the mode when a
    // non-distance sport (combat, football, gym…) is picked.
    if (!isDistanceSport(value)) {
      setDistance('')
      setMode('quick')
    }
  }

  const sportLabel = useMemo(
    () => SPORT_OPTIONS.find((o) => o.value === sport)?.label ?? '',
    [sport],
  )

  const handleRpeChange = (raw: number) => {
    const next = Math.round(raw)
    if (next !== lastRpe.current) {
      lastRpe.current = next
      haptics.light()
      setRpe(next)
    }
  }

  const goBackToPlannerOrReset = () => {
    setMode('quick')
    if (fromPlanner) navigation.navigate('Planner')
    else resetForm()
  }

  // Shared write path for both Quick Log and Live Tracking. Persists the
  // session, then either surfaces conflicts or shows the success toast + resets.
  const logAndHandle = async (input: LogSessionInput) => {
    if (!user || !profile || saving) return
    Keyboard.dismiss()
    setSaving(true)
    try {
      const { session, conflicts: detected } = await logSession(user.uid, input, profile, {
        calibrating: sessions.length < CALIBRATION_SESSION_TARGET,
      })
      // The write can outlive the screen (tab switch or logout mid-save). The
      // session is safely persisted either way; there's just no UI left to
      // update, and the conflict modal below would be mounted into nothing.
      // The run is now safely in Firestore, so the live-tracking store — and the
      // AsyncStorage snapshot behind it — can go. Deliberately *after* the write
      // rather than when the athlete taps Save: a failed save must leave every
      // background-tracked metre intact and retryable. Fire-and-forget, and done
      // before the mounted check because it has nothing to do with the UI.
      if (input.trackingMode === 'live') void clearLiveSession()

      if (!isMounted.current) return
      setSaving(false)

      // Local notifications for what just happened. Fire-and-forget so a
      // notification failure can never block the save UI — the in-app modal and
      // toast below are the primary feedback; these are the "you backgrounded
      // the app" safety net.
      //
      // The store's snapshot hasn't landed yet, so prepend the new session to
      // get an accurate streak. The repeating schedules (daily reminder copy,
      // streak-at-risk) re-sync automatically once that snapshot arrives and
      // changes the session count.
      const prefs = withPreferenceDefaults(profile.notificationPreferences)
      const withNew = [session, ...sessions]
      if (detected.length > 0) {
        // One notification, for the most serious conflict — a burst of them
        // would be exactly the spam this feature is meant to avoid.
        const worst =
          detected.find((c) => c.severity === 'danger') ?? detected[0]
        void sendConflictNotification(worst, prefs)
      }
      void checkAndNotifyStreak(withNew, prefs)

      if (detected.length > 0) {
        setSavedSessionId(session.id)
        setConflicts(detected)
        return
      }

      // The toast fires the success haptic itself — see toastStore.
      toast.success('Session saved', {
        description: `${session.loadScore} AU · ${session.estimatedCalories} kcal`,
      })
      setMode('quick')
      schedule(goBackToPlannerOrReset, 1000)
    } catch {
      if (!isMounted.current) return
      setSaving(false)
      toast.error('Could not save session', {
        description: isOffline()
          ? "You're offline — reconnect and try again."
          : 'Something went wrong. Please try again.',
      })
    }
  }

  const handleSave = () => {
    if (!canSave || !sport) return
    logAndHandle({
      sport,
      date: resolveSessionDate(logDate),
      durationMinutes: durationNum,
      rpe,
      distanceKm: showDistance ? distanceNum : undefined,
      notes: notes.trim() || undefined,
      avgBpm: avgBpmNum,
      trackingMode: 'quick',
    })
  }

  const handleSaveLive = (result: LiveResult) => {
    if (!sport) return
    logAndHandle({
      sport,
      // Live sessions are stamped with when tracking actually started, not when
      // the summary was saved (which can be many minutes later).
      date: resolveSessionDate(
        logDate,
        result.startedAt != null ? new Date(result.startedAt) : new Date(),
      ),
      durationMinutes: result.durationMinutes,
      rpe: result.rpe,
      distanceKm: result.distanceKm > 0 ? result.distanceKm : undefined,
      notes: result.notes,
      trackingMode: 'live',
      routeCoordinates: result.routeCoordinates,
      averagePace: result.averagePace,
      averageSpeed: result.averageSpeed,
      gpsQuality: result.gpsQuality,
    })
  }

  /**
   * Recover from a live-tracking crash: remount the tracker on the summary
   * screen with whatever was collected. Falls back to the quick log when there
   * was nothing meaningful recorded (crashed before tracking started).
   */
  const handleRecoverLive = () => {
    const snap = liveSnapshot.current
    if (!snap || snap.elapsedSec < 1) {
      liveSnapshot.current = null
      setRecoveredLive(null)
      setMode('quick')
      toast.info('Nothing to recover', {
        description: 'The workout had not started yet.',
      })
      return
    }
    setRecoveredLive(snap)
    setLiveBoundaryKey((k) => k + 1)
    toast.success('Workout recovered', {
      description: 'Rate your effort and save it below.',
    })
  }

  const handleKeepSession = () => {
    const kept = conflicts ?? []
    setConflicts(null)
    setSavedSessionId(null)
    // Keeping a flagged session is a decision, not a plain save — the toast says
    // so, and stays amber, so the warning doesn't vanish with the modal. The
    // modal itself carries the detail; this is the receipt.
    if (kept.length > 0) {
      const worst = worstSeverity(kept)
      toast.warning('Saved with a conflict', {
        description:
          worst === 'danger'
            ? 'High injury risk — take it easy on your next session.'
            : 'Watch your recovery over the next couple of days.',
      })
    } else {
      toast.success('Session saved')
    }
    schedule(goBackToPlannerOrReset, 700)
  }

  const handleUndoSession = async () => {
    if (!user || !savedSessionId) return
    setUndoing(true)
    try {
      await deleteSession(user.uid, savedSessionId)
    } catch {
      // Best-effort: still close the modal so the user isn't stuck.
    } finally {
      if (!isMounted.current) return
      setUndoing(false)
      setConflicts(null)
      setSavedSessionId(null)
      toast.info('Session undone')
      schedule(goBackToPlannerOrReset, 700)
    }
  }

  // Full-screen live tracker. Rendered instead of the log form while the user is
  // in Live mode; the conflict modal rides along so save feedback still shows
  // over it. Toasts come from the app-root container, which is already above this.
  if (mode === 'live' && sport) {
    return (
      <>
        <ErrorBoundary
          key={liveBoundaryKey}
          name="LiveTracker"
          theme="dark"
          title="Live tracking hit a problem"
          message="Something went wrong on the tracking screen. If you were mid-workout, you can recover what was recorded and save it."
          retryLabel="Start over"
          onReset={() => {
            liveSnapshot.current = null
            setRecoveredLive(null)
          }}
          secondaryLabel="Recover this workout"
          onSecondary={handleRecoverLive}
        >
          <LiveTracker
            sport={sport}
            sportLabel={sportLabel}
            weightKg={profile?.weightKg}
            saving={saving}
            resumeFrom={recoveredLive}
            snapshotRef={liveSnapshot}
            onExit={() => setMode('quick')}
            onComplete={handleSaveLive}
          />
        </ErrorBoundary>
        <ConflictModal
          visible={conflicts != null}
          conflicts={conflicts ?? []}
          sessions={sessions}
          undoing={undoing}
          onKeep={handleKeepSession}
          onUndo={handleUndoSession}
        />
      </>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }} edges={['top']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: COLORS.ink }}>
                Log Session
              </Text>
              <Text style={{ marginTop: 4, fontSize: 15, color: COLORS.muted }}>
                Record a workout to track your training load
              </Text>

              {bannerLabel ? (
                <View
                  style={{
                    marginTop: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: COLORS.tealSoft,
                    borderRadius: 12,
                    paddingVertical: 10,
                    paddingHorizontal: 14,
                  }}
                >
                  <Text style={{ fontSize: 16, marginRight: 8 }}>🗓️</Text>
                  <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.tealDark }}>
                    Logging for {bannerLabel}
                  </Text>
                </View>
              ) : null}
            </View>

            {/* Sport selector */}
            <SectionLabel style={{ marginTop: 24, paddingHorizontal: 20 }}>
              Sport
            </SectionLabel>
            {sports.length === 0 ? (
              <Text
                style={{
                  paddingHorizontal: 20,
                  fontSize: 14,
                  color: COLORS.muted,
                }}
              >
                No sports yet — add some in your profile to start logging.
              </Text>
            ) : (
              <FlatList
                data={sports}
                keyExtractor={(item) => item.value}
                horizontal
                showsHorizontalScrollIndicator={false}
                decelerationRate="fast"
                snapToInterval={112}
                snapToAlignment="start"
                contentContainerStyle={{ paddingHorizontal: 20, paddingVertical: 4 }}
                renderItem={({ item }) => (
                  <SportCard
                    option={item}
                    selected={sport === item.value}
                    onPress={() => handleSelectSport(item.value)}
                  />
                )}
              />
            )}

            {/* Mode toggle — Quick Log vs Track Live (distance sports only) */}
            {showDistance ? (
              <Animated.View
                entering={FadeInDown.duration(200)}
                exiting={FadeOutUp.duration(160)}
                style={{ paddingHorizontal: 20, marginTop: 20 }}
              >
                <ModeToggle
                  mode={mode}
                  onSelect={(next) => {
                    haptics.light()
                    setMode(next)
                  }}
                />
              </Animated.View>
            ) : null}

            {/* Duration */}
            <View style={{ paddingHorizontal: 20 }}>
              <SectionLabel style={{ marginTop: 24 }}>Duration (minutes)</SectionLabel>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 96,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Text style={{ fontSize: 44, fontWeight: '800', color: COLORS.ink }}>
                    {durationNum || 0}
                  </Text>
                  <Text style={{ fontSize: 12, color: COLORS.subtle, marginTop: -4 }}>
                    min
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: COLORS.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={duration}
                    onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="e.g. 45"
                    placeholderTextColor={COLORS.subtle}
                    style={{ height: 56, fontSize: 20, color: COLORS.ink }}
                  />
                </View>
              </View>
              {durationNum > DURATION_MAX ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.danger }}>
                  Keep it under {DURATION_MAX} minutes.
                </Text>
              ) : null}
            </View>

            {/* Distance (conditional, animated) */}
            {showDistance ? (
              <Animated.View
                entering={FadeInDown.duration(200)}
                exiting={FadeOutUp.duration(160)}
                style={{ paddingHorizontal: 20 }}
              >
                <SectionLabel style={{ marginTop: 20 }}>Distance (km)</SectionLabel>
                <View
                  style={{
                    backgroundColor: COLORS.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={distance}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9.]/g, '')
                      // allow only one decimal point
                      const parts = cleaned.split('.')
                      setDistance(
                        parts.length > 2
                          ? `${parts[0]}.${parts.slice(1).join('')}`
                          : cleaned,
                      )
                    }}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5.0"
                    placeholderTextColor={COLORS.subtle}
                    style={{ height: 56, fontSize: 20, color: COLORS.ink }}
                  />
                </View>
              </Animated.View>
            ) : null}

            {/* RPE */}
            <View
              style={{
                marginTop: 24,
                marginHorizontal: 16,
                borderRadius: 16,
                backgroundColor: tint(zone.color),
                padding: 16,
              }}
            >
              <SectionLabel style={{ marginTop: 0 }}>
                Rate of Perceived Exertion (RPE)
              </SectionLabel>

              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <View
                  style={{
                    backgroundColor: zone.color,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 5,
                  }}
                >
                  <Text
                    style={{
                      color: COLORS.white,
                      fontSize: 12,
                      fontWeight: '800',
                      letterSpacing: 0.5,
                    }}
                  >
                    {zone.label}
                  </Text>
                </View>
                <Text style={{ fontSize: 40, fontWeight: '800', color: zone.color }}>
                  {rpe}
                </Text>
              </View>

              <Slider
                style={{ width: '100%', height: 44, marginTop: 6 }}
                minimumValue={1}
                maximumValue={10}
                step={1}
                value={rpe}
                onValueChange={handleRpeChange}
                minimumTrackTintColor={zone.color}
                maximumTrackTintColor={COLORS.border}
                thumbTintColor={zone.color}
              />

              <Text style={{ fontSize: 14, color: COLORS.body, marginTop: 2 }}>
                {RPE_DESCRIPTIONS[rpe]}
              </Text>
            </View>

            {/* Prominent live calorie estimate — updates as duration/RPE change,
                for every sport (Part 4/5). */}
            {estimates && durationNum > 0 ? (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  marginTop: 16,
                  marginHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: '#FFF7ED',
                  borderWidth: 1,
                  borderColor: '#FED7AA',
                  borderRadius: 16,
                  paddingVertical: 14,
                }}
              >
                <Text style={{ fontSize: 22, marginRight: 8 }}>🔥</Text>
                <Text style={{ fontSize: 24, fontWeight: '800', color: '#EA580C' }}>
                  Est. {estimates.estimatedCalories} kcal
                </Text>
              </Animated.View>
            ) : null}

            {/* Training load */}
            <View
              style={{
                marginTop: 20,
                marginHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: COLORS.border,
                backgroundColor: COLORS.fieldBg,
                padding: 18,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1,
                  color: COLORS.muted,
                }}
              >
                TRAINING LOAD
              </Text>
              <Animated.View
                style={[
                  { flexDirection: 'row', alignItems: 'flex-end', marginTop: 4 },
                  loadAnimStyle,
                ]}
              >
                <Text style={{ fontSize: 52, fontWeight: '800', color: COLORS.teal }}>
                  {load}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: COLORS.teal,
                    marginBottom: 9,
                    marginLeft: 6,
                  }}
                >
                  AU
                </Text>
              </Animated.View>

              <Text style={{ fontSize: 13, color: COLORS.muted }}>
                {durationNum || 0} min × RPE {rpe} = {load} AU
              </Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10 }}>
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: severity.color,
                    marginRight: 8,
                  }}
                />
                <Text style={{ fontSize: 14, fontWeight: '600', color: COLORS.body }}>
                  {severity.label}
                </Text>
              </View>
            </View>

            {/* Estimated stats */}
            {estimates && durationNum > 0 ? (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  flexDirection: 'row',
                  paddingHorizontal: 16,
                  marginTop: 14,
                }}
              >
                <StatCard
                  icon="🔥"
                  label="Est. Calories"
                  value={`${estimates.estimatedCalories} kcal`}
                />
                <StatCard
                  icon="❤️"
                  label="HR Zone"
                  value={`Zone ${estimates.estimatedHRZone.zone} — ${estimates.estimatedHRZone.name}`}
                />
                {showDistance && estimates.pace ? (
                  <StatCard icon="⏱️" label="Pace" value={estimates.pace} />
                ) : null}
              </Animated.View>
            ) : null}

            {/* Notes */}
            <View style={{ paddingHorizontal: 20 }}>
              <SectionLabel style={{ marginTop: 24 }}>Notes (optional)</SectionLabel>
              <View
                style={{
                  backgroundColor: COLORS.fieldBg,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: COLORS.border,
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                }}
              >
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="How did it feel? Any observations..."
                  placeholderTextColor={COLORS.subtle}
                  style={{
                    minHeight: 60,
                    maxHeight: 100,
                    fontSize: 16,
                    color: COLORS.ink,
                    paddingTop: 10,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            </View>

            {/* Advanced (collapsible) */}
            <View style={{ paddingHorizontal: 20, marginTop: 20 }}>
              <Pressable
                onPress={() => {
                  haptics.light()
                  setAdvancedOpen((v) => !v)
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 8,
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '700', color: COLORS.muted }}>
                  Advanced
                </Text>
                <Text style={{ fontSize: 14, color: COLORS.subtle }}>
                  {advancedOpen ? '▲' : '▼'}
                </Text>
              </Pressable>

              {advancedOpen ? (
                <Animated.View
                  entering={FadeInDown.duration(180)}
                  exiting={FadeOutUp.duration(140)}
                >
                  <SectionLabel style={{ marginTop: 8 }}>
                    Average Heart Rate (BPM)
                  </SectionLabel>
                  <View
                    style={{
                      backgroundColor: COLORS.fieldBg,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: COLORS.border,
                      paddingHorizontal: 14,
                    }}
                  >
                    <TextInput
                      value={avgBpm}
                      onChangeText={(t) => setAvgBpm(t.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      placeholder="e.g. 152"
                      placeholderTextColor={COLORS.subtle}
                      style={{ height: 52, fontSize: 16, color: COLORS.ink }}
                    />
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.subtle }}>
                    Optional — for users with a wearable.
                  </Text>
                </Animated.View>
              ) : null}
            </View>

            {/* Save */}
            <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
              <PrimaryButton
                label="Save Session"
                onPress={handleSave}
                loading={saving}
                disabled={!canSave}
              />
            </View>
          </ScrollView>
        </TouchableWithoutFeedback>
      </KeyboardAvoidingView>

      
      <ConflictModal
        visible={conflicts != null}
        conflicts={conflicts ?? []}
        sessions={sessions}
        undoing={undoing}
        onKeep={handleKeepSession}
        onUndo={handleUndoSession}
      />
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Sport card — horizontal selector with a scale animation on select   */
/* ------------------------------------------------------------------ */
function SportCard({
  option,
  selected,
  onPress,
}: {
  option: SportOption
  selected: boolean
  onPress: () => void
}) {
  const scale = useSharedValue(1)
  useEffect(() => {
    scale.value = withTiming(selected ? 1.05 : 1, { duration: 100 })
  }, [selected, scale])
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View style={[{ marginRight: 12 }, animStyle]}>
      <Pressable
        onPress={onPress}
        style={{
          width: 100,
          height: 104,
          borderRadius: 16,
          borderWidth: 2,
          borderColor: selected ? option.accent : COLORS.border,
          backgroundColor: selected ? option.accent : COLORS.white,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 8,
        }}
      >
        <Text style={{ fontSize: 34 }}>{option.icon}</Text>
        <Text
          style={{
            marginTop: 8,
            fontSize: 13,
            fontWeight: '700',
            textAlign: 'center',
            color: selected ? COLORS.white : COLORS.ink,
          }}
          numberOfLines={2}
        >
          {option.label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

/* ------------------------------------------------------------------ */
/* Mode toggle — Quick Log vs Track Live segmented control              */
/* ------------------------------------------------------------------ */
function ModeToggle({
  mode,
  onSelect,
}: {
  mode: LogMode
  onSelect: (mode: LogMode) => void
}) {
  const options: { value: LogMode; label: string; icon: string }[] = [
    { value: 'quick', label: 'Quick Log', icon: '✏️' },
    { value: 'live', label: 'Track Live', icon: '📍' },
  ]
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: COLORS.fieldBg,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: COLORS.border,
        padding: 4,
      }}
    >
      {options.map((opt) => {
        const active = mode === opt.value
        return (
          <Pressable
            key={opt.value}
            onPress={() => onSelect(opt.value)}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingVertical: 12,
              borderRadius: 9,
              backgroundColor: active ? COLORS.teal : 'transparent',
            }}
          >
            <Text style={{ fontSize: 15, marginRight: 6 }}>{opt.icon}</Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: active ? COLORS.white : COLORS.muted,
              }}
            >
              {opt.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Estimated-stat mini card                                            */
/* ------------------------------------------------------------------ */
function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: COLORS.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: COLORS.border,
        paddingVertical: 12,
        paddingHorizontal: 10,
        alignItems: 'center',
      }}
    >
      <Text style={{ fontSize: 18 }}>{icon}</Text>
      <Text
        style={{
          marginTop: 4,
          fontSize: 11,
          color: COLORS.subtle,
          textAlign: 'center',
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        style={{
          marginTop: 2,
          fontSize: 13,
          fontWeight: '700',
          color: COLORS.ink,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Section label                                                       */
/* ------------------------------------------------------------------ */
function SectionLabel({
  children,
  style,
}: {
  children: ReactNode
  style?: object
}) {
  return (
    <Text
      style={[
        {
          fontSize: 13,
          fontWeight: '700',
          color: COLORS.body,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
