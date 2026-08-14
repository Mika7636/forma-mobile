import { useState } from 'react'
import { LayoutChangeEvent, Pressable, Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  Easing,
} from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { COLORS } from '../../constants/theme'

/** The three selectable windows, in weeks. Default is 8. */
export const RANGE_OPTIONS = [4, 8, 12] as const
export type RangeWeeks = (typeof RANGE_OPTIONS)[number]

interface DateRangeSelectorProps {
  value: RangeWeeks
  onChange: (weeks: RangeWeeks) => void
}

const PAD = 4

/**
 * Segmented pill control choosing the 4 / 8 / 12-week window for every chart on
 * the Progress screen. A single teal highlight slides between segments (rather
 * than each pill toggling its own background) so the transition reads as one
 * smooth motion; selection fires a light haptic.
 */
export default function DateRangeSelector({ value, onChange }: DateRangeSelectorProps) {
  const [trackWidth, setTrackWidth] = useState(0)
  const selectedIndex = RANGE_OPTIONS.indexOf(value)
  const highlightX = useSharedValue(0)

  const segWidth = trackWidth > 0 ? (trackWidth - PAD * 2) / RANGE_OPTIONS.length : 0

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (Math.abs(w - trackWidth) > 0.5) {
      setTrackWidth(w)
      // Place the highlight without animating on the first measure.
      highlightX.value = PAD + Math.max(0, selectedIndex) * ((w - PAD * 2) / RANGE_OPTIONS.length)
    }
  }

  const highlightStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: highlightX.value }],
  }))

  const select = (index: number) => {
    if (index === selectedIndex) return
    haptics.light()
    highlightX.value = withTiming(PAD + index * segWidth, {
      duration: 240,
      easing: Easing.out(Easing.cubic),
    })
    onChange(RANGE_OPTIONS[index])
  }

  return (
    <View
      onLayout={onLayout}
      style={{
        flexDirection: 'row',
        backgroundColor: COLORS.fieldBg,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: COLORS.border,
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
              height: 36,
              width: segWidth,
              borderRadius: 999,
              backgroundColor: COLORS.teal,
            },
            highlightStyle,
          ]}
        />
      ) : null}

      {RANGE_OPTIONS.map((weeks, i) => {
        const active = i === selectedIndex
        return (
          <Pressable
            key={weeks}
            onPress={() => select(i)}
            style={{ flex: 1, height: 36, alignItems: 'center', justifyContent: 'center' }}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text
              style={{
                fontSize: 14,
                fontWeight: '700',
                color: active ? COLORS.white : COLORS.body,
              }}
            >
              {weeks} Weeks
            </Text>
          </Pressable>
        )
      })}
    </View>
  )
}
