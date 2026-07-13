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
import Animated, {
  FadeIn,
  SlideInLeft,
  SlideInRight,
  SlideOutLeft,
  SlideOutRight,
} from 'react-native-reanimated'
import Slider from '@react-native-community/slider'
import * as Haptics from 'expo-haptics'
import ProgressBar from '../components/onboarding/ProgressBar'
import FormaLogo from '../components/ui/FormaLogo'
import PrimaryButton from '../components/ui/PrimaryButton'
import { COLORS } from '../constants/theme'
import {
  BUDGET_MAX,
  BUDGET_MIN,
  DEFAULT_BUDGET_HOURS,
  EXPERIENCE_OPTIONS,
  SPORT_OPTIONS,
  calculateBaselineWeeklyLoad,
  getBudgetTier,
} from '../constants/training'
import { updateUserProfile } from '../services/userService'
import { useAuthStore } from '../store/authStore'
import type { SportType } from '../types/session'
import type { ExperienceLevel } from '../types/user'

const TOTAL_STEPS = 5
const LB_PER_KG = 2.20462

// Step 2 offers the six headline sports; standalone "strength" is folded into
// "Gym / Strength" here.
const ONBOARDING_SPORTS = SPORT_OPTIONS.filter((s) =>
  ['running', 'swimming', 'combat', 'football', 'cycling', 'gym'].includes(s.value),
)

