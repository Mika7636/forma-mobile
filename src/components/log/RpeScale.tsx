// The 1-10 effort scale, as ten tappable pills.

import { Pressable, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { useEffect } from 'react'
import { RADIUS, SPACING, rpeColor, rpeLabel } from '../../theme/tokens'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'

const VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const

export default function RpeScale({
  value,
  onChange,
}: {
  value: number | null
  onChange: (rpe: number) => void
}) {
  const { colors } = useTheme()

  return (
    <View>
      <View style={{ flexDirection: 'row', gap: SPACING.xs }}>
        {VALUES.map((n) => (
          <RpePill key={n} value={n} selected={value === n} onPress={() => onChange(n)} />
        ))}
      </View>

      <Text
        style={{
          marginTop: SPACING.md,
          fontSize: 15,
          fontWeight: '700',
          color: value == null ? colors.textMuted : rpeColor(value, colors),
        }}
      >
        {value == null ? 'Tap a number to rate your effort' : `${value} · ${rpeLabel(value)}`}
      </Text>
    </View>
  )
}

function RpePill({
  value,
  selected,
  onPress,
}: {
  value: number
  selected: boolean
  onPress: () => void
}) {
  const { colors } = useTheme()

  const scale = useSharedValue(1)
  const fill = useSharedValue(0)
  const color = rpeColor(value, colors)

  useEffect(() => {
    scale.value = selected
      ? withSpring(1.18, { damping: 12, stiffness: 220 })
      : withTiming(1, { duration: 140 })
    fill.value = withTiming(selected ? 1 : 0, { duration: 140 })
  }, [selected, scale, fill])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    backgroundColor: fill.value > 0.5 ? color : colors.surfaceAlt,
    borderColor: fill.value > 0.5 ? color : colors.border,
  }))

  return (
    <Pressable
      onPress={() => {
        haptics.light()
        onPress()
      }}
      hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
      style={{ flex: 1 }}
    >
      <Animated.View
        style={[
          {
            height: 44,
            borderRadius: RADIUS.md,
            borderWidth: 1.5,
            alignItems: 'center',
            justifyContent: 'center',
          },
          animatedStyle,
        ]}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '800',
            color: selected ? colors.bg : color,
          }}
        >
          {value}
        </Text>
      </Animated.View>
    </Pressable>
  )
}
