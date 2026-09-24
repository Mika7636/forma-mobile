// The app's loading-placeholder primitives.

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
  radius?: number
  style?: StyleProp<ViewStyle>
}

const SWEEP_DURATION = 1150

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

export const Skeleton = memo(SkeletonBase)

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
