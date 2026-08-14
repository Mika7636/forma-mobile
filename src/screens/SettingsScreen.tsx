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
import { StatusBar } from 'expo-status-bar'
import { useNavigation } from '@react-navigation/native'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import Slider from '@react-native-community/slider'
import Animated, { FadeIn, FadeInDown, FadeOut } from 'react-native-reanimated'
import ConflictSensitivity from '../components/settings/ConflictSensitivity'
import NotificationSettings from '../components/settings/NotificationSettings'
import SportInteractionMatrix from '../components/settings/SportInteractionMatrix'
import SettingsSkeleton from '../components/settings/SettingsSkeleton'
import { CARD, COLORS, SPACING, TYPE } from '../constants/theme'
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
import { getUserProfile, updateUserProfile } from '../services/userService'
import { useAuthStore } from '../store/authStore'
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

const LB_PER_KG = 2.20462
const SAVE_DEBOUNCE_MS = 500

/** Canonical alphabetical pair key — matches conflictDetector's pairKey(). */
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('_')
}

export default function SettingsScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList>>()
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

  const pendingRef = useRef<Partial<User>>({})
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

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
      setProfile({ ...base, ...updates })
      // The toast fires the success haptic itself — see toastStore.
      toast.success('Settings saved')
    } catch {
      toast.error('Could not save settings', {
        description: 'Your changes are still here. Check your connection.',
      })
    } finally {
      setSaving(false)
    }
  }, [user?.uid, setProfile])

  const queueSave = useCallback(
    (updates: Partial<User>) => {
      pendingRef.current = { ...pendingRef.current, ...updates }
      setSaving(true)
      if (saveTimer.current) clearTimeout(saveTimer.current)
      saveTimer.current = setTimeout(() => void flush(), SAVE_DEBOUNCE_MS)
    },
    [flush],
  )

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
    setDisplayName(text)
    queueSave({ displayName: text.trim() })
  }

  const toggleSport = (value: SportType) => {
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
    haptics.selection()
    setExperience(value)
    queueSave({
      experienceLevel: value,
      baselineCTL: calculateBaselineCTL(budget, value),
      baselineWeeklyLoad: calculateBaselineWeeklyLoad(budget, value),
    })
  }

  const onChangeWeight = (text: string) => {
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
    setSensitivity(value)
    queueSave({ conflictSensitivity: value })
  }

  const onSetInteraction = (a: SportType, b: SportType, level: number) => {
    const next = { ...interactions, [pairKey(a, b)]: level }
    setInteractions(next)
    queueSave({ sportInteractions: next })
  }

  // Persisting is all we do here: `useNotificationSync` (RootNavigator) watches
  // the saved preferences and reconciles the OS schedule, so a toggle can't
  // leave an orphaned notification behind. Haptics live in the child.
  const onChangeNotifications = (next: NotificationPreferences) => {
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
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: () => void signOut() },
    ])
  }

  const handleClearData = async () => {
    const uid = user?.uid
    if (!uid) return
    await clearTrainingData(uid)
    setClearOpen(false)
    toast.warning('All training data cleared')
  }

  const handleDeleteAccount = async () => {
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

  const budgetTier = getBudgetTier(budget)
  const initial = (displayName.trim().charAt(0) || '?').toUpperCase()

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.pageBg }} edges={['top']}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{ padding: SPACING.base, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={COLORS.teal}
              colors={[COLORS.teal]}
            />
          }
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: TYPE.display, fontWeight: '800', color: COLORS.ink }}>
                Settings
              </Text>
              <Text style={{ marginTop: 4, fontSize: TYPE.body, color: COLORS.muted }}>
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
                  backgroundColor: COLORS.tealSoft,
                  borderRadius: 999,
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  marginTop: 6,
                }}
              >
                <ActivityIndicator size="small" color={COLORS.teal} />
                <Text
                  style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: COLORS.tealDark }}
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
                    backgroundColor: COLORS.teal,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 14,
                  }}
                >
                  <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800' }}>
                    {initial}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.muted }}>
                    DISPLAY NAME
                  </Text>
                  <TextInput
                    value={displayName}
                    onChangeText={onChangeName}
                    placeholder="Your name"
                    placeholderTextColor={COLORS.subtle}
                    style={{
                      marginTop: 2,
                      fontSize: 18,
                      fontWeight: '700',
                      color: COLORS.ink,
                      paddingVertical: 2,
                    }}
                  />
                </View>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.muted }}>EMAIL</Text>
              <View
                style={{
                  marginTop: 4,
                  backgroundColor: COLORS.fieldBg,
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 12,
                }}
              >
                <Text style={{ fontSize: 15, color: COLORS.subtle }}>{email || '—'}</Text>
              </View>
              <Text style={{ marginTop: 6, fontSize: 12, color: COLORS.subtle }}>
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
                  return (
                    <Pressable
                      key={opt.value}
                      onPress={() => toggleSport(opt.value)}
                      style={{
                        width: '48%',
                        marginBottom: 12,
                        borderRadius: 14,
                        borderWidth: 2,
                        borderColor: selected ? opt.accent : COLORS.border,
                        backgroundColor: selected ? opt.accent : COLORS.white,
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
                          color: selected ? COLORS.white : COLORS.ink,
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
                <Text style={{ fontSize: 44, fontWeight: '800', color: COLORS.teal }}>{budget}</Text>
                <Text style={{ fontSize: 13, color: COLORS.muted, marginTop: -4 }}>hours / week</Text>
                <View
                  style={{
                    marginTop: 8,
                    backgroundColor: COLORS.tealSoft,
                    borderRadius: 999,
                    paddingHorizontal: 12,
                    paddingVertical: 4,
                  }}
                >
                  <Text style={{ color: COLORS.tealDark, fontWeight: '700', fontSize: 13 }}>
                    {budgetTier.label}
                  </Text>
                </View>
              </View>
              <Slider
                style={{ width: '100%', height: 40, marginTop: 12 }}
                minimumValue={BUDGET_MIN}
                maximumValue={BUDGET_MAX}
                step={1}
                value={budget}
                onValueChange={onBudgetChange}
                minimumTrackTintColor={COLORS.teal}
                maximumTrackTintColor={COLORS.border}
                thumbTintColor={COLORS.teal}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                {['Casual', 'Active', 'Serious', 'Elite'].map((label) => (
                  <Text key={label} style={{ fontSize: 11, color: COLORS.subtle }}>
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
                      borderColor: active ? COLORS.teal : COLORS.border,
                      backgroundColor: active ? COLORS.tealSoft : COLORS.white,
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
                          color: active ? COLORS.tealDark : COLORS.ink,
                        }}
                      >
                        {opt.label}
                      </Text>
                      <Text style={{ fontSize: 12, color: COLORS.muted, marginTop: 1 }}>
                        {opt.description}
                      </Text>
                    </View>
                    {active ? (
                      <Text style={{ fontSize: 18, color: COLORS.teal, marginLeft: 6 }}>✓</Text>
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
                    backgroundColor: COLORS.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
                    paddingHorizontal: 14,
                  }}
                >
                  <TextInput
                    value={weightInput}
                    onChangeText={onChangeWeight}
                    keyboardType="number-pad"
                    placeholder="70"
                    placeholderTextColor={COLORS.subtle}
                    style={{ height: 50, fontSize: 18, color: COLORS.ink }}
                  />
                </View>
                <View
                  style={{
                    flexDirection: 'row',
                    marginLeft: 12,
                    backgroundColor: COLORS.fieldBg,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: COLORS.border,
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
                          backgroundColor: active ? COLORS.teal : 'transparent',
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 14,
                            fontWeight: '700',
                            color: active ? COLORS.white : COLORS.muted,
                          }}
                        >
                          {u}
                        </Text>
                      </Pressable>
                    )
                  })}
                </View>
              </View>
              <Text style={{ marginTop: 8, fontSize: 12, color: COLORS.subtle }}>
                Used to estimate calories for future sessions.
              </Text>
            </Card>

            {/* Conflict detection */}
            <Card title="Conflict Detection">
              <FieldTitle>Conflict Sensitivity</FieldTitle>
              <ConflictSensitivity value={sensitivity} onChange={onSelectSensitivity} />

              <View style={{ height: 1, backgroundColor: COLORS.border, marginTop: 4, marginBottom: 4 }} />

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
                  <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.ink }}>
                    Conflict History
                  </Text>
                </View>
                <Text style={{ fontSize: 22, color: COLORS.subtle }}>›</Text>
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
                <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.ink }}>
                  Sport Interactions
                </Text>
                <Text style={{ fontSize: 15, color: COLORS.subtle }}>{matrixOpen ? '▲' : '▼'}</Text>
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

            {/* Notifications */}
            <Card title="Notifications">
              <NotificationSettings
                value={notifications}
                onChange={onChangeNotifications}
                onToast={toast.info}
              />
            </Card>

            {/* Data */}
            <Card title="Data">
              <Pressable
                onPress={() => Alert.alert('Export Data', 'Data export is coming soon.')}
                style={{ paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.teal }}>
                  Export Data
                </Text>
              </Pressable>
              <View style={{ height: 1, backgroundColor: COLORS.border }} />
              <Pressable
                onPress={() => {
                  haptics.medium()
                  setClearOpen(true)
                }}
                style={{ paddingVertical: 12 }}
              >
                <Text style={{ fontSize: 15, fontWeight: '600', color: COLORS.danger }}>
                  Clear All Training Data
                </Text>
              </Pressable>
            </Card>

            {/* Account */}
            <Card title="Account">
              <Pressable
                onPress={handleLogout}
                style={{
                  height: 50,
                  borderRadius: 12,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1.5,
                  borderColor: COLORS.danger,
                  backgroundColor: COLORS.white,
                }}
              >
                <Text style={{ color: COLORS.danger, fontSize: 16, fontWeight: '700' }}>
                  Log Out
                </Text>
              </Pressable>
              <Pressable
                onPress={() => {
                  haptics.medium()
                  setDeleteOpen(true)
                }}
                style={{ alignSelf: 'center', marginTop: 14, padding: 6 }}
              >
                <Text style={{ fontSize: TYPE.body, fontWeight: '700', color: COLORS.danger }}>
                  Delete Account
                </Text>
              </Pressable>
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
  return (
    <View style={[CARD, { marginTop: SPACING.base }]}>
      {title ? (
        <Text
          style={{
            fontSize: TYPE.micro,
            fontWeight: '800',
            letterSpacing: 1,
            color: COLORS.muted,
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

function FieldTitle({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <Text
      style={[
        { fontSize: 13, fontWeight: '700', color: COLORS.body, marginBottom: 10 },
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
          backgroundColor: 'rgba(17,24,39,0.55)',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          entering={FadeInDown.duration(200)}
          style={{
            backgroundColor: COLORS.white,
            borderRadius: 20,
            padding: 20,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: '800',
              color: COLORS.danger,
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
              color: COLORS.body,
              textAlign: 'center',
            }}
          >
            {message}
          </Text>

          <View
            style={{
              marginTop: 16,
              backgroundColor: COLORS.fieldBg,
              borderRadius: 12,
              borderWidth: 1.5,
              borderColor: matches ? COLORS.danger : COLORS.border,
              paddingHorizontal: 14,
            }}
          >
            <TextInput
              value={text}
              onChangeText={setText}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder={`Type "${confirmWord}"`}
              placeholderTextColor={COLORS.subtle}
              style={{ height: 50, fontSize: 16, color: COLORS.ink }}
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
              backgroundColor: matches ? COLORS.danger : COLORS.border,
            }}
          >
            {busy ? (
              <ActivityIndicator color={COLORS.white} />
            ) : (
              <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
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
            <Text style={{ color: COLORS.muted, fontSize: 15, fontWeight: '700' }}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
