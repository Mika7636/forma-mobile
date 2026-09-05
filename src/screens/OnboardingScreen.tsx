import { useMemo, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import Animated, {
  FadeIn,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated'
import Slider from '@react-native-community/slider'
import { haptics } from '../utils/haptics'
import ConflictMatrixPayoff from '../components/onboarding/ConflictMatrixPayoff'
import ProgressBar from '../components/onboarding/ProgressBar'
import FormaLogo from '../components/ui/FormaLogo'
import PrimaryButton from '../components/ui/PrimaryButton'
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DEFAULT_BUDGET_HOURS,
  DEFAULT_SPORT_INTERACTIONS,
  EXPERIENCE_OPTIONS,
  SPORT_OPTIONS,
  calculateBaselineCTL,
  calculateBaselineWeeklyLoad,
  getBudgetTier,
} from '../constants/training'
import { requestLandingTab } from '../navigation/landingTab'
import { updateUserProfile } from '../services/userService'
import { useAuthStore } from '../store/authStore'
import { useSafeTimeout } from '../hooks/useSafeTimeout'
import type { SportType } from '../types/session'
import type { ExperienceLevel, User } from '../types/user'
import { useTheme } from '../theme/ThemeProvider'
import { onColor } from '../theme/tokens'
import { sportVisual } from '../utils/sportMeta'

/**
 * Six steps, the last of which gives something back.
 *
 * The wizard used to end on "Experience → Finish", which meant every screen took
 * something from the athlete and none gave anything in return until the
 * dashboard — where the headline numbers need six weeks of history to mean
 * anything. Step 6 closes that: their own sports, run through their own
 * interaction matrix, as advice they can use today. See `ConflictMatrixPayoff`.
 */
const TOTAL_STEPS = 6
const LB_PER_KG = 2.20462

// Step 2 offers the six headline sports; standalone "strength" is folded into
// "Gym / Strength" here.
const ONBOARDING_SPORTS = SPORT_OPTIONS.filter((s) =>
  ['running', 'swimming', 'combat', 'football', 'cycling', 'gym'].includes(s.value),
)

export default function OnboardingScreen() {
  const { colors } = useTheme()

  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)

  const firstName = useMemo(() => {
    const name = profile?.displayName ?? user?.displayName ?? ''
    return name.trim().split(/\s+/)[0] || 'athlete'
  }, [profile?.displayName, user?.displayName])

  const [step, setStep] = useState(0)
  const [forward, setForward] = useState(true)

  // Collected answers.
  const [sports, setSports] = useState<SportType[]>([])
  const [budgetHours, setBudgetHours] = useState(DEFAULT_BUDGET_HOURS)
  const [weightUnit, setWeightUnit] = useState<'kg' | 'lb'>('kg')
  const [weightInput, setWeightInput] = useState('70')
  const [experience, setExperience] = useState<ExperienceLevel | null>(null)

  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const schedule = useSafeTimeout()

  const goNext = () => {
    haptics.light()
    setForward(true)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  const goBack = () => {
    haptics.light()
    setForward(false)
    setStep((s) => Math.max(s - 1, 0))
  }

  const toggleSport = (value: SportType) => {
    haptics.selection()
    setSports((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    )
  }

  const toggleUnit = (next: 'kg' | 'lb') => {
    if (next === weightUnit) return
    haptics.selection()
    const num = parseFloat(weightInput)
    if (!Number.isNaN(num)) {
      const converted = next === 'lb' ? num * LB_PER_KG : num / LB_PER_KG
      setWeightInput(String(Math.round(converted)))
    }
    setWeightUnit(next)
  }

  const resolveWeightKg = (): number => {
    const num = parseFloat(weightInput)
    if (Number.isNaN(num) || num <= 0) return 70
    return Math.round(weightUnit === 'lb' ? num / LB_PER_KG : num)
  }

  /**
   * Write the profile, then send the athlete to the Planner.
   *
   * The Planner rather than the Dashboard because it is the one screen that is
   * useful with nothing logged: the conflict engine runs forward over planned
   * sessions, so the advice they just read on the previous step is immediately
   * actionable there. `requestLandingTab` is how that survives the navigator
   * swap — this screen is unmounted the instant `onboardingCompleted` flips.
   */
  const handleFinish = async () => {
    if (!user || !experience || saving) return
    setError(null)
    setSaving(true)

    const weightKg = resolveWeightKg()
    const baselineWeeklyLoad = calculateBaselineWeeklyLoad(budgetHours, experience)
    const baselineCTL = calculateBaselineCTL(budgetHours, experience)
    const updates = {
      sports,
      weeklyBudgetHours: budgetHours,
      experienceLevel: experience,
      weightKg,
      weightUnit,
      baselineWeeklyLoad,
      baselineCTL,
      onboardingCompleted: true,
    }

    // Merge onto the loaded profile when we have one; otherwise construct a
    // complete base profile. RootNavigator shows onboarding for BOTH a normal
    // first run AND a null profile (doc failed to load — e.g. the emulator
    // WebChannel error). If we only committed when `profile` was truthy, the
    // null case would write to Firestore but never flip the navigator, leaving
    // the user stuck on "You're all set!" forever. Building a full User here
    // means both the write and the in-memory commit always have a valid profile.
    const base: User = profile ?? {
      uid: user.uid,
      displayName: user.displayName ?? firstName,
      email: user.email ?? '',
      createdAt: new Date().toISOString(),
      sports: [],
      weeklyBudgetHours: DEFAULT_BUDGET_HOURS,
      experienceLevel: 'beginner',
      onboardingCompleted: false,
      conflictSensitivity: 'balanced',
      sportInteractions: { ...DEFAULT_SPORT_INTERACTIONS },
    }
    const nextProfile: User = { ...base, ...updates }

    try {
      console.log('[Onboarding] Finish tapped — writing profile', {
        uid: user.uid,
        hadProfile: !!profile,
        onboardingCompleted: nextProfile.onboardingCompleted,
      })
      await updateUserProfile(user.uid, nextProfile)
      console.log('[Onboarding] Firestore write succeeded')
      haptics.success()
      requestLandingTab('Planner')
      setDone(true)
      // Show the "You're all set!" beat, then commit the profile —
      // RootNavigator flips to MainTabs once onboardingCompleted is true.
      schedule(() => {
        console.log('[Onboarding] Committing profile → RootNavigator → MainTabs')
        setProfile(nextProfile)
      }, 2600)
    } catch (err) {
      console.warn('[Onboarding] Finish failed', err)
      haptics.error()
      setError("Couldn't save your profile. Check your connection and try again.")
      setSaving(false)
    }
  }

  if (done) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Animated.View entering={FadeIn.duration(300)} style={{ alignItems: 'center' }}>
          <View
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 44 }}>✅</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text }}>
            You're all set!
          </Text>
          <Text style={{ marginTop: 8, fontSize: 15, color: colors.textMuted }}>
            Opening your planner…
          </Text>
          <View
            style={{
              marginTop: 24,
              marginHorizontal: 8,
              backgroundColor: colors.accentSoft,
              borderRadius: 16,
              paddingVertical: 14,
              paddingHorizontal: 18,
              maxWidth: 320,
            }}
          >
            <Text
              style={{
                fontSize: 14,
                color: colors.accentPressed,
                fontWeight: '600',
                lineHeight: 20,
                textAlign: 'center',
              }}
            >
              💡 Plan a few sessions and FORMA will flag the clashes straight away. Log
              them as you go, and after about 2 weeks your Form Score becomes meaningful
              too.
            </Text>
          </View>
        </Animated.View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* White page — dark status-bar content is what stays legible. */}
      <ThemedStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        {/* Persistent header: back affordance + progress bar. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ height: 28, justifyContent: 'center' }}>
            {step > 0 ? (
              <Pressable onPress={goBack} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 16, color: colors.accentText, fontWeight: '600' }}>
                  ‹ Back
                </Text>
              </Pressable>
            ) : null}
          </View>
          <ProgressBar step={step + 1} totalSteps={TOTAL_STEPS} />
        </View>

        <View style={{ flex: 1, overflow: 'hidden' }}>
          <Animated.View
            key={step}
            entering={forward ? SlideInRight.duration(260) : SlideInLeft.duration(260)}
            exiting={forward ? SlideOutLeft.duration(260) : SlideOutRight.duration(260)}
            style={{ flex: 1 }}
          >
            <ScrollView
              contentContainerStyle={{
                flexGrow: 1,
                paddingHorizontal: 24,
                paddingTop: 12,
                paddingBottom: 28,
              }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              {step === 0 ? <WelcomeStep name={firstName} onNext={goNext} /> : null}

              {step === 1 ? (
                <SportsStep selected={sports} onToggle={toggleSport} onNext={goNext} />
              ) : null}

              {step === 2 ? (
                <BudgetStep hours={budgetHours} onChange={setBudgetHours} onNext={goNext} />
              ) : null}

              {step === 3 ? (
                <MetricsStep
                  unit={weightUnit}
                  value={weightInput}
                  onChangeValue={setWeightInput}
                  onToggleUnit={toggleUnit}
                  onNext={goNext}
                />
              ) : null}

              {step === 4 ? (
                <ExperienceStep
                  selected={experience}
                  onSelect={(e) => {
                    haptics.selection()
                    setError(null)
                    setExperience(e)
                  }}
                  onNext={goNext}
                />
              ) : null}

              {step === 5 ? (
                <ConflictMatrixPayoff
                  sports={sports}
                  // The matrix that is about to be written to the profile: the
                  // athlete's own if they already have one (a re-run of the
                  // wizard), otherwise the seeded default this account will get.
                  interactions={profile?.sportInteractions ?? DEFAULT_SPORT_INTERACTIONS}
                  ctaLabel="Plan your first week"
                  onContinue={handleFinish}
                  saving={saving}
                  error={error}
                />
              ) : null}
            </ScrollView>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Step 1 — Welcome                                                     */
/* ------------------------------------------------------------------ */
function WelcomeStep({ name, onNext }: { name: string; onNext: () => void }) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <FormaLogo size={52} />
      <Text
        style={{
          marginTop: 32,
          fontSize: 26,
          fontWeight: '800',
          color: colors.text,
          textAlign: 'center',
        }}
      >
        Welcome to FORMA, {name}!
      </Text>
      <Text
        style={{
          marginTop: 12,
          fontSize: 16,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 23,
          paddingHorizontal: 8,
        }}
      >
        Let's set up your training profile. Takes 2 minutes.
      </Text>
      <PrimaryButton
        label="Get Started"
        onPress={onNext}
        style={{ marginTop: 40, alignSelf: 'stretch' }}
      />
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Step 2 — Select sports                                              */
/* ------------------------------------------------------------------ */
function SportsStep({
  selected,
  onToggle,
  onNext,
}: {
  selected: SportType[]
  onToggle: (s: SportType) => void
  onNext: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1 }}>
      <StepHeading title="Which sports do you train?" subtitle="Pick all that apply" />
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          marginTop: 20,
        }}
      >
        {ONBOARDING_SPORTS.map((sport) => {
          const isSelected = selected.includes(sport.value)
          const accent = sportVisual(sport.value, colors).color
          return (
            <Pressable
              key={sport.value}
              onPress={() => onToggle(sport.value)}
              style={{
                width: '48%',
                marginBottom: 14,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: isSelected ? accent : colors.border,
                backgroundColor: isSelected ? accent : colors.surfaceAlt,
                paddingVertical: 22,
                paddingHorizontal: 14,
                alignItems: 'center',
              }}
            >
              {isSelected ? (
                <View style={{ position: 'absolute', top: 8, right: 10 }}>
                  <Text style={{ fontSize: 15, color: onColor(accent) }}>✓</Text>
                </View>
              ) : null}
              <Text style={{ fontSize: 34 }}>{sport.icon}</Text>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 15,
                  fontWeight: '700',
                  color: isSelected ? onColor(accent) : colors.text,
                  textAlign: 'center',
                }}
              >
                {sport.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <View style={{ flex: 1 }} />
      <PrimaryButton
        label="Continue"
        onPress={onNext}
        disabled={selected.length === 0}
        style={{ marginTop: 12 }}
      />
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Step 3 — Weekly budget                                             */
/* ------------------------------------------------------------------ */
function BudgetStep({
  hours,
  onChange,
  onNext,
}: {
  hours: number
  onChange: (h: number) => void
  onNext: () => void
}) {
  const { colors } = useTheme()

  const tier = getBudgetTier(hours)
  return (
    <View style={{ flex: 1 }}>
      <StepHeading
        title="How many hours do you train per week?"
        subtitle="Slide to set your weekly budget"
      />

      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Text style={{ fontSize: 64, fontWeight: '800', color: colors.accent }}>{hours}</Text>
        <Text style={{ fontSize: 16, color: colors.textMuted, marginTop: -4 }}>
          hours / week
        </Text>
        <View
          style={{
            marginTop: 10,
            backgroundColor: colors.accentSoft,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 5,
          }}
        >
          <Text style={{ color: colors.accentPressed, fontWeight: '700', fontSize: 14 }}>
            {tier.label}
          </Text>
        </View>
      </View>

      <Slider
        style={{ width: '100%', height: 44, marginTop: 32 }}
        minimumValue={BUDGET_MIN}
        maximumValue={BUDGET_MAX}
        step={1}
        value={hours}
        onValueChange={(v) => onChange(Math.round(v))}
        minimumTrackTintColor={colors.accent}
        maximumTrackTintColor={colors.border}
        thumbTintColor={colors.accent}
      />

      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}
      >
        <Text style={{ fontSize: 12, color: colors.textSubtle }}>Casual</Text>
        <Text style={{ fontSize: 12, color: colors.textSubtle }}>Active</Text>
        <Text style={{ fontSize: 12, color: colors.textSubtle }}>Serious</Text>
        <Text style={{ fontSize: 12, color: colors.textSubtle }}>Elite</Text>
      </View>

      <Text
        style={{ marginTop: 20, fontSize: 13, color: colors.textMuted, textAlign: 'center' }}
      >
        Casual 2–5h · Active 6–10h · Serious 11–18h · Elite 19h+
      </Text>

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Continue" onPress={onNext} style={{ marginTop: 12 }} />
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Step 4 — Body metrics                                              */
/* ------------------------------------------------------------------ */
function MetricsStep({
  unit,
  value,
  onChangeValue,
  onToggleUnit,
  onNext,
}: {
  unit: 'kg' | 'lb'
  value: string
  onChangeValue: (v: string) => void
  onToggleUnit: (u: 'kg' | 'lb') => void
  onNext: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1 }}>
      <StepHeading
        title="Tell us about yourself"
        subtitle="Used for calorie estimates. Optional."
      />

      <Text
        style={{
          marginTop: 28,
          fontSize: 13,
          fontWeight: '600',
          color: colors.textBody,
          marginBottom: 8,
        }}
      >
        Weight
      </Text>
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
          <TextInput
            value={value}
            onChangeText={(t) => onChangeValue(t.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="70"
            placeholderTextColor={colors.textSubtle}
            style={{ height: 52, fontSize: 18, color: colors.text }}
          />
        </View>

        {/* kg / lb segmented toggle */}
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
            const active = unit === u
            return (
              <Pressable
                key={u}
                onPress={() => onToggleUnit(u)}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                  borderRadius: 9,
                  backgroundColor: active ? colors.accent : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
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

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Continue" onPress={onNext} style={{ marginTop: 12 }} />
      <Pressable
        onPress={onNext}
        hitSlop={8}
        style={{ alignSelf: 'center', marginTop: 16 }}
      >
        <Text style={{ fontSize: 15, color: colors.textMuted, fontWeight: '600' }}>Skip</Text>
      </Pressable>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Step 5 — Experience level                                          */
/* ------------------------------------------------------------------ */
function ExperienceStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: ExperienceLevel | null
  onSelect: (e: ExperienceLevel) => void
  onNext: () => void
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1 }}>
      <StepHeading title="How experienced are you?" />

      <View style={{ marginTop: 20 }}>
        {EXPERIENCE_OPTIONS.map((opt) => {
          const active = selected === opt.value
          return (
            <Pressable
              key={opt.value}
              onPress={() => onSelect(opt.value)}
              style={{
                borderRadius: 16,
                borderWidth: 2,
                borderColor: active ? colors.accent : colors.border,
                backgroundColor: active ? colors.accentSoft : colors.surfaceAlt,
                padding: 18,
                marginBottom: 14,
                flexDirection: 'row',
                alignItems: 'center',
              }}
            >
              <Text style={{ fontSize: 34, marginRight: 16 }}>{opt.icon}</Text>
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 17,
                    fontWeight: '800',
                    color: active ? colors.accentPressed : colors.text,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{ marginTop: 4, fontSize: 13, color: colors.textMuted, lineHeight: 18 }}
                >
                  {opt.description}
                </Text>
              </View>
              {active ? (
                <Text style={{ fontSize: 20, color: colors.accent, marginLeft: 8 }}>✓</Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>

      <View style={{ flex: 1 }} />
      <PrimaryButton
        label="Continue"
        onPress={onNext}
        disabled={!selected}
        style={{ marginTop: 12 }}
      />
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Shared step heading                                                */
/* ------------------------------------------------------------------ */
function StepHeading({ title, subtitle }: { title: string; subtitle?: string }) {
  const { colors } = useTheme()

  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: colors.text, lineHeight: 30 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ marginTop: 8, fontSize: 15, color: colors.textMuted }}>{subtitle}</Text>
      ) : null}
    </View>
  )
}
