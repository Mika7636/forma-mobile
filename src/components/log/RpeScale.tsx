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

/**
 * The 1-10 effort scale, as ten tappable pills.
 *
 * ## Why this replaced the slider
 *
 * sRPE is the input the entire app is built on — training load is `duration ×
 * RPE`, and every downstream number (CTL, ATL, Form, conflict detection) is a
 * function of it. A slider was the wrong control for it twice over:
 *
 * - **It reads as a debug control.** A bare track and thumb next to a number is
 *   what you build to test a value, not what you ship as the one judgement the
 *   athlete is asked to make.
 * - **It is genuinely hard to hit.** A ten-stop slider on a phone screen is
 *   about 30pt per stop, operated with a sweaty thumb, immediately after
 *   exercise, often outdoors. Overshooting by one is a 10% error in the
 *   session's load and the athlete usually won't notice.
 *
 * Ten discrete targets can be hit deliberately, show the whole scale at once
 * (so the choice is "how does this compare to a 5", not "where is the thumb"),
 * and can carry the colour ramp — which is the fastest way to communicate that
 * this is an intensity scale, not a rating out of ten.
 *
 * ## Deliberately starting empty
 *
 * `value` is nullable and there is no default. A pre-selected 6 gets accepted
 * unthinkingly by most people most of the time, and a fabricated effort rating
 * silently corrupts every metric derived from it. The Save button stays disabled
 * until a pill is chosen — an unrated session is worth less than no session.
 */
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
    // Spring on the way in, timing on the way out: the selected pill should feel
    // like it was picked up, while the one being replaced shouldn't bounce for
    // attention it no longer deserves.
    scale.value = selected
      ? withSpring(1.18, { damping: 12, stiffness: 220 })
      : withTiming(1, { duration: 140 })
    fill.value = withTiming(selected ? 1 : 0, { duration: 140 })
  }, [selected, scale, fill])

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    // Unselected pills carry their colour only as a hairline, so the row reads
    // as a ramp without ten saturated blocks shouting at once.
    backgroundColor: fill.value > 0.5 ? color : colors.surfaceAlt,
    borderColor: fill.value > 0.5 ? color : colors.border,
  }))

  return (
    <Pressable
      onPress={() => {
        haptics.light()
        onPress()
      }}
      // Generous vertical slop: the pills are narrow by necessity (ten across a
      // phone), so the touch target is made taller than the paint.
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
