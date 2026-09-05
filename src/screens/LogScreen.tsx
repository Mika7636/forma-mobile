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

/** Local midnight of a date — the day, with the clock stripped off it. */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * The timestamp to persist for a session.
 *
 * The chosen calendar day, stamped with an actual wall-clock time (from `at`,
 * defaulting to now). The time matters even though the athlete never picks one:
 * without it every backdated session would land at the noon we parse a day
 * string to, and a day holding three of them would show three workouts all at
 * "12:00 PM". `at` lets a live session pass its true start time instead.
 *
 * For today — the default — this is simply now.
 */
function resolveSessionDate(day: Date, at: Date = new Date()): Date {
  const d = startOfDay(day)
  d.setHours(at.getHours(), at.getMinutes(), at.getSeconds(), at.getMilliseconds())
  return d
}

/** "Mon, 25 Aug 2026" — the date as the field and the save button show it. */
function formatSessionDay(day: Date): string {
  return day.toLocaleDateString(undefined, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

/* --- RPE zones -------------------------------------------------------- */

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

/* --- Training-load severity ------------------------------------------- */
function loadSeverity(load: number, colors: Palette): { color: string; label: string } {
  if (load > 600) return { color: colors.danger, label: 'Very hard session' }
  if (load >= 400) return { color: colors.palette.orange, label: 'Hard session' }
  if (load >= 200) return { color: colors.warn, label: 'Moderate session' }
  return { color: colors.accent, label: 'Light session' }
}

const DURATION_MAX = 300

/** Hex colour + "10% opacity" alpha suffix for soft zone tints. */
function tint(hex: string): string {
  return `${hex}1A`
}

export default function LogScreen({ route, navigation }: LogScreenProps) {
  const { colors } = useTheme()
  // Reserve room for the tab bar, which is drawn over the end of this list.
  const tabPadding = useTabContentPadding()

  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  // Count-based calibration gate: a user with < 7 sessions gets gentler conflict
  // detection (no volume warnings, sensitivity one notch softer).
  const { sessions } = useSessionHistory()

  // A date handed over from the Planner seeds the field and sends the user back
  // there after saving. Parse at local noon so the calendar day never slips
  // (a `YYYY-MM-DD` read as UTC midnight lands on the day before, west of
  // Greenwich).
  const paramDate = route.params?.date
  const fromPlanner = paramDate != null

  /**
   * The day this session happened, as a calendar day.
   *
   * State rather than a prop derived from the route, because the athlete can now
   * change it — which is the whole point of the field. Someone who has been
   * training for months should not have to log 42 fresh training days for a Form
   * Score when they can enter the ones they already trained.
   */
  const [sessionDay, setSessionDay] = useState<Date>(() =>
    paramDate ? new Date(`${paramDate}T12:00:00`) : new Date(),
  )
  const [pickerOpen, setPickerOpen] = useState(false)

  // Re-seed when the Planner hands over a *different* day. Guarded on the param
  // itself so it cannot clobber a date the athlete picked by hand: the blur
  // listener below clears the param on the way out, and an unguarded effect
  // would read that as "go back to today" on the next focus.
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
  /**
   * True for the beat between a live session landing in Firestore and this
   * screen routing away. It is what turns the Save button into "✓ Saved" — the
   * write is the one irreversible step in the flow, and acknowledging it before
   * the screen changes is the difference between "did that work?" and knowing.
   */
  const [liveSaved, setLiveSaved] = useState(false)
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  /** The session behind the one-time first-save celebration, while it is up. */
  const [celebrated, setCelebrated] = useState<Session | null>(null)
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
  //
  // Re-run on focus as well as on mount. Tapping the live notification routes to
  // this tab, and a bottom-tab screen the athlete has already visited is still
  // mounted — so a mount-only effect would leave them staring at the quick-log
  // form while their run kept recording in the shade.
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

  // A tab's params outlive the visit that set them, so a date handed over by the
  // Planner would still be pinned here days later — the user would tap the Log
  // tab and be told they're logging for last Tuesday. Drop it on the way out,
  // *and* put the field back to today: clearing the param alone no longer
  // undoes the handoff now that the date lives in state, and the seeding effect
  // above deliberately ignores an absent param so it cannot clobber a manual
  // pick. Scoped to a param-sourced visit, so a date the athlete chose by hand
  // during an ordinary visit is not what this resets.
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

  // Recomputed per render rather than memoised on mount: the screen can sit
  // open across midnight, and a "today" cached yesterday would start rejecting
  // a session logged this morning as being in the future.
  const today = startOfDay(new Date())
  const isToday = startOfDay(sessionDay).getTime() === today.getTime()
  // The picker's `maximumDate` already makes this unreachable by tapping. It is
  // still checked, because the state can also arrive from the Planner's route
  // param — which is how a future day *can* land here, since planning ahead is
  // exactly what that screen is for.
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
    // Back to today: the next session logged from a cleared form is almost
    // always the one happening now, and a date left pinned to last Tuesday is
    // the bug the Planner param's blur handler already exists to prevent.
    setSessionDay(new Date())
    setDuration('')
    setDistance('')
    setRpe(5)
    setNotes('')
    setAvgBpm('')
    setAdvancedOpen(false)
  }

  /**
   * Android fires this for both a pick and a dismissal, and keeps the dialog
   * mounted until it is unmounted from here — hence closing on every event
   * rather than only on a selection.
   */
  const handleDateChange = (event: DateTimePickerEvent, picked?: Date) => {
    setPickerOpen(false)
    if (event.type !== 'set' || !picked) return
    haptics.selection()
    // Clamp rather than trust: `maximumDate` is enforced by the OS dialog, and
    // the OS is not this app's input validator.
    const day = startOfDay(picked)
    setSessionDay(day.getTime() > today.getTime() ? today : day)
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

  /**
   * Hide the bottom tab bar while the finished-workout summary is up.
   *
   * That screen is full-bleed and carries its own sticky Save/Discard bar; a tab
   * bar under it puts a second, competing set of destinations next to the one
   * action the athlete is there to take, and cuts the design off at the ankles.
   * Passing `undefined` restores whatever the navigator's `screenOptions` set.
   */
  const handleSummaryChange = useCallback(
    (inSummary: boolean) => {
      navigation.setOptions({ tabBarStyle: inSummary ? { display: 'none' } : undefined })
    },
    [navigation],
  )

  // Belt to `handleSummaryChange`'s braces: leaving live mode by any route —
  // discard, exit, a save that navigated away — puts the bar back.
  useEffect(() => {
    if (mode !== 'live') navigation.setOptions({ tabBarStyle: undefined })
  }, [mode, navigation])

  const goBackToPlannerOrReset = () => {
    setMode('quick')
    if (fromPlanner) navigation.navigate('Planner')
    else resetForm()
  }

  /**
   * Retire the one-time first-session gate, and say whether the moment is
   * actually due.
   *
   * Two conditions, doing two different jobs. The profile flag is the "only ever
   * once" guarantee and is cleared on the first save either way — that is what
   * quietly retires the gate for an athlete who already had months of history
   * when this shipped. The empty-window check is what makes it *their first
   * session* rather than merely their first since the feature existed.
   *
   * The write is fire-and-forget: a celebration is not worth blocking a
   * successful save on, and the local `setProfile` (which mirrors to the profile
   * cache) is what the rest of this session reads.
   */
  const claimFirstSessionMoment = (firstInWindow: boolean): boolean => {
    if (!user || !profile || profile.firstSessionCelebrated) return false
    setProfile({ ...profile, firstSessionCelebrated: true })
    void updateUserProfile(user.uid, { firstSessionCelebrated: true }).catch(() => {
      // Worst case the flag is only local and a reinstall replays the moment
      // once. Not worth an error toast on an otherwise successful save.
    })
    return firstInWindow
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
      if (input.trackingMode === 'live') {
        void clearLiveSession()
        // The run is saved; nothing should still be counting in the shade. Stop
        // also takes it down, so this is the belt to that braces — it covers the
        // save landing after this screen has been torn down.
        void stopLiveNotification()
      }

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

      // Captured before the modal branches below, because `sessions` is the
      // pre-save snapshot: empty means nothing had been logged until now.
      const isFirstEver = claimFirstSessionMoment(sessions.length === 0)

      if (detected.length > 0) {
        setSavedSessionId(session.id)
        setConflicts(detected)
        return
      }

      // The toast fires the success haptic itself — see toastStore.
      toast.success('Session saved', {
        description: `${session.loadScore} AU · ${session.estimatedCalories} kcal`,
      })

      // The first-ever save gets its moment, and owns the navigation that
      // follows: the auto-return below would unmount the modal under the reader.
      // A first session cannot clash with anything (there is nothing to clash
      // with), so this can never be competing with the conflict modal above.
      if (isFirstEver) {
        // Live saves acknowledge the write on the Save button itself; hold that
        // "✓ Saved" state behind the modal so the summary underneath still reads
        // as finished rather than as though the tap did nothing.
        if (input.trackingMode === 'live') setLiveSaved(true)
        setCelebrated(session)
        return
      }

      if (input.trackingMode === 'live') {
        // Hold the summary on screen with the button in its "Saved" state, then
        // send them to the Dashboard — a live workout's payoff is what it did to
        // their Form, and that is what the Dashboard shows. Deliberately not the
        // empty log form they just finished with.
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

  /** Close the first-session moment and run the navigation it deferred. */
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
      // Live sessions are stamped with when tracking actually started, not when
      // the summary was saved (which can be many minutes later).
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
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 8 }}>
              <Text style={{ fontSize: 30, fontWeight: '800', color: colors.text }}>
                Log Session
              </Text>
              <Text style={{ marginTop: 4, fontSize: 15, color: colors.textMuted }}>
                Record a workout to track your training load
              </Text>
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

            {/* Date. Directly under Sport and above everything the session is
                *made* of, because it answers a different question — not "what
                did you do" but "when" — and because a backdated session has to
                announce itself before the athlete has filled the form in. */}
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
                  // The field carries the error, not a toast or an alert: the
                  // thing that is wrong is *this value*, and the correction is
                  // one tap away inside this row.
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
                // The OS dialog refuses tomorrow outright, which is a better
                // answer than letting it be picked and then complaining.
                maximumDate={today}
                onChange={handleDateChange}
              />
            ) : null}

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
                    placeholderTextColor={colors.textSubtle}
                    style={{ height: 56, fontSize: 20, color: colors.text }}
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

            {/* Training load */}
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

            {/* Save */}
            <View style={{ paddingHorizontal: 20, marginTop: 28 }}>
              <PrimaryButton
                // Names the day whenever it isn't today, so a backdated save
                // can't happen by accident — the button is the last thing read
                // before the write, and it is where a wrong date is cheapest to
                // catch. Short form ("Save to Mon, 25 Aug"): the year is in the
                // field above and would push this to two lines.
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

/* ------------------------------------------------------------------ */
/* Estimated-stat mini card                                            */
/* ------------------------------------------------------------------ */
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
