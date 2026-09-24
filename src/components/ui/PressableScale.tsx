// Standard tap feedback: a small scale-down while held.

import { useCallback } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { MOTION } from '../../theme/tokens'
import { haptics } from '../../utils/haptics'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  variant?: 'button' | 'card' | 'none'
  haptic?: 'light' | 'medium' | 'heavy' | 'selection' | 'warning' | null
}

export default function PressableScale({
  children,
  style,
  variant = 'button',
  haptic = 'light',
  onPress,
  disabled,
  ...rest
}: PressableScaleProps) {
  const scale = useSharedValue(1)

  const target =
    variant === 'card' ? MOTION.cardPressScale : variant === 'none' ? 1 : MOTION.pressScale

  const animatedStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  const handlePress = useCallback<NonNullable<PressableProps['onPress']>>(
    (event) => {
      if (haptic) haptics[haptic]()
      onPress?.(event)
    },
    [haptic, onPress],
  )

  return (
    <AnimatedPressable
      {...rest}
      disabled={disabled}
      onPress={handlePress}
      onPressIn={(e) => {
        scale.value = withSpring(target, MOTION.spring)
        rest.onPressIn?.(e)
      }}
      onPressOut={(e) => {
        scale.value = withSpring(1, MOTION.spring)
        rest.onPressOut?.(e)
      }}
      style={[style, animatedStyle]}
    >
      {children}
    </AnimatedPressable>
  )
}
