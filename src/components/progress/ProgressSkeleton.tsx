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

/** A pulsing grey block, matching the dashboard skeleton's look. */
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
      style={[{ width, height, borderRadius: radius, backgroundColor: '#E5E7EB' }, animStyle, style]}
    />
  )
}

function CardBlock({ height }: { height: number }) {
  return (
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
      <Block width="75%" height={10} style={{ marginTop: 8 }} />
      <Block width="100%" height={height} radius={12} style={{ marginTop: 16 }} />
    </View>
  )
}

/**
 * First-load placeholder while `computeProgress` and the first Firestore snapshot
 * settle. Mirrors the real screen's stack — stats row, hero chart, then shorter
 * charts — so unlocking to live data doesn't reflow the page.
 */
export default function ProgressSkeleton() {
  return (
    <View style={{ gap: 16 }}>
      {/* Stats grid */}
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
            <Block width={26} height={26} radius={8} />
            <Block width="70%" height={22} style={{ marginTop: 10 }} />
            <Block width="50%" height={10} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      <CardBlock height={230} />
      <CardBlock height={150} />
      <CardBlock height={150} />
    </View>
  )
}
