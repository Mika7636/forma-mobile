// The app's one loading placeholder primitive. Every screen that waits on
// Firestore builds its skeleton out of these, so "loading" looks the same
// everywhere instead of a spinner here and a grey box there.
//
// Two rules that make skeletons feel professional rather than cheap, both baked
// in here so callers can't get them wrong:
//   - the placeholder must match the real content's box exactly, or the page
//     visibly reflows the moment data lands;
//   - it must animate, or it reads as a broken render.
import { memo, useEffect, useState } from 'react'
import { View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { RADIUS, SPACING, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'
interface SkeletonProps {
  width?: DimensionValue
  height: number
  /** Defaults to the small-element radius; pass RADIUS.pill for avatars/bars. */
  radius?: number
  style?: StyleProp<ViewStyle>
}

const SWEEP_DURATION = 1150

/**
 * A shimmering placeholder block.
 *
 * The highlight is a gradient swept across the block on the UI thread. It needs
 * the block's pixel width to know how far to travel, which percentage-based
 * transforms can't express — hence the `onLayout` measure. Until that first
 * layout arrives the block simply renders flat, which is invisible in practice
 * because it lasts a single frame.
 */
function SkeletonBase({ width = '100%', height, radius = RADIUS.sm, style }: SkeletonProps) {
  const { colors } = useTheme()

  const [measured, setMeasured] = useState(0)
  const progress = useSharedValue(0)

  useEffect(() => {
    progress.value = withRepeat(
      withTiming(1, { duration: SWEEP_DURATION, easing: Easing.inOut(Easing.quad) }),
      -1,
      false,
    )
  }, [progress])

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -measured + progress.value * (measured * 2) }],
  }))

  return (
    <View
      onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}
      style={[
        {
          width,
          height,
          borderRadius: radius,
          backgroundColor: colors.skeleton,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {measured > 0 ? (
        <Animated.View style={[{ width: measured, height: '100%' }, sweepStyle]}>
          <LinearGradient
            colors={['transparent', colors.skeletonHighlight, 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={{ flex: 1 }}
          />
        </Animated.View>
      ) : null}
    </View>
  )
}

/** Memoised: skeletons re-render whenever their parent screen does, and none of
 *  their props change while loading. */
export const Skeleton = memo(SkeletonBase)

/**
 * A skeleton wrapped in the app's standard card, so a placeholder card has the
 * same radius, border, padding and shadow as the real one it replaces.
 */
export function SkeletonCard({
  children,
  style,
}: {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
}) {
  const { colors } = useTheme()
  return <View style={[cardStyle(colors), style]}>{children}</View>
}

/** Two or three stacked lines — the common "title + subtitle" placeholder. */
export function SkeletonLines({
  lines = 2,
  widths = ['70%', '45%'],
  height = 12,
  gap = SPACING.sm,
}: {
  lines?: number
  widths?: DimensionValue[]
  height?: number
  gap?: number
}) {
  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Skeleton key={i} width={widths[i] ?? '60%'} height={height} />
      ))}
    </View>
  )
}

export default Skeleton
