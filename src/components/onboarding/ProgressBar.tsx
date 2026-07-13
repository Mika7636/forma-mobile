import { useEffect } from 'react'
import { Text, View } from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { COLORS } from '../../constants/theme'

interface ProgressBarProps {
  /** Current step, 1-indexed. */
  step: number
  totalSteps: number
}

/** Thin teal-filled progress bar with a "Step X of N" caption. */
export default function ProgressBar({ step, totalSteps }: ProgressBarProps) {
  const progress = useSharedValue(step / totalSteps)

  useEffect(() => {
    progress.value = withTiming(step / totalSteps, { duration: 300 })
  }, [step, totalSteps, progress])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${progress.value * 100}%`,
  }))

  return (
    <View>
      <View
        style={{
          height: 6,
          borderRadius: 999,
          backgroundColor: COLORS.border,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              height: '100%',
              borderRadius: 999,
              backgroundColor: COLORS.teal,
            },
            fillStyle,
          ]}
        />
      </View>
      <Text
        style={{
          marginTop: 8,
          fontSize: 13,
          fontWeight: '600',
          color: COLORS.muted,
        }}
      >
        Step {step} of {totalSteps}
      </Text>
    </View>
  )
}
