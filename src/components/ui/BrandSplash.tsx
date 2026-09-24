// The launch screen the user sees fade away.

import { useCallback, useEffect, useState } from 'react'
import { Image, Text, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { MOTION, TYPE } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'
const MARK_WIDTH = 180

interface BrandSplashProps {
  ready: boolean
  onFinished?: () => void
}

export default function BrandSplash({ ready, onFinished }: BrandSplashProps) {
  const { colors } = useTheme()

  const [gone, setGone] = useState(false)
  const opacity = useSharedValue(1)
  const wordmark = useSharedValue(0)

  const finish = useCallback(() => {
    setGone(true)
    onFinished?.()
  }, [onFinished])

  useEffect(() => {
    wordmark.value = withDelay(140, withTiming(1, { duration: MOTION.base }))
  }, [wordmark])

  useEffect(() => {
    if (!ready) return
    opacity.value = withTiming(0, { duration: MOTION.slow }, (finished) => {
      if (finished) runOnJS(finish)()
    })
  }, [ready, opacity, finish])

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmark.value,
    transform: [{ translateY: (1 - wordmark.value) * 8 }],
  }))

  if (gone) return null

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        {
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: colors.bg,
          alignItems: 'center',
          justifyContent: 'center',
        },
        fadeStyle,
      ]}
    >
      <Image
        source={require('../../../assets/splash-icon.png')}
        style={{ width: MARK_WIDTH, height: MARK_WIDTH }}
        resizeMode="contain"
        fadeDuration={0}
      />

      <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: MARK_WIDTH / 2 }}>
        <Animated.View style={[{ alignItems: 'center' }, wordmarkStyle]}>
          <Text
            style={{
              fontSize: 30,
              fontWeight: '800',
              letterSpacing: 30 * 0.12,
              color: colors.accent,
            }}
          >
            FORMA
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: TYPE.micro,
              fontWeight: '600',
              letterSpacing: 1.4,
              color: colors.textSubtle,
              textTransform: 'uppercase',
            }}
          >
            Train smarter
          </Text>
        </Animated.View>
      </View>
    </Animated.View>
  )
}
