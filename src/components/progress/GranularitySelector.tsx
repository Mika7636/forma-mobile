import { useState } from 'react'
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'
import { MOTION, RADIUS, TYPE, WEIGHT } from '../../theme/tokens'
import type { Granularity } from '../../utils/progressMetrics'

const OPTIONS: { value: Granularity; label: string }[] = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

interface GranularitySelectorProps {
  value: Granularity
  onChange: (value: Granularity) => void
}

const PAD = 4
const HEIGHT = 36

/**
 * Daily / Weekly / Monthly, for every chart on the Progress screen.
 *
 * This replaced a "4 Weeks / 8 Weeks / 12 Weeks" control. The numbers were
 * arbitrary — nothing in the training model happens at 8 weeks — and they asked
 * the athlete to answer a question about the chart's x-axis rather than about
 * their own training. A grain is something a person actually has an opinion
 * about ("how did this week go" vs "how has this year gone"), and the window
 * follows from it.
 *
 * One highlight slides between segments rather than each pill toggling its own
 * background, so the change reads as a single movement.
 */
export default function GranularitySelector({ value, onChange }: GranularitySelectorProps) {
  const { colors } = useTheme()

  const [trackWidth, setTrackWidth] = useState(0)
  const selectedIndex = OPTIONS.findIndex((o) => o.value === value)
  const highlightX = useSharedValue(0)

  const segWidth = trackWidth > 0 ? (trackWidth - PAD * 2) / OPTIONS.length : 0

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (Math.abs(w - trackWidth) > 0.5) {
      setTrackWidth(w)
      // Place the highlight without animating on the first measure.
      highlightX.value = PAD + Math.max(0, selectedIndex) * ((w - PAD * 2) / OPTIONS.length)
    }
  }

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highlightX.value }],
  }))

  const select = (index: number) => {
    if (index === selectedIndex) return
    haptics.light()
    highlightX.value = withTiming(PAD + index * segWidth, {
      duration: MOTION.base,
      easing: Easing.out(Easing.cubic),
    })
    onChange(OPTIONS[index].value)
  }

  return (
    <View
      onLayout={onLayout}
      accessibilityRole="tablist"
      style={{
        flexDirection: 'row',
        backgroundColor: colors.fieldBg,
        borderRadius: RADIUS.pill,
        borderWidth: 1,
        borderColor: colors.border,
        padding: PAD,
      }}
    >
      {segWidth > 0 ? (
        <Animated.View
          style={[
            {
              position: 'absolute',
              top: PAD,
              left: 0,
              height: HEIGHT,
              width: segWidth,
              borderRadius: RADIUS.pill,
              backgroundColor: colors.accent,
            },
            highlightStyle,
          ]}
        />
      ) : null}

      {OPTIONS.map((option, i) => {
        const active = i === selectedIndex
        return (
          <Pressable
            key={option.value}
            onPress={() => select(i)}
            style={{ flex: 1, height: HEIGHT, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={{
                fontSize: TYPE.body,
                fontWeight: WEIGHT.bold,
                color: active ? colors.onAccent : colors.textBody,
              }}
            >
              {option.label}
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
