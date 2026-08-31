// "Plan a session" — the Planner's one write path.
//
// Kept deliberately small: sport, how long, how hard. Those three are exactly
// what the conflict engine reads, and nothing else on this form would change its
// answer, so asking for more would be asking the athlete to fill in fields that
// buy them nothing. The rest of what makes a session (distance, notes, a route)
// is something you find out by *doing* it, and belongs to the Log screen.
import { useEffect, useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import Slider from '@react-native-community/slider'
import PrimaryButton from '../ui/PrimaryButton'
import { haptics } from '../../utils/haptics'
import { SPORT_OPTIONS } from '../../constants/training'
import { sportVisual } from '../../utils/sportMeta'
import type { SportType } from '../../types/session'
import type { PlannedSessionInput } from '../../types/planned'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, onColor, rpeLabel } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** Duration presets, in minutes. A plan is a rough shape, not a stopwatch. */
const DURATIONS = [30, 45, 60, 90, 120]

interface AddPlannedSessionSheetProps {
  /** The day being planned (`YYYY-MM-DD`); the sheet is open while non-null. */
  isoDate: string | null
  /** The athlete's sports, from onboarding — the only ones offered. */
  sports: SportType[]
  onClose: () => void
  onSave: (input: PlannedSessionInput) => Promise<void>
}

export default function AddPlannedSessionSheet({
  isoDate,
  sports,
  onClose,
  onSave,
}: AddPlannedSessionSheetProps) {
  const { colors } = useTheme()

  const [sport, setSport] = useState<SportType | null>(null)
  const [duration, setDuration] = useState(60)
  const [intensity, setIntensity] = useState(7)
  const [saving, setSaving] = useState(false)

  // Reset on each open, so yesterday's answers don't pre-fill tomorrow's plan.
  useEffect(() => {
    if (isoDate) {
      // Pre-select when there is only one honest answer.
      setSport(sports.length === 1 ? sports[0] : null)
      setDuration(60)
      setIntensity(7)
      setSaving(false)
    }
  }, [isoDate, sports])

  if (!isoDate) return null

  const dayLabel = new Date(`${isoDate}T12:00:00`).toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const handleSave = async () => {
    if (!sport || saving) return
    setSaving(true)
    try {
      await onSave({ sport, date: isoDate, durationMinutes: duration, intensity })
    } finally {
      setSaving(false)
    }
  }

  // Onboarding guarantees at least one sport, but a profile that failed to load
  // (or an account from before the sports step existed) would otherwise reach a
  // form with nothing to pick and a permanently disabled button. Offering the
  // full list is a strictly better dead end than no list.
  const chosen = SPORT_OPTIONS.filter((o) => sports.includes(o.value))
  const options = chosen.length > 0 ? chosen : SPORT_OPTIONS

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.scrim }} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: SPACING.lg - 4,
          paddingTop: 14,
          paddingBottom: 34,
          maxHeight: '86%',
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 44,
            height: 5,
            borderRadius: RADIUS.pill,
            backgroundColor: colors.border,
            marginBottom: 14,
          }}
        />

        <Text style={{ fontSize: 19, fontWeight: WEIGHT.heavy, color: colors.text }}>
          Plan a session
        </Text>
        <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
          {dayLabel}
        </Text>

        <ScrollView
          style={{ marginTop: SPACING.base }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <FieldLabel>Sport</FieldLabel>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: SPACING.sm }}>
            {options.map((option) => {
              const on = sport === option.value
              const accent = sportVisual(option.value, colors).color
              return (
                <Pressable
                  key={option.value}
                  onPress={() => {
                    haptics.selection()
                    setSport(option.value)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    minHeight: MIN_TOUCH - 8,
                    paddingHorizontal: 14,
                    marginRight: SPACING.sm,
                    marginBottom: SPACING.sm,
                    borderRadius: RADIUS.pill,
                    borderWidth: 1.5,
                    borderColor: on ? accent : colors.border,
                    backgroundColor: on ? accent : colors.surfaceAlt,
                  }}
                >
                  <Text style={{ fontSize: 15 }}>{option.icon}</Text>
                  <Text
                    style={{
                      marginLeft: 7,
                      fontSize: TYPE.small,
                      fontWeight: WEIGHT.bold,
                      color: on ? onColor(accent) : colors.textBody,
                    }}
                  >
                    {option.label}
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <FieldLabel style={{ marginTop: SPACING.md }}>Planned duration</FieldLabel>
          <View style={{ flexDirection: 'row', marginTop: SPACING.sm }}>
            {DURATIONS.map((minutes, i) => {
              const on = duration === minutes
              return (
                <Pressable
                  key={minutes}
                  onPress={() => {
                    haptics.selection()
                    setDuration(minutes)
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  style={{
                    flex: 1,
                    marginRight: i === DURATIONS.length - 1 ? 0 : 6,
                    paddingVertical: 11,
                    borderRadius: RADIUS.md,
                    borderWidth: 1.5,
                    borderColor: on ? colors.accent : colors.border,
                    backgroundColor: on ? colors.accentSoft : colors.surfaceAlt,
                    alignItems: 'center',
                  }}
                >
                  <Text
                    style={{
                      fontSize: TYPE.micro,
                      fontWeight: WEIGHT.bold,
                      color: on ? colors.accentText : colors.textMuted,
                    }}
                  >
                    {minutes}m
                  </Text>
                </Pressable>
              )
            })}
          </View>

          <FieldLabel style={{ marginTop: SPACING.md }}>
            How hard are you planning to go?
          </FieldLabel>
          <View style={{ alignItems: 'center', marginTop: SPACING.sm }}>
            <Text style={{ fontSize: 32, fontWeight: WEIGHT.heavy, color: colors.text }}>
              RPE {intensity}
            </Text>
            <Text style={{ fontSize: TYPE.micro, color: colors.textMuted }}>
              {rpeLabel(intensity)}
            </Text>
          </View>
          <Slider
            style={{ width: '100%', height: 44 }}
            minimumValue={1}
            maximumValue={10}
            step={1}
            value={intensity}
            onValueChange={(v) => setIntensity(Math.round(v))}
            minimumTrackTintColor={colors.accent}
            maximumTrackTintColor={colors.border}
            thumbTintColor={colors.accent}
          />
          {/* The one sentence that explains why this field is on the form at
              all — otherwise "how hard" reads as bookkeeping rather than as the
              input the whole conflict check turns on. */}
          <Text
            style={{
              fontSize: TYPE.caption,
              color: colors.textSubtle,
              lineHeight: 16,
              marginBottom: SPACING.sm,
            }}
          >
            Intensity is what FORMA checks against the rest of your week — a hard session
            stacked on another hard one is what raises a conflict.
          </Text>
        </ScrollView>

        <PrimaryButton
          label="Add to plan"
          onPress={handleSave}
          loading={saving}
          disabled={!sport}
          style={{ marginTop: SPACING.md }}
        />
        <Pressable onPress={onClose} hitSlop={8} style={{ alignSelf: 'center', marginTop: 14 }}>
          <Text
            style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.semibold, color: colors.textMuted }}
          >
            Cancel
          </Text>
        </Pressable>
      </View>
    </Modal>
  )
}

function FieldLabel({ children, style }: { children: ReactNode; style?: { marginTop?: number } }) {
  const { colors } = useTheme()
  return (
    <Text
      style={[
        {
          fontSize: TYPE.micro,
          fontWeight: WEIGHT.heavy,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.textMuted,
        },
        style,
      ]}
    >
      {children}
    </Text>
  )
}
