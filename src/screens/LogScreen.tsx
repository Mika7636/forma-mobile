// Log a session: quick entry, or live GPS tracking.

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
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
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
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
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker'
import { haptics } from '../utils/haptics'
import ConflictModal from '../components/log/ConflictModal'
import FirstSessionModal from '../components/log/FirstSessionModal'
import { stopLiveNotification } from '../services/liveNotification'
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
import { updateUserProfile } from '../services/userService'
import { useAuthStore } from '../store/authStore'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { useIsMounted, useSafeTimeout } from '../hooks/useSafeTimeout'
import { CALIBRATION_SESSION_TARGET } from '../utils/calibration'
import { withPreferenceDefaults } from '../types/notifications'
import type { Conflict } from '../types/conflict'
import type { Session, SportType } from '../types/session'
import type { LogScreenProps } from '../navigation/types'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'
import { onColor, type Palette } from '../theme/tokens'
import { sportVisual } from '../utils/sportMeta'

type LogMode = 'quick' | 'live'

function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

function resolveSessionDate(day: Date, at: Date = new Date()): Date {
  const d = startOfDay(day)
  d.setHours(at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds())
  return d
}

function formatSessionDay(day: Date): string {
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

interface RpeZone {
  label: string
  color: string
}

function rpeZone(rpe: number, colors: Palette): RpeZone {
  if (rpe <= 3) return { label: 'EASY ZONE', color: colors.accent }
  if (rpe <= 7) return { label: 'MODERATE ZONE', color: colors.warn }
  return { label: 'MAX EFFORT', color: colors.danger }
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

function loadSeverity(load: number, colors: Palette): { color: string; label: string } {
  if (load > 600) return { color: colors.danger, label: 'Very hard session' }
  if (load >= 400) return { color: colors.palette.orange, label: 'Hard session' }
  if (load >= 200) return { color: colors.warn, label: 'Moderate session' }
  return { color: colors.accent, label: 'Light session' }
}

const DURATION_MAX = 300

function tint(hex: string): string {
  return `${hex}1A`
}

export default function LogScreen({ route, navigation }: LogScreenProps) {
  const { colors } = useTheme()
  const tabPadding = useTabContentPadding()

  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const { sessions } = useSessionHistory()

  const paramDate = route.params?.date
  const fromPlanner = paramDate != null

  const [sessionDay, setSessionDay] = useState<Date>(() =>
    paramDate ? new Date(`${paramDate}T12:00:00`) : new Date(),
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  useEffect(() => {
    if (paramDate) setSessionDay(new Date(`${paramDate}T12:00:00`))
  }, [paramDate])

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
  const [liveSaved, setLiveSaved] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [celebrated, setCelebrated] = useState<Session | null>(null)
  const [savedSessionId, setSavedSessionId] = useState<string | null>(null)
  const [undoing, setUndoing] = useState(false)

  const lastRpe = useRef(rpe)
  const schedule = useSafeTimeout()
  const isMounted = useIsMounted()

  const liveSnapshot = useRef<LiveSnapshot | null>(null)
  const [recoveredLive, setRecoveredLive] = useState<LiveSnapshot | null>(null)
  const [liveBoundaryKey, setLiveBoundaryKey] = useState(0)

  useEffect(() => {
    let cancelled = false
    const restore = async () => {
      await ensureLiveTrackingHydrated()
      if (cancelled) return
      const live = useLiveTrackingStore.getState()
      if (live.status === 'idle' || !live.sport) return
      setSport(live.sport)
      setMode('live')
    }
    void restore()
    const unsubscribe = navigation.addListener('focus', () => {
      void restore()
    })
    return () => {
      cancelled = true
      unsubscribe()
    }
  }, [navigation])

  useEffect(
    () =>
      navigation.addListener('blur', () => {
        if (!paramDate) return
        navigation.setParams({ date: undefined })
        setSessionDay(new Date())
      }),
    [navigation, paramDate],
  )

  const durationNum = parseInt(duration, 10) || 0
  const distanceNum = distance ? parseFloat(distance) : undefined
  const avgBpmNum = avgBpm ? parseInt(avgBpm, 10) : undefined
  const showDistance = isDistanceSport(sport)

  const today = startOfDay(new Date())
  const isToday = startOfDay(sessionDay).getTime() === today.getTime()
  const isFutureDay = startOfDay(sessionDay).getTime() > today.getTime()

  const canSave =
    sport != null && durationNum >= 1 && durationNum <= DURATION_MAX && !isFutureDay

  const zone = rpeZone(rpe, colors)

  const estimates = useMemo(() => {
    if (!sport) return null
    return computeEstimates(
      { sport, durationMinutes: durationNum, rpe, distanceKm: distanceNum },
      profile,
    )
  }, [sport, durationNum, rpe, distanceNum, profile])

  const load = estimates?.loadScore ?? 0
  const severity = loadSeverity(load, colors)

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
    setSessionDay(new Date())
    setDuration('')
    setDistance('')
    setRpe(5)
    setNotes('')
    setAvgBpm('')
    setAdvancedOpen(false)
  }

  const handleDateChange = (event: DateTimePickerEvent, picked?: Date) => {
    setPickerOpen(false)
    if (event.type !== 'set' || !picked) return
    haptics.selection()
    const day = startOfDay(picked)
    setSessionDay(day.getTime() > today.getTime() ? today : day)
  }

  const handleSelectSport = (value: SportType) => {
    haptics.light()
    setSport(value)
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

  const handleSummaryChange = useCallback(
    (inSummary: boolean) => {
      navigation.setOptions({ tabBarStyle: inSummary ? { display: 'none' } : undefined })
    },
    [navigation],
  )

  useEffect(() => {
    if (mode !== 'live') navigation.setOptions({ tabBarStyle: undefined })
  }, [mode, navigation])

  const goBackToPlannerOrReset = () => {
    setMode('quick')
    if (fromPlanner) navigation.navigate('Planner')
    else resetForm()
  }

  const claimFirstSessionMoment = (firstInWindow: boolean): boolean => {
    if (!user || !profile || profile.firstSessionCelebrated) return false
    setProfile({ ...profile, firstSessionCelebrated: true })
    void updateUserProfile(user.uid, { firstSessionCelebrated: true }).catch(() => {
    })
    return firstInWindow
  }

  const logAndHandle = async (input: LogSessionInput) => {
    if (!user || !profile || saving) return
    Keyboard.dismiss()
    setSaving(true)
    try {
      const { session, conflicts: detected } = await logSession(user.uid, input, profile, {
        calibrating: sessions.length < CALIBRATION_SESSION_TARGET,
      })
      if (input.trackingMode === 'live') {
        void clearLiveSession()
        void stopLiveNotification()
      }

      if (!isMounted.current) return
      setSaving(false)

      const prefs = withPreferenceDefaults(profile.notificationPreferences)
      const withNew = [session, ...sessions]
      if (detected.length > 0) {
        const worst =
          detected.find((c) => c.severity === 'danger') ?? detected[0]
        void sendConflictNotification(worst, prefs)
      }
      void checkAndNotifyStreak(withNew, prefs)

      const isFirstEver = claimFirstSessionMoment(sessions.length === 0)

      if (detected.length > 0) {
        setSavedSessionId(session.id)
        setConflicts(detected)
        return
      }

      toast.success('Session saved', {
        description: `${session.loadScore} AU · ${session.estimatedCalories} kcal`,
      })

      if (isFirstEver) {
        if (input.trackingMode === 'live') setLiveSaved(true)
        setCelebrated(session)
        return
      }

      if (input.trackingMode === 'live') {
        setLiveSaved(true)
        schedule(() => {
          setLiveSaved(false)
          setMode('quick')
          resetForm()
          navigation.navigate('Dashboard')
        }, 900)
        return
      }

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

  const handleCelebrationDone = () => {
    const wasLive = celebrated?.trackingMode === 'live'
    setCelebrated(null)
    if (wasLive) {
      setLiveSaved(false)
      setMode('quick')
      resetForm()
      navigation.navigate('Dashboard')
      return
    }
    goBackToPlannerOrReset()
  }

  const handleSave = () => {
    if (!canSave || !sport) return
    logAndHandle({
      sport,
      date: resolveSessionDate(sessionDay),
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
      date: resolveSessionDate(
        sessionDay,
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
      title: result.title,
      movingTimeMs: result.movingTimeMs,
      splits: result.splits,
      elevationGain: result.elevationGain,
    })
  }

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
    } finally {
      if (!isMounted.current) return
      setUndoing(false)
      setConflicts(null)
      setSavedSessionId(null)
      toast.info('Session undone')
      schedule(goBackToPlannerOrReset, 700)
    }
  }

  if (mode === 'live' && sport) {
    return (
      <>
        <ErrorBoundary
          key={liveBoundaryKey}
          name="LiveTracker"
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
            sportOptions={sports}
            onSportChange={handleSelectSport}
            weightKg={profile?.weightKg}
            saving={saving}
            saved={liveSaved}
            onSummaryChange={handleSummaryChange}
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
        <FirstSessionModal session={celebrated} onDismiss={handleCelebrationDone} />
      </>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: tabPadding }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>
                Log Session
              </Text>
              <Text style={{ marginTop: 4, fontSize: 15, color: colors.textMuted }}>
                Record a workout to track your training load
              </Text>
            </View>

            <SectionLabel style={{ marginTop: 24, paddingHorizontal: 20 }}>
              Sport
            </SectionLabel>
            {sports.length === 0 ? (
              <Text
                style={{
                  paddingHorizontal: 20,
                  fontSize: 14,
                  color: colors.textMuted,
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

            <View style={{ paddingHorizontal: 20 }}>
              <SectionLabel style={{ marginTop: 24 }}>Date</SectionLabel>
              <Pressable
                onPress={() => {
                  haptics.light()
                  setPickerOpen(true)
                }}
                accessibilityRole="button"
                accessibilityLabel={`Session date: ${formatSessionDay(sessionDay)}. Tap to change.`}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  minHeight: 52,
                  paddingHorizontal: 14,
                  backgroundColor: colors.fieldBg,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: isFutureDay ? colors.danger : colors.border,
                }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: '600', color: colors.text }}>
                    {formatSessionDay(sessionDay)}
                  </Text>
                  {!isToday && !isFutureDay ? (
                    <Text style={{ marginTop: 1, fontSize: 12, color: colors.accentText }}>
                      Backdated — counts toward that week, not this one
                    </Text>
                  ) : null}
                </View>
                <Text style={{ fontSize: 18, marginLeft: 10 }}>🗓️</Text>
              </Pressable>

              {isFutureDay ? (
                <Animated.Text
                  entering={FadeIn.duration(160)}
                  style={{
                    marginTop: 6,
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.dangerText,
                  }}
                >
                  You can&apos;t log a session in the future
                </Animated.Text>
              ) : (
                <Text style={{ marginTop: 6, fontSize: 12, color: colors.textSubtle }}>
                  {isToday
                    ? 'Defaults to today. Tap to log a workout you did earlier.'
                    : 'Load, form and conflicts are all calculated as of this date.'}
                </Text>
              )}
            </View>

            {pickerOpen ? (
              <DateTimePicker
                value={sessionDay}
                mode="date"
                display="calendar"
                maximumDate={today}
                onChange={handleDateChange}
              />
            ) : null}

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
                  <Text style={{ fontSize: 44, fontWeight: '800', color: colors.text }}>
                    {durationNum || 0}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSubtle, marginTop: -4 }}>
                    min
                  </Text>
                </View>
                <View
                  style={{
                    flex: 1,
                    backgroundColor: colors.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={duration}
                    onChangeText={(t) => setDuration(t.replace(/[^0-9]/g, '').slice(0, 3))}
                    keyboardType="number-pad"
                    placeholder="e.g. 45"
                    placeholderTextColor={colors.textSubtle}
                    style={{ height: 56, fontSize: 20, color: colors.text }}
                  />
                </View>
              </View>
              {durationNum > DURATION_MAX ? (
                <Text style={{ marginTop: 6, fontSize: 12, color: colors.dangerText }}>
                  Keep it under {DURATION_MAX} minutes.
                </Text>
              ) : null}
            </View>

            {showDistance ? (
              <Animated.View
                entering={FadeInDown.duration(200)}
                exiting={FadeOutUp.duration(160)}
                style={{ paddingHorizontal: 20 }}
              >
                <SectionLabel style={{ marginTop: 20 }}>Distance (km)</SectionLabel>
                <View
                  style={{
                    backgroundColor: colors.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={distance}
                    onChangeText={(t) => {
                      const cleaned = t.replace(/[^0-9.]/g, '')
                      const parts = cleaned.split('.')
                      setDistance(
                        parts.length > 2
                          ? `${parts[0]}.${parts.slice(1).join('')}`
                          : cleaned,
                      )
                    }}
                    keyboardType="decimal-pad"
                    placeholder="e.g. 5.0"
                    placeholderTextColor={colors.textSubtle}
                    style={{ height: 56, fontSize: 20, color: colors.text }}
                  />
                </View>
              </Animated.View>
            ) : null}

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
                      color: onColor(zone.color),
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
                maximumTrackTintColor={colors.border}
                thumbTintColor={zone.color}
              />

              <Text style={{ fontSize: 14, color: colors.textBody, marginTop: 2 }}>
                {RPE_DESCRIPTIONS[rpe]}
              </Text>
            </View>

            {estimates && durationNum > 0 ? (
              <Animated.View
                entering={FadeIn.duration(200)}
                style={{
                  marginTop: 16,
                  marginHorizontal: 16,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.warnSoft,
                  borderWidth: 1,
                  borderColor: colors.warnBorder,
                  borderRadius: 16,
                  paddingVertical: 14,
                }}
              >
                <Text style={{ fontSize: 22, marginRight: 8 }}>🔥</Text>
                <Text style={{ fontSize: 24, fontWeight: '800', color: colors.warnText }}>
                  Est. {estimates.estimatedCalories} kcal
                </Text>
              </Animated.View>
            ) : null}

            <View
              style={{
                marginTop: 20,
                marginHorizontal: 16,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.fieldBg,
                padding: 18,
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '800',
                  letterSpacing: 1,
                  color: colors.textMuted,
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
                <Text style={{ fontSize: 52, fontWeight: '800', color: colors.accent }}>
                  {load}
                </Text>
                <Text
                  style={{
                    fontSize: 18,
                    fontWeight: '700',
                    color: colors.accent,
                    marginBottom: 9,
                    marginLeft: 6,
                  }}
                >
                  AU
                </Text>
              </Animated.View>

              <Text style={{ fontSize: 13, color: colors.textMuted }}>
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
                <Text style={{ fontSize: 14, fontWeight: '600', color: colors.textBody }}>
                  {severity.label}
                </Text>
              </View>
            </View>

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

            <View style={{ paddingHorizontal: 20 }}>
              <SectionLabel style={{ marginTop: 24 }}>Notes (optional)</SectionLabel>
              <View
                style={{
                  backgroundColor: colors.fieldBg,
                  borderRadius: 12,
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  paddingHorizontal: 14,
                  paddingVertical: 4,
                }}
              >
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  multiline
                  placeholder="How did it feel? Any observations..."
                  placeholderTextColor={colors.textSubtle}
                  style={{
                    minHeight: 60,
                    maxHeight: 100,
                    fontSize: 16,
                    color: colors.text,
                    paddingTop: 10,
                    textAlignVertical: 'top',
                  }}
                />
              </View>
            </View>

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
                <Text style={{ fontSize: 14, fontWeight: '700', color: colors.textMuted }}>
                  Advanced
                </Text>
                <Text style={{ fontSize: 14, color: colors.textSubtle }}>
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
                      backgroundColor: colors.fieldBg,
                      borderRadius: 12,
                      borderWidth: 1.5,
                      borderColor: colors.border,
                      paddingHorizontal: 14,
                    }}
                  >
                    <TextInput
                      value={avgBpm}
                      onChangeText={(t) => setAvgBpm(t.replace(/[^0-9]/g, '').slice(0, 3))}
                      keyboardType="number-pad"
                      placeholder="e.g. 152"
                      placeholderTextColor={colors.textSubtle}
                      style={{ height: 52, fontSize: 16, color: colors.text }}
                    />
                  </View>
                  <Text style={{ marginTop: 6, fontSize: 12, color: colors.textSubtle }}>
                    Optional — for users with a wearable.
                  </Text>
                </Animated.View>
              ) : null}
            </View>

            <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
              <PrimaryButton
                label={
                  isToday
                    ? 'Save Session'
                    : `Save to ${sessionDay.toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}`
                }
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

      <FirstSessionModal session={celebrated} onDismiss={handleCelebrationDone} />
    </SafeAreaView>
  )
}

function SportCard({
  option,
  selected,
  onPress,
}: {
  option: SportOption
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()
  const accent = sportVisual(option.value, colors).color

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
          borderColor: selected ? accent : colors.border,
          backgroundColor: selected ? accent : colors.surfaceAlt,
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
            color: selected ? onColor(accent) : colors.text,
          }}
          numberOfLines={2}
        >
          {option.label}
        </Text>
      </Pressable>
    </Animated.View>
  )
}

function ModeToggle({
  mode,
  onSelect,
}: {
  mode: LogMode
  onSelect: (mode: LogMode) => void
}) {
  const { colors } = useTheme()

  const options: { value: LogMode; label: string; icon: string }[] = [
    { value: 'quick', label: 'Quick Log', icon: '✏️' },
    { value: 'live', label: 'Track Live', icon: '📍' },
  ]
  return (
    <View
      style={{
        flexDirection: 'row',
        backgroundColor: colors.fieldBg,
        borderRadius: 12,
        borderWidth: 1.5,
        borderColor: colors.border,
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
              backgroundColor: active ? colors.accent : 'transparent',
            }}
          >
            <Text style={{ fontSize: 15, marginRight: 6 }}>{opt.icon}</Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: active ? colors.onAccent : colors.textMuted,
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

function StatCard({ icon, label, value }: { icon: string; label: string; value: string }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flex: 1,
        marginHorizontal: 4,
        backgroundColor: colors.surface,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: colors.border,
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
          color: colors.textSubtle,
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
          color: colors.text,
          textAlign: 'center',
        }}
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  )
}

function SectionLabel({
  children,
  style,
}: {
  children: ReactNode
  style?: object
}) {
  const { colors } = useTheme()

  return (
    <Text
      style={[
        {
          fontSize: 13,
          fontWeight: '700',
          color: colors.textBody,
          marginBottom: 10,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
