import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Slider from '@react-native-community/slider'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import ConflictSensitivity from '../components/settings/ConflictSensitivity'
import EmailVerificationRow from '../components/settings/EmailVerificationRow'
import NotificationSettings from '../components/settings/NotificationSettings'
import SportInteractionMatrix from '../components/settings/SportInteractionMatrix'
import SettingsSkeleton from '../components/settings/SettingsSkeleton'
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DEFAULT_BUDGET_HOURS,
  EXPERIENCE_OPTIONS,
  SPORT_OPTIONS,
  calculateBaselineCTL,
  calculateBaselineWeeklyLoad,
  getBudgetTier,
} from '../constants/training'
import { clearTrainingData } from '../services/sessionService'
import { resetDemoData } from '../services/demoService'
import { getUserProfile, updateUserProfile } from '../services/userService'
import {
  DEMO_BLOCKED_DESCRIPTION,
  DEMO_BLOCKED_TITLE,
} from '../config/demo'
import { useAuthStore, useIsDemo } from '../store/authStore'
import { useIsMounted } from '../hooks/useSafeTimeout'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { haptics } from '../utils/haptics'
import type { AppStackParamList } from '../navigation/types'
import {
  withPreferenceDefaults,
  type NotificationPreferences,
} from '../types/notifications'
import type { SportType } from '../types/session'
import type {
  ConflictSensitivity as SensitivityLevel,
  ExperienceLevel,
  User,
  WeightUnit,
} from '../types/user'
import { RADIUS, SPACING, TYPE, cardStyle, onColor } from '../theme/tokens'
import { sportVisual } from '../utils/sportMeta'
import AppearanceSetting from '../components/settings/AppearanceSetting'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

const LB_PER_KG = 2.20462
const SAVE_DEBOUNCE_MS = 500

/** Canonical alphabetical pair key — matches conflictDetector's pairKey(). */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('_')
}

