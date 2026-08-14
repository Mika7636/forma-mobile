// The launch screen the user actually sees fade away.
//
// Why a JS overlay on top of the native splash rather than just the native one:
// the native splash can only be cut, not faded, and it disappears the moment
// `hideAsync()` runs — which is before auth has restored and before the first
// Firestore snapshot lands, so you'd get a flash of an empty dashboard. This
// overlay takes over from it, holds until the app is genuinely ready, then
// fades out.
//
// The handoff is invisible because this renders the *same* asset the native
// splash uses (assets/splash-icon.png), at the same width, on the same white,
// in the same place. Only the wordmark is new, and it fades in below the mark so
// nothing shifts.
import { useCallback, useEffect, useState } from 'react'
import { Image, Text, View } from 'react-native'
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated'
import { COLORS, MOTION, TYPE } from '../../constants/theme'

/** Matches `imageWidth` in the expo-splash-screen plugin config in app.json. */
const MARK_WIDTH = 180

interface BrandSplashProps {
  /** Flip true once auth state and first data have settled. */
  ready: boolean
  /** Called after the fade completes, so the parent can stop rendering this. */
  onFinished?: () => void
}

export default function BrandSplash({ ready, onFinished }: BrandSplashProps) {
  const [gone, setGone] = useState(false)
  const opacity = useSharedValue(1)
  const wordmark = useSharedValue(0)

  const finish = useCallback(() => {
    setGone(true)
    onFinished?.()
  }, [onFinished])

  useEffect(() => {
    // Slightly delayed so it doesn't animate during the busiest frames of boot.
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
    // A few pixels of rise — enough to read as "arriving", not as a slide.
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
          backgroundColor: COLORS.white,
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
        // Decoding the mark late would defeat the point of a seamless handoff.
        fadeDuration={0}
      />

      {/* Absolutely positioned so its arrival can't nudge the mark off the
          centre the native splash left it on. */}
      <View style={{ position: 'absolute', top: '50%', left: 0, right: 0, marginTop: MARK_WIDTH / 2 }}>
        <Animated.View style={[{ alignItems: 'center' }, wordmarkStyle]}>
          <Text
            style={{
              fontSize: 30,
              fontWeight: '800',
              letterSpacing: 30 * 0.12,
              color: COLORS.teal,
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
              color: COLORS.subtle,
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
