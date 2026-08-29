// The app's standard "this is tappable" feedback: a small scale-down while held
// that springs back on release, plus the haptic that matches the action.
//
// Two things this deliberately does NOT do:
//   - it never passes a function to `style`. NativeWind's style interop silently
//     drops the function form, leaving the element completely unstyled with no
//     TS error and no runtime warning. Press state is tracked through shared
//     values instead, and `style` stays a plain object/array.
//   - it doesn't animate opacity. Scale alone reads as physical; fading a card
//     while you hold it reads as "disabled".
import { useCallback } from 'react'
import { Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated'
import { MOTION } from '../../theme/tokens'
import { haptics } from '../../utils/haptics'

const AnimatedPressable = Animated.createAnimatedComponent(Pressable)

export interface PressableScaleProps extends Omit<PressableProps, 'style'> {
  children: React.ReactNode
  style?: StyleProp<ViewStyle>
  /**
   * How far to shrink while held. `button` is the noticeable default; `card` is
   * a subtler press for large surfaces, where a big scale looks like a glitch.
   */
  variant?: 'button' | 'card' | 'none'
  /** Haptic fired on press. `null` for elements that shouldn't buzz. */
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
