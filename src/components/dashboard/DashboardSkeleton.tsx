import { useEffect } from 'react'
import { View, type DimensionValue } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import { COLORS } from '../../constants/theme'

/**
 * A pulsing grey block. All blocks share one clock via their own shared value,
 * driven on the UI thread so the pulse stays smooth while Firestore's first
 * snapshot is still in flight.
 */
function Block({
  width,
  height,
  radius = 8,
  style,
}: {
  width: DimensionValue
  height: number
  radius?: number
  style?: object
}) {
  const opacity = useSharedValue(0.5)
  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    )
  }, [opacity])
  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[
        { width, height, borderRadius: radius, backgroundColor: '#E5E7EB' },
        animStyle,
        style,
      ]}
    />
  )
}

/**
 * First-load placeholder. Mirrors the real dashboard's layout — hero, 2×3 grid,
 * zone bar, activity rows — so the transition to live data doesn't reflow.
 */
export default function DashboardSkeleton() {
  return (
    <View style={{ gap: 20 }}>
      {/* Form score hero */}
      <Block width="100%" height={200} radius={24} />

      {/* Metric grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <View
            key={i}
            style={{
              flexBasis: '47%',
              flexGrow: 1,
              backgroundColor: COLORS.white,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 16,
            }}
          >
            <Block width="60%" height={24} />
            <Block width="85%" height={10} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Zone chart */}
      <View
        style={{
          backgroundColor: COLORS.white,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          padding: 16,
        }}
      >
        <Block width="55%" height={16} />
        <Block width="100%" height={20} radius={999} style={{ marginTop: 16 }} />
        <Block width="70%" height={10} style={{ marginTop: 14 }} />
      </View>

      {/* Activity rows */}
      <View style={{ gap: 8 }}>
        <Block width="40%" height={16} style={{ marginBottom: 2 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <View
            key={i}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: COLORS.white,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: COLORS.border,
              padding: 12,
            }}
          >
            <Block width={42} height={42} radius={21} />
            <View style={{ flex: 1, marginLeft: 12 }}>
              <Block width="45%" height={13} />
              <Block width="70%" height={10} style={{ marginTop: 6 }} />
            </View>
            <Block width={54} height={28} />
          </View>
        ))}
      </View>
    </View>
  )
}