export default function SettingsScreen() {
  const { colors } = useTheme()
  // Reserve room for the tab bar, which is drawn over the end of this list.
  const tabPadding = useTabContentPadding()

  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>()
  const isDemo = useIsDemo()
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)
  const signOut = useAuthStore((s) => s.signOut)
  const deleteAccount = useAuthStore((s) => s.deleteAccount)

  const email = profile?.email ?? user?.email ?? ''

  // --- Editable local state (seeded once from the profile) ---
  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [sports, setSports] = useState<SportType[]>(profile?.sports ?? [])
  const [budget, setBudget] = useState(profile?.weeklyBudgetHours ?? DEFAULT_BUDGET_HOURS)
  const [experience, setExperience] = useState<ExperienceLevel>(
    profile?.experienceLevel ?? 'beginner',
  )
  const [weightUnit, setWeightUnit] = useState<WeightUnit>(profile?.weightUnit ?? 'kg')
  const [weightInput, setWeightInput] = useState(() => {
    const kg = profile?.weightKg ?? 70
    return String(profile?.weightUnit === 'lb' ? Math.round(kg * LB_PER_KG) : kg)
  })
  const [sensitivity, setSensitivity] = useState<SensitivityLevel>(
    profile?.conflictSensitivity ?? 'balanced',
  )
  const [interactions, setInteractions] = useState<Record<string, number>>(
    profile?.sportInteractions ?? {},
  )
  const [notifications, setNotifications] = useState<NotificationPreferences>(() =>
    withPreferenceDefaults(profile?.notificationPreferences),
  )

  const [matrixOpen, setMatrixOpen] = useState(false)
  const [saving, setSaving] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [clearOpen, setClearOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [resetOpen, setResetOpen] = useState(false)
  const [resettingDemo, setResettingDemo] = useState(false)

  const pendingRef = useRef<Partial<User>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const isMounted = useIsMounted()

  // Debounced Firestore write. Accumulates partial updates, flushes after a
  // quiet period, and mirrors the result into the store so every other screen
  // (Log's sport list, Dashboard's budget, the conflict engine) reflects it.
  const flush = useCallback(async () => {
    const uid = user?.uid
    const base = useAuthStore.getState().profile
    const updates = pendingRef.current
    pendingRef.current = {}
    if (!uid || !base || Object.keys(updates).length === 0) {
      setSaving(false)
      return
    }
    try {
      await updateUserProfile(uid, updates)
      // setProfile and toast are global stores, so they are safe to call after
      // unmount — that's what makes the flush-on-unmount below work. Only the
      // local `saving` flag needs the guard.
      setProfile({ ...base, ...updates })
      // The toast fires the success haptic itself — see toastStore.
      toast.success('Settings saved')
    } catch {
      toast.error('Could not save settings', {
        description: 'Your changes are still here. Check your connection.',
      })
    } finally {
      if (isMounted.current) setSaving(false)
    }
  }, [user?.uid, setProfile, isMounted])

  const queueSave = useCallback(
    (updates: Partial<User>) => {
      pendingRef.current = { ...pendingRef.current, ...updates }
      setSaving(true)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

  /**
   * Refuse a settings change while the demo account is signed in, and say why.
   *
   * Returns `true` when the caller should stop. Every handler that writes to the
   * profile calls this first — see `config/demo` for why the line is drawn at
   * profile writes specifically, and why logging and editing sessions is
   * deliberately still allowed.
   *
   * A toast rather than an alert: a stranger poking at a settings screen should
   * be told what happened and left where they are, not made to dismiss a modal
   * for something they were only exploring.
   */
  const blockedInDemo = useCallback((): boolean => {
    if (!isDemo) return false
    toast.info(DEMO_BLOCKED_TITLE, { description: DEMO_BLOCKED_DESCRIPTION })
    return true
  }, [isDemo])

  // Unmounting mid-debounce (log out right after typing a name) would drop the
  // pending write, so flush it on the way out. The write is fire-and-forget:
  // Firestore queues it locally and sends it once the tree is already gone.
  const flushRef = useRef(flush)
  flushRef.current = flush
  useEffect(
    () => () => {
      if (saveTimer.current) {
        clearTimeout(saveTimer.current)
        void flushRef.current()
      }
    },
    [],
  )

  // --- Field handlers ---
  const onChangeName = (text: string) => {
    if (blockedInDemo()) return
    setDisplayName(text)
    queueSave({ displayName: text.trim() })
  }

  const toggleSport = (value: SportType) => {
    if (blockedInDemo()) return
    const next = sports.includes(value)
      ? sports.filter((s) => s !== value)
      : [...sports, value]
    if (next.length === 0) {
      // Must keep at least one active sport.
      toast.warning('Keep at least one sport', {
        description: 'FORMA needs a sport to plan and score your training.',
      })
      return
    }
    haptics.selection()
    setSports(next)
    queueSave({ sports: next })
  }

  const onBudgetChange = (value: number) => {
    if (blockedInDemo()) return
    const hours = Math.round(value)
    if (hours === budget) return
    setBudget(hours)
    queueSave({
      weeklyBudgetHours: hours,
      baselineCTL: calculateBaselineCTL(hours, experience),
      baselineWeeklyLoad: calculateBaselineWeeklyLoad(hours, experience),
    })
  }

  const onSelectExperience = (value: ExperienceLevel) => {
    if (blockedInDemo()) return
    haptics.selection()
    setExperience(value)
    queueSave({
      experienceLevel: value,
      baselineCTL: calculateBaselineCTL(budget, value),
      baselineWeeklyLoad: calculateBaselineWeeklyLoad(budget, value),
    })
  }

  const onChangeWeight = (text: string) => {
    if (blockedInDemo()) return
    const cleaned = text.replace(/[^0-9]/g, '').slice(0, 3)
    setWeightInput(cleaned)
    const num = parseInt(cleaned, 10)
    if (!Number.isNaN(num) && num > 0) {
      const kg = weightUnit === 'lb' ? Math.round(num / LB_PER_KG) : num
      queueSave({ weightKg: kg, weightUnit })
    }
  }

  const onToggleUnit = (unit: WeightUnit) => {
    if (unit === weightUnit) return
    if (blockedInDemo()) return
    haptics.selection()
    const num = parseFloat(weightInput)
    if (!Number.isNaN(num)) {
      const converted = unit === 'lb' ? num * LB_PER_KG : num / LB_PER_KG
      const rounded = Math.round(converted)
      setWeightInput(String(rounded))
      const kg = unit === 'lb' ? Math.round(rounded / LB_PER_KG) : rounded
      queueSave({ weightKg: kg, weightUnit: unit })
    }
    setWeightUnit(unit)
  }

  // Haptics for these two live in the child components (ConflictSensitivity /
  // SportInteractionMatrix), so the handlers just persist.
  const onSelectSensitivity = (value: SensitivityLevel) => {
    if (blockedInDemo()) return
    setSensitivity(value)
    queueSave({ conflictSensitivity: value })
  }

  const onSetInteraction = (a: SportType, b: SportType, level: number) => {
    if (blockedInDemo()) return
    const next = { ...interactions, [pairKey(a, b)]: level }
    setInteractions(next)
    queueSave({ sportInteractions: next })
  }

  // Persisting is all we do here: `useNotificationSync` (RootNavigator) watches
  // the saved preferences and reconciles the OS schedule, so a toggle can't
  // leave an orphaned notification behind. Haptics live in the child.
  const onChangeNotifications = (next: NotificationPreferences) => {
    if (blockedInDemo()) return
    setNotifications(next)
    queueSave({ notificationPreferences: next })
  }

  // Pull-to-refresh: re-read the profile from Firestore and reseed the form.
  const onRefresh = useCallback(async () => {
    const uid = user?.uid
    if (!uid) return
    setRefreshing(true)
    try {
      const fresh = await getUserProfile(uid)
      if (fresh) {
        setProfile(fresh)
        setDisplayName(fresh.displayName)
        setSports(fresh.sports ?? [])
        setBudget(fresh.weeklyBudgetHours ?? DEFAULT_BUDGET_HOURS)
        setExperience(fresh.experienceLevel ?? 'beginner')
        setWeightUnit(fresh.weightUnit ?? 'kg')
        const kg = fresh.weightKg ?? 70
        setWeightInput(String(fresh.weightUnit === 'lb' ? Math.round(kg * LB_PER_KG) : kg))
        setSensitivity(fresh.conflictSensitivity ?? 'balanced')
        setInteractions(fresh.sportInteractions ?? {})
        setNotifications(withPreferenceDefaults(fresh.notificationPreferences))
      }
    } finally {
      setRefreshing(false)
    }
  }, [user?.uid, setProfile])

  // --- Destructive actions ---
  const handleLogout = () => {
    haptics.warning()
    // Same action, different words. On the demo handset "log out" describes
    // nothing the person holding it did — they never logged in — and the useful
    // reassurance is that the sample data survives, which is not what a
    // destructive-styled "are you sure you want to log out" conveys.
    if (isDemo) {
      Alert.alert(
        'Leave the demo?',
        'This returns to the login screen. Tap "Try Demo" there to come back — the sample data is untouched.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Exit Demo', onPress: () => void signOut() },
        ],
      )
      return
    }
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  const handleClearData = async () => {
    const uid = user?.uid
    if (!uid) return
    // Belt and braces: the button is already hidden in demo mode, but this is
    // the one action that would destroy the seeded story outright.
    if (blockedInDemo()) return
    try {
      await clearTrainingData(uid)
      setClearOpen(false)
      toast.warning('All training data cleared')
    } catch {
      // Previously an unhandled rejection: the confirm modal simply stayed open
      // with no explanation, and the user had no idea whether the wipe had
      // partially happened.
      setClearOpen(false)
      toast.error('Could not clear data', {
        description: isOffline()
          ? "You're offline — reconnect and try again."
          : 'Some data may not have been removed. Please try again.',
      })
    }
  }

  const handleDeleteAccount = async () => {
    if (blockedInDemo()) return
    try {
      await deleteAccount()
      // On success RootNavigator swaps to the auth stack automatically.
    } catch (err) {
      setDeleteOpen(false)
      const code = (err as { code?: string })?.code
      if (code === 'auth/requires-recent-login') {
        Alert.alert(
          'Please log in again',
          'For security, log out and back in, then retry deleting your account.',
        )
      } else {
        Alert.alert('Could not delete account', 'Something went wrong. Please try again.')
      }
    }
  }

  /**
   * Put the demo account back the way it was seeded.
   *
   * Runs the same generator the seed script runs, re-anchored to now — so a
   * reset on the afternoon of the pitch produces a twelve-week story ending that
   * afternoon, not a replay of whatever window existed when the script was run.
   * See `services/demoService`.
   *
   * The rebuilt profile is pushed into the auth store and back into this
   * screen's own form state, because the reset rewrites the profile too: leaving
   * the sliders showing the previous tester's values while Firestore held the
   * seeded ones would make the next edit write the stale figures back.
   */
  const handleResetDemo = async () => {
    const uid = user?.uid
    if (!uid || resettingDemo) return
    setResettingDemo(true)
    try {
      const result = await resetDemoData(uid, profile?.email ?? user?.email)
      setProfile(result.profile)
      setDisplayName(result.profile.displayName)
      setSports(result.profile.sports)
      setBudget(result.profile.weeklyBudgetHours)
      setExperience(result.profile.experienceLevel)
      setWeightUnit(result.profile.weightUnit ?? 'kg')
      setWeightInput(String(result.profile.weightKg ?? 70))
      setSensitivity(result.profile.conflictSensitivity ?? 'balanced')
      setInteractions(result.profile.sportInteractions ?? {})
      setNotifications(withPreferenceDefaults(result.profile.notificationPreferences))
      setResetOpen(false)

      // Named failures rather than a bare "done": the operator is about to hand
      // the phone to a stranger, and "which screen should I check first" is the
      // only useful thing to say when a condition did not come back.
      if (result.failedChecks.length > 0) {
        toast.warning('Demo data reset, with warnings', {
          description: `Check: ${result.failedChecks.join('; ')}`,
          duration: 7000,
        })
      } else {
        toast.success('Demo data reset', {
          description: `${result.sessions} sessions, ${result.conflicts} conflicts and ${result.planned} planned sessions restored.`,
        })
      }
    } catch {
      setResetOpen(false)
      toast.error('Could not reset the demo', {
        description: isOffline()
          ? "You're offline — reconnect and try again."
          : 'Some data may be half-written. Try again before the next tester.',
      })
    } finally {
      if (isMounted.current) setResettingDemo(false)
    }
  }

  const budgetTier = getBudgetTier(budget)
  const initial = (displayName.trim().charAt(0) || '?').toUpperCase()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: SPACING.base, paddingBottom: tabPadding }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPE.display, fontWeight: '800', color: colors.text }}>
                Settings
              </Text>
              <Text style={{ marginTop: 4, fontSize: TYPE.body, color: colors.textMuted }}>
                Manage your profile and training preferences
              </Text>
            </View>
            {saving ? (
              <Animated.View
                entering={FadeIn.duration(150)}
                exiting={FadeOut.duration(150)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.accentSoft,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  marginTop: 6,
                }}
              >
                <ActivityIndicator size="small" color={colors.accent} />
                <Text
                  style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: colors.accentPressed }}
                >
                  Saving…
                </Text>
              </Animated.View>
            ) : null}
          </View>

          {/* Until the profile resolves, show its shape rather than a screen
              full of `?? default` values that look exactly like real settings. */}
          {!profile ? (
            <View style={{ marginTop: SPACING.lg }}>
              <SettingsSkeleton />
            </View>
          ) : (
            <>
            {/* Profile */}
            <Card title="Profile">
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                <View
                  style={{
                    width: 56,
                    height: 56,
                    borderRadius: 28,
                    backgroundColor: colors.accent,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Text style={{ color: colors.onAccent, fontSize: 24, fontWeight: '800' }}>
                    {initial}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>
                    DISPLAY NAME
                  </Text>
                  {/* In demo mode the field is locked rather than merely
                      unsaved. Leaving it editable and silently discarding the
                      write would let a tester rename the athlete on screen and
                      watch the name revert on the next render, which reads as a
                      bug; `pointerEvents="none"` hands the tap to the wrapper,
                      which explains instead. */}
                  <DemoLock active={isDemo} onBlocked={blockedInDemo}>
                    <TextInput
                      value={displayName}
                      onChangeText={onChangeName}
                      editable={!isDemo}
                      placeholder="Your name"
                      placeholderTextColor={colors.textSubtle}
                      style={{
                        marginTop: 2,
                        fontSize: 18,
                        fontWeight: '700',
                        color: colors.text,
                        paddingVertical: 2,
                      }}
                    />
                  </DemoLock>
                </View>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>EMAIL</Text>
              <View
                style={{
                  marginTop: 4,
                  backgroundColor: colors.fieldBg,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ fontSize: 15, color: colors.textSubtle }}>{email || '—'}</Text>
              </View>
              <Text style={{ marginTop: 6, fontSize: 12, color: colors.textSubtle }}>
                Contact support to change your email.
              </Text>
            </Card>

            {/* Training */}
            <Card title="Training">
              <FieldTitle>Active Sports</FieldTitle>
              <View
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                }}
              >
                {SPORT_OPTIONS.map((opt) => {
                  const selected = sports.includes(opt.value)
                  const accent = sportVisual(opt.value, colors).color
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => toggleSport(opt.value)}
                      style={{
                        width: '48%',
                        marginBottom: 12,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: selected ? accent : colors.border,
                        backgroundColor: selected ? accent : colors.surfaceAlt,
                        paddingVertical: 16,
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 26 }}>{opt.icon}</Text>
                      <Text
                        style={{
                          marginTop: 6,
                          fontSize: 13,
                          fontWeight: '700',
                          color: selected ? onColor(accent) : colors.text,
                        }}
                      >
                        {opt.label}
                      </Text>
                    </Pressable>
                  )
                })}
              </View>

              <FieldTitle style={{ marginTop: 10 }}>Weekly Budget</FieldTitle>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 44, fontWeight: '800', color: colors.accent }}>{budget}</Text>
                <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: -4 }}>hours / week</Text>
                <View
                  style={{
                    marginTop: 8,
                    backgroundColor: colors.accentSoft,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: colors.accentPressed, fontWeight: '700', fontSize: 13 }}>
                    {budgetTier.label}
                  </Text>
                </View>
              </View>
              {/* Disabled as well as guarded: the handler alone would let the
                  thumb be dragged the length of the track and snap back, which
                  looks like the control is broken rather than locked. */}
              <DemoLock active={isDemo} onBlocked={blockedInDemo}>
                <Slider
                  style={{ width: '100%', height: 40, marginTop: 12 }}
                  minimumValue={BUDGET_MIN}
                  maximumValue={BUDGET_MAX}
                  step={1}
                  value={budget}
                  disabled={isDemo}
                  onValueChange={onBudgetChange}
                  minimumTrackTintColor={colors.accent}
                  maximumTrackTintColor={colors.border}
                  thumbTintColor={colors.accent}
                />
              </DemoLock>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {['Casual', 'Active', 'Serious', 'Elite'].map((label) => (
                  <Text key={label} style={{ fontSize: 11, color: colors.textSubtle }}>
                    {label}
                  </Text>
                ))}
              </View>

              <FieldTitle style={{ marginTop: 20 }}>Experience Level</FieldTitle>
              {EXPERIENCE_OPTIONS.map((opt) => {
                const active = experience === opt.value
                return (
                  <Pressable
                    key={opt.value}
                    onPress={() => onSelectExperience(opt.value)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      borderRadius: 14,
                      borderWidth: 2,
                      borderColor: active ? colors.accent : colors.border,
                      backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
                      padding: 14,
                      marginBottom: 10,
                    }}
                  >
                    <Text style={{ fontSize: 26, marginRight: 12 }}>{opt.icon}</Text>
                    <View style={{ flex: 1 }}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: '800',
                          color: active ? colors.accentPressed : colors.text,
                        }}
                      >
                        {opt.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 1 }}>
                        {opt.description}
                      </Text>
                    </View>
                    {active ? (
                      <Text style={{ fontSize: 18, color: colors.accent, marginLeft: 6 }}>✓</Text>
                    ) : null}
                  </Pressable>
                )
              })}
            </Card>

            {/* Body metrics */}
            <Card title="Body Metrics">
              <FieldTitle>Weight</FieldTitle>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
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
                  <DemoLock active={isDemo} onBlocked={blockedInDemo}>
                    <TextInput
                      value={weightInput}
                      onChangeText={onChangeWeight}
                      editable={!isDemo}
                      keyboardType="number-pad"
                      placeholder="70"
                      placeholderTextColor={colors.textSubtle}
                      style={{ height: 50, fontSize: 18, color: colors.text }}
                    />
                  </DemoLock>
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    marginLeft: 12,
                    backgroundColor: colors.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: colors.border,
                    padding: 3,
                  }}
                >
                  {(['kg', 'lb'] as const).map((u) => {
                    const active = weightUnit === u
                    return (
                      <Pressable
                        key={u}
                        onPress={() => onToggleUnit(u)}
                        style={{
                          paddingHorizontal: 16,
                          paddingVertical: 10,
                          borderRadius: 9,
                          backgroundColor: active ? colors.accent : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '700',
                            color: active ? colors.onAccent : colors.textMuted,
                          }}
                        >
                          {u}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
              <Text style={{ marginTop: 8, fontSize: 12, color: colors.textSubtle }}>
                Used to estimate calories for future sessions.
              </Text>
            </Card>

            {/* Conflict detection */}
            <Card title="Conflict Detection">
              <FieldTitle>Conflict Sensitivity</FieldTitle>
              <ConflictSensitivity value={sensitivity} onChange={onSelectSensitivity} />

              <View style={{ height: 1, backgroundColor: colors.border, marginTop: 4, marginBottom: 4 }} />

              <Pressable
                onPress={() => {
                  haptics.light()
                  navigation.navigate('ConflictHistory')
                }}
                accessibilityRole="button"
                accessibilityLabel="Open conflict history"
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  paddingVertical: 14,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 16, marginRight: 10 }}>🗂️</Text>
                  <Text style={{ fontSize: 15, fontWeight: '600', color: colors.text }}>
                    Conflict History
                  </Text>
                </View>
                <Text style={{ fontSize: 22, color: colors.textSubtle }}>›</Text>
              </Pressable>
            </Card>

            {/* Sport interaction matrix (collapsible) */}
            <Card>
              <Pressable
                onPress={() => {
                  haptics.light()
                  setMatrixOpen((v) => !v)
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}
              >
                <Text style={{ fontSize: 16, fontWeight: '800', color: colors.text }}>
                  Sport Interactions
                </Text>
                <Text style={{ fontSize: 15, color: colors.textSubtle }}>{matrixOpen ? '▲' : '▼'}</Text>
              </Pressable>

              {matrixOpen ? (
                <Animated.View entering={FadeInDown.duration(180)} style={{ marginTop: 12 }}>
                  <SportInteractionMatrix
                    sports={sports}
                    interactions={interactions}
                    onChange={onSetInteraction}
                  />
                </Animated.View>
              ) : null}
            </Card>

            {/* Appearance */}
            <Card title="Appearance">
              <AppearanceSetting />
            </Card>

            {/* Notifications */}
            <Card title="Notifications">
              <NotificationSettings
                value={notifications}
                onChange={onChangeNotifications}
                onToast={toast.info}
              />
            </Card>

            {/* Demo — only ever rendered on the demo account. */}
            {isDemo ? (
              <Card title="Demo">
                <Text
                  style={{
                    fontSize: TYPE.small,
                    lineHeight: 19,
                    color: colors.textBody,
                    marginBottom: SPACING.md,
                  }}
                >
                  Restores the twelve-week sample history, its conflicts and next
                  week&apos;s plan — including anything a previous tester logged or
                  edited. Run this between testers.
                </Text>
                <Pressable
                  onPress={() => {
                    haptics.medium()
                    setResetOpen(true)
                  }}
                  disabled={resettingDemo}
                  accessibilityRole="button"
                  accessibilityLabel="Reset demo data"
                  accessibilityState={{ disabled: resettingDemo, busy: resettingDemo }}
                  style={{
                    height: 50,
                    borderRadius: RADIUS.md,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: colors.accent,
                    backgroundColor: colors.surface,
                    opacity: resettingDemo ? 0.6 : 1,
                  }}
                >
                  {resettingDemo ? (
                    <ActivityIndicator color={colors.accent} />
                  ) : (
                    <Text
                      style={{
                        color: colors.accentText,
                        fontSize: TYPE.subtitle,
                        fontWeight: '700',
                      }}
                    >
                      Reset Demo Data
                    </Text>
                  )}
                </Pressable>
              </Card>
            ) : null}

            {/* Data */}
            <Card title="Data">
              <Pressable
                onPress={() => Alert.alert('Export Data', 'Data export is coming soon.')}
                style={{ paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: colors.accentText }}>
                  Export Data
                </Text>
              </Pressable>
              {/* Hidden rather than disabled on the demo account: "Reset Demo
                  Data" above already covers the only reason anybody would reach
                  for it here, and a greyed-out destructive control invites the
                  one tester who wants to find out what it does. */}
              {isDemo ? null : (
                <>
                  <View style={{ height: 1, backgroundColor: colors.border }} />
                  <Pressable
                    onPress={() => {
                      haptics.medium()
                      setClearOpen(true)
                    }}
                    style={{ paddingVertical: 12 }}
                  >
                    <Text style={{ fontSize: 15, fontWeight: '600', color: colors.dangerText }}>
                      Clear All Training Data
                    </Text>
                  </Pressable>
                </>
              )}
            </Card>

            {/* Account */}
            <Card title="Account">
              <EmailVerificationRow />
              <Pressable
                onPress={handleLogout}
                style={{
                  height: 50,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: colors.danger,
                  backgroundColor: colors.surface,
                }}
              >
                <Text style={{ color: colors.dangerText, fontSize: 16, fontWeight: '700' }}>
                  {isDemo ? 'Exit Demo' : 'Log Out'}
                </Text>
              </Pressable>
              {/* Deleting the demo account would end the demo permanently, and
                  no amount of type-to-confirm makes that a risk worth leaving on
                  a phone in a stranger's hands. */}
              {isDemo ? null : (
                <Pressable
                  onPress={() => {
                    haptics.medium()
                    setDeleteOpen(true)
                  }}
                  style={{ alignSelf: 'center', marginTop: 14, padding: 6 }}
                >
                  <Text
                    style={{ fontSize: TYPE.body, fontWeight: '700', color: colors.dangerText }}
                  >
                    Delete Account
                  </Text>
                </Pressable>
              )}
            </Card>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Type-to-confirm: clear data */}
      <ConfirmTypeModal
        visible={clearOpen}
        title="Clear all training data?"
        message="This will permanently delete ALL of your training sessions and conflicts. Your profile and settings stay. This cannot be undone."
        confirmWord="DELETE"
        confirmLabel="Clear Data"
        onConfirm={handleClearData}
        onClose={() => setClearOpen(false)}
      />

      {/* Reset the demo. A plain confirm rather than type-to-confirm: it is run
          repeatedly, by the person running the pitch, and it restores rather
          than destroys — the friction the other two modals exist to add would
          only be in the way here. */}
      <Modal
        visible={resetOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setResetOpen(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.scrim,
            justifyContent: 'center',
            paddingHorizontal: 24,
          }}
        >
          <Animated.View
            entering={FadeInDown.duration(200)}
            style={{ backgroundColor: colors.surface, borderRadius: 20, padding: 20 }}
          >
            <Text
              style={{ fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' }}
            >
              Reset demo data?
            </Text>
            <Text
              style={{
                marginTop: 10,
                fontSize: 14,
                lineHeight: 20,
                color: colors.textBody,
                textAlign: 'center',
              }}
            >
              Everything logged or edited during this session is removed and the sample
              twelve-week history is rebuilt, ending today.
            </Text>
            <Pressable
              onPress={() => void handleResetDemo()}
              disabled={resettingDemo}
              accessibilityRole="button"
              style={{
                height: 50,
                borderRadius: 12,
                marginTop: 16,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent,
                opacity: resettingDemo ? 0.7 : 1,
              }}
            >
              {resettingDemo ? (
                <ActivityIndicator color={colors.onAccent} />
              ) : (
                <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '700' }}>
                  Reset
                </Text>
              )}
            </Pressable>
            <Pressable
              onPress={() => setResetOpen(false)}
              disabled={resettingDemo}
              style={{ height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}
            >
              <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>
                Cancel
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </Modal>

      {/* Type-to-confirm: delete account */}
      <ConfirmTypeModal
        visible={deleteOpen}
        title="Delete your account?"
        message="This permanently deletes your account and all data. This cannot be undone. Type your email to confirm."
        confirmWord={email}
        confirmLabel="Delete Account"
        onConfirm={handleDeleteAccount}
        onClose={() => setDeleteOpen(false)}
      />

    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Reusable pieces                                                     */
/* ------------------------------------------------------------------ */
function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  const { colors } = useTheme()

  return (
    <View style={[cardStyle(colors), { marginTop: SPACING.base }]}>
      {title ? (
        <Text
          style={{
            fontSize: TYPE.micro,
            fontWeight: '800',
            letterSpacing: 1,
            color: colors.textMuted,
            marginBottom: 14,
          }}
        >
          {title.toUpperCase()}
        </Text>
      ) : null}
      {children}
    </View>
  )
}

/**
 * Makes a control inert and turns a tap on it into an explanation.
 *
 * Only for the controls that would otherwise *appear* to accept input — a text
 * field, a slider. The tile-style controls (sports, experience, sensitivity) are
 * all fully controlled by props, so a guarded handler is enough: nothing moves
 * and the toast is the only response. These three move on their own before any
 * handler runs, which is why they need the touches intercepted rather than the
 * writes refused.
 *
 * `pointerEvents="none"` on the inner view rather than `disabled` on the control
 * itself, because a disabled `TextInput` on Android still swallows the touch and
 * the wrapper would never hear it — the tap would do nothing at all, which is
 * the outcome this exists to avoid.
 */
function DemoLock({
  active,
  onBlocked,
  children,
}: {
  active: boolean
  onBlocked: () => boolean
  children: React.ReactNode
}) {
  if (!active) return <>{children}</>

  return (
    <Pressable
      onPress={() => {
        onBlocked()
      }}
      accessibilityRole="button"
      accessibilityLabel="Locked in demo mode"
      accessibilityHint="Settings cannot be changed on the demo account"
    >
      <View pointerEvents="none" style={{ opacity: 0.6 }}>
        {children}
      </View>
    </Pressable>
  )
}

function FieldTitle({ children, style }: { children: React.ReactNode; style?: object }) {
  const { colors } = useTheme()

  return (
    <Text
      style={[
        { fontSize: 13, fontWeight: '700', color: colors.textBody, marginBottom: 10 },
        style,
      ]}
    >
      {children}
    </Text>
  )
}

/**
 * Destructive-action guard: the confirm button stays disabled until the user
 * types the exact `confirmWord` (e.g. "DELETE" or their email). Used for
 * clearing data and deleting the account.
 */
function ConfirmTypeModal({
  visible,
  title,
  message,
  confirmWord,
  confirmLabel,
  onConfirm,
  onClose,
}: {
  visible: boolean
  title: string
  message: string
  confirmWord: string
  confirmLabel: string
  onConfirm: () => void | Promise<void>
  onClose: () => void
}) {
  const { colors } = useTheme()

  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const matches = text.trim() === confirmWord.trim() && confirmWord.length > 0

  const handleConfirm = async () => {
    if (!matches || busy) return
    setBusy(true)
    try {
      await onConfirm()
    } finally {
      setBusy(false)
      setText('')
    }
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setText('')
        onClose()
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: colors.dangerText,
              textAlign: 'center',
            }}
          >
            {title}
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 14,
              lineHeight: 20,
              color: colors.textBody,
              textAlign: 'center',
            }}
          >
            {message}
          </Text>

          <View
            style={{
              marginTop: 16,
              backgroundColor: colors.fieldBg,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: matches ? colors.danger : colors.border,
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={`Type "${confirmWord}"`}
              placeholderTextColor={colors.textSubtle}
              style={{ height: 50, fontSize: 16, color: colors.text }}
            />
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={!matches || busy}
            style={{
              height: 50,
              borderRadius: 12,
              marginTop: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: matches ? colors.danger : colors.border,
            }}
          >
            {busy ? (
              <ActivityIndicator color={colors.onAccent} />
            ) : (
              <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '700' }}>
                {confirmLabel}
              </Text>
            )}
          </Pressable>
          <Pressable
            onPress={() => {
              setText('')
              onClose()
            }}
            disabled={busy}
            style={{ height: 46, alignItems: 'center', justifyContent: 'center', marginTop: 6 }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
