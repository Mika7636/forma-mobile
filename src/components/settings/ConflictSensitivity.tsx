import { Pressable, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import type { ConflictSensitivity as Sensitivity } from '../../types/user'
import { useTheme } from '../../theme/ThemeProvider'

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
  const { colors } = useTheme()

  return (
    <View>
      {CARDS.map((card) => {
        const active = value === card.value
        return (
          <Pressable
            key={card.value}
            onPress={() => {
              if (active) return
              haptics.light()
              onChange(card.value)
            }}
            accessibilityRole="radio"
            accessibilityState={{ selected: active }}
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
            <Text style={{ fontSize: 26, marginRight: 12 }}>{card.emoji}</Text>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '800',
                  color: active ? colors.accentPressed : colors.text,
                  textTransform: 'uppercase',
                  letterSpacing: 0.4,
                }}
              >
                {card.label}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textMuted, marginTop: 2, lineHeight: 17 }}>
                {card.description}
              </Text>
            </View>
            {active ? (
              <Text style={{ fontSize: 18, color: colors.accent, marginLeft: 8 }}>✓</Text>
            ) : null}
          </Pressable>
        )
      })}
    </View>
  )
}
