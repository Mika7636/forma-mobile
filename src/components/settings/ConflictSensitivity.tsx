import { Pressable, Text, View } from 'react-native'
import * as Haptics from 'expo-haptics'
import { COLORS } from '../../constants/theme'
import type { ConflictSensitivity as Sensitivity } from '../../types/user'

interface ConflictSensitivityProps {
  value: Sensitivity
  onChange: (value: Sensitivity) => void
}

const CARDS: { value: Sensitivity; emoji: string; label: string; description: string }[] = [
  {
    value: 'relaxed',
    emoji: '😌',
    label: 'Relaxed',
    description: 'Only warn me about serious injury risk. Fewer notifications.',
  },
  {
    value: 'balanced',
    emoji: '⚖️',
    label: 'Balanced',
    description: 'Recommended. Warns about meaningful fatigue conflicts.',
  },
  {
    value: 'strict',
    emoji: '🔍',
    label: 'Strict',
    description: 'Warn me at the slightest fatigue overlap. Maximum caution.',
  },
]

/**
 * Radio-style picker for how aggressively FORMA flags training conflicts. Tunes
 * the detector's RPE thresholds and (for "relaxed") suppresses warning-level
 * conflicts entirely. Selected card gets a teal border, tint, and checkmark.
 */
export default function ConflictSensitivity({ value, onChange }: ConflictSensitivityProps) {
  return (
    <View>
      {CARDS.map((card) => {
        const active = value === card.value
        return (
          <Pressable
            key={card.value}
            onPress={() => {
              if (active) return
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
              onChange(card.value)
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
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
            <Text style={{ fontSize: 26, marginRight: 12 }}>{card.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: active ? COLORS.tealDark : COLORS.ink,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {card.label}
              </Text>
              <Text style={{ fontSize: 12.5, color: COLORS.muted, marginTop: 2, lineHeight: 17 }}>
                {card.description}
              </Text>
            </View>
            {active ? (
              <Text style={{ fontSize: 18, color: COLORS.teal, marginLeft: 8 }}>✓</Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}