export default function OnboardingScreen() {
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

  const goNext = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setForward(true)
    setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1))
  }

  const goBack = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    setForward(false)
    setStep((s) => Math.max(s - 1, 0))
  }

  const toggleSport = (value: SportType) => {
    Haptics.selectionAsync()
    setSports((prev) =>
      prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value],
    )
  }

  const toggleUnit = (next: 'kg' | 'lb') => {
    if (next === weightUnit) return
    Haptics.selectionAsync()
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

  const handleFinish = async () => {
    if (!user || !experience || saving) return
    setSaving(true)

    const weightKg = resolveWeightKg()
    const baselineWeeklyLoad = calculateBaselineWeeklyLoad(budgetHours, experience)
    const updates = {
      sports,
      weeklyBudgetHours: budgetHours,
      experienceLevel: experience,
      weightKg,
      weightUnit,
      baselineWeeklyLoad,
      onboardingCompleted: true,
    }

    try {
      await updateUserProfile(user.uid, updates)
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
      setDone(true)
      // Show the "You're all set!" beat, then commit the profile — RootNavigator
      // flips to MainTabs once onboardingCompleted is true.
      setTimeout(() => {
        if (profile) setProfile({ ...profile, ...updates })
      }, 1300)
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
      setSaving(false)
    }
  }

  if (done) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: COLORS.white,
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
              backgroundColor: COLORS.tealSoft,
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 44 }}>✅</Text>
          </View>
          <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.ink }}>
            You're all set!
          </Text>
          <Text style={{ marginTop: 8, fontSize: 15, color: COLORS.muted }}>
            Building your dashboard…
          </Text>
        </Animated.View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        {/* Persistent header: back affordance + progress bar. */}
        <View style={{ paddingHorizontal: 24, paddingTop: 8, paddingBottom: 4 }}>
          <View style={{ height: 28, justifyContent: 'center' }}>
            {step > 0 ? (
              <Pressable onPress={goBack} hitSlop={12} style={{ alignSelf: 'flex-start' }}>
                <Text style={{ fontSize: 16, color: COLORS.teal, fontWeight: '600' }}>
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
                    Haptics.selectionAsync()
                    setExperience(e)
                  }}
                  onFinish={handleFinish}
                  saving={saving}
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
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <FormaLogo size={52} />
      <Text
        style={{
          marginTop: 32,
          fontSize: 26,
          fontWeight: '800',
          color: COLORS.ink,
          textAlign: 'center',
        }}
      >
        Welcome to FORMA, {name}!
      </Text>
      <Text
        style={{
          marginTop: 12,
          fontSize: 16,
          color: COLORS.muted,
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
          return (
            <Pressable
              key={sport.value}
              onPress={() => onToggle(sport.value)}
              style={{
                width: '48%',
                marginBottom: 14,
                borderRadius: 16,
                borderWidth: 2,
                borderColor: isSelected ? sport.accent : COLORS.border,
                backgroundColor: isSelected ? sport.accent : COLORS.white,
                paddingVertical: 22,
                paddingHorizontal: 14,
                alignItems: 'center',
              }}
            >
              {isSelected ? (
                <View style={{ position: 'absolute', top: 8, right: 10 }}>
                  <Text style={{ fontSize: 15, color: COLORS.white }}>✓</Text>
                </View>
              ) : null}
              <Text style={{ fontSize: 34 }}>{sport.icon}</Text>
              <Text
                style={{
                  marginTop: 10,
                  fontSize: 15,
                  fontWeight: '700',
                  color: isSelected ? COLORS.white : COLORS.ink,
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
  const tier = getBudgetTier(hours)
  return (
    <View style={{ flex: 1 }}>
      <StepHeading
        title="How many hours do you train per week?"
        subtitle="Slide to set your weekly budget"
      />

      <View style={{ alignItems: 'center', marginTop: 40 }}>
        <Text style={{ fontSize: 64, fontWeight: '800', color: COLORS.teal }}>{hours}</Text>
        <Text style={{ fontSize: 16, color: COLORS.muted, marginTop: -4 }}>
          hours / week
        </Text>
        <View
          style={{
            marginTop: 10,
            backgroundColor: COLORS.tealSoft,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 5,
          }}
        >
          <Text style={{ color: COLORS.tealDark, fontWeight: '700', fontSize: 14 }}>
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
        minimumTrackTintColor={COLORS.teal}
        maximumTrackTintColor={COLORS.border}
        thumbTintColor={COLORS.teal}
      />

      <View
        style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}
      >
        <Text style={{ fontSize: 12, color: COLORS.subtle }}>Casual</Text>
        <Text style={{ fontSize: 12, color: COLORS.subtle }}>Active</Text>
        <Text style={{ fontSize: 12, color: COLORS.subtle }}>Serious</Text>
        <Text style={{ fontSize: 12, color: COLORS.subtle }}>Elite</Text>
      </View>

      <Text
        style={{ marginTop: 20, fontSize: 13, color: COLORS.muted, textAlign: 'center' }}
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
          color: COLORS.body,
          marginBottom: 8,
        }}
      >
        Weight
      </Text>
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
            value={value}
            onChangeText={(t) => onChangeValue(t.replace(/[^0-9.]/g, ''))}
            keyboardType="numeric"
            placeholder="70"
            placeholderTextColor={COLORS.subtle}
            style={{ height: 52, fontSize: 18, color: COLORS.ink }}
          />
        </View>

        {/* kg / lb segmented toggle */}
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
            const active = unit === u
            return (
              <Pressable
                key={u}
                onPress={() => onToggleUnit(u)}
                style={{
                  paddingHorizontal: 18,
                  paddingVertical: 11,
                  borderRadius: 9,
                  backgroundColor: active ? COLORS.teal : 'transparent',
                }}
              >
                <Text
                  style={{
                    fontSize: 15,
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

      <View style={{ flex: 1 }} />
      <PrimaryButton label="Continue" onPress={onNext} style={{ marginTop: 12 }} />
      <Pressable
        onPress={onNext}
        hitSlop={8}
        style={{ alignSelf: 'center', marginTop: 16 }}
      >
        <Text style={{ fontSize: 15, color: COLORS.muted, fontWeight: '600' }}>Skip</Text>
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
  onFinish,
  saving,
}: {
  selected: ExperienceLevel | null
  onSelect: (e: ExperienceLevel) => void
  onFinish: () => void
  saving: boolean
}) {
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
                borderColor: active ? COLORS.teal : COLORS.border,
                backgroundColor: active ? COLORS.tealSoft : COLORS.white,
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
                    color: active ? COLORS.tealDark : COLORS.ink,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                  }}
                >
                  {opt.label}
                </Text>
                <Text
                  style={{ marginTop: 4, fontSize: 13, color: COLORS.muted, lineHeight: 18 }}
                >
                  {opt.description}
                </Text>
              </View>
              {active ? (
                <Text style={{ fontSize: 20, color: COLORS.teal, marginLeft: 8 }}>✓</Text>
              ) : null}
            </Pressable>
          )
        })}
      </View>

      <View style={{ flex: 1 }} />
      <PrimaryButton
        label="Finish"
        onPress={onFinish}
        loading={saving}
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
  return (
    <View style={{ marginTop: 12 }}>
      <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.ink, lineHeight: 30 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ marginTop: 8, fontSize: 15, color: COLORS.muted }}>{subtitle}</Text>
      ) : null}
    </View>
  )
}
