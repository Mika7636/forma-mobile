import { Pressable, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, type ThemeMode } from '../../theme/tokens'

const OPTIONS: { value: ThemeMode; label: string; hint: string }[] = [
  { value: 'light', label: 'Light', hint: 'Always the light theme.' },
  { value: 'dark', label: 'Dark', hint: 'Always the dark theme.' },
  { value: 'auto', label: 'Auto', hint: "Follows your phone's display setting." },
]

/**
 * Light / Dark / Auto.
 *
 * There is no Save button and no confirmation, by design: the whole app is
 * already reading from the provider this writes to, so the repaint *is* the
 * feedback. `setMode` sets state first and persists afterwards, so the change
 * lands on the next frame rather than after an AsyncStorage round-trip.
 */
export default function AppearanceSetting() {
  const { colors, mode, setMode } = useTheme()
  const active = OPTIONS.find((o) => o.value === mode) ?? OPTIONS[2]

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          backgroundColor: colors.fieldBg,
          borderRadius: RADIUS.md,
          borderWidth: 1.5,
          borderColor: colors.border,
          padding: 3,
        }}
      >
        {OPTIONS.map((option) => {
          const on = option.value === mode
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                if (on) return
                haptics.light()
                setMode(option.value)
              }}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`Appearance: ${option.label}`}
              style={{
                flex: 1,
                minHeight: MIN_TOUCH,
                borderRadius: RADIUS.xs + 3,
                backgroundColor: on ? colors.accent : 'transparent',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text
                style={{
                  fontSize: TYPE.body,
                  fontWeight: WEIGHT.bold,
                  color: on ? colors.onAccent : colors.textMuted,
                }}
              >
                {option.label}
              </Text>
            </Pressable>
          )
        })}
      </View>

      <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.micro, color: colors.textSubtle }}>
        {active.hint}
      </Text>
    </View>
  )
}
