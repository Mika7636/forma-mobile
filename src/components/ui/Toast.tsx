// A single toast card. ToastContainer owns the list; this owns one item's
// lifecycle — enter, count down, and exit (by timer, by tap, or by swipe).
//
// The exit animation is driven manually rather than with Reanimated's `exiting`
// prop because three different things can start it, and in every case the item
// must stay in the store until the animation has actually finished. So the flow
// is always: play the exit here → `runOnJS(onDismiss)` → the store drops it →
// this unmounts.
import { useCallback, useEffect } from 'react'
import { Pressable, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  withSpring,
} from 'react-native-reanimated'
import { COLORS, MOTION, RADIUS, SHADOW, SPACING, TYPE } from '../../constants/theme'
import type { ToastItem, ToastType } from '../../store/toastStore'

interface ToastProps {
  item: ToastItem
  onDismiss: (id: string) => void
}

interface ToastLook {
  accent: string
  tint: string
  glyph: string
}

const LOOK: Record<ToastType, ToastLook> = {
  success: { accent: COLORS.teal, tint: COLORS.tealSoft, glyph: '✓' },
  error: { accent: COLORS.danger, tint: COLORS.dangerSoft, glyph: '✕' },
  warning: { accent: COLORS.warning, tint: COLORS.warningSoft, glyph: '!' },
  info: { accent: COLORS.info, tint: COLORS.infoSoft, glyph: 'i' },
}

/** Horizontal travel past which releasing the swipe dismisses instead of snapping back. */
const SWIPE_THRESHOLD = 88

export default function Toast({ item, onDismiss }: ToastProps) {
  const look = LOOK[item.type]

  const opacity = useSharedValue(0)
  const translateY = useSharedValue(28)
  const translateX = useSharedValue(0)
  const progress = useSharedValue(1)

  const remove = useCallback(() => onDismiss(item.id), [onDismiss, item.id])

  /** Slides the card away in `direction` (0 = straight down) then removes it. */
  const exit = useCallback(
    (direction: number) => {
      'worklet'
      if (direction === 0) {
        translateY.value = withTiming(28, { duration: MOTION.fast })
      } else {
        translateX.value = withTiming(direction * 420, { duration: MOTION.fast })
      }
      // The removal hangs off the fade because that leg runs whichever way the
      // card leaves, so it fires exactly once.
      opacity.value = withTiming(0, { duration: MOTION.fast }, (finished) => {
        if (finished) runOnJS(remove)()
      })
    },
    [opacity, translateX, translateY, remove],
  )

  useEffect(() => {
    // Enter: rise into place with a spring, fade in on a plain timing curve so
    // the text never looks like it's wobbling.
    opacity.value = withTiming(1, { duration: MOTION.base })
    translateY.value = withSpring(0, MOTION.spring)
    // The progress rail doubles as the countdown — linear so it reads as a clock.
    progress.value = withTiming(0, { duration: item.duration, easing: Easing.linear })

    const timer = setTimeout(() => exit(0), item.duration)
    return () => clearTimeout(timer)
    // Intentionally mount-only: `item` is immutable once shown.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pan = Gesture.Pan()
    // Only claim clearly-horizontal drags, so a vertical scroll that starts on a
    // toast still reaches whatever is underneath it.
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((event) => {
      translateX.value = event.translationX
    })
    .onEnd((event) => {
      if (Math.abs(event.translationX) > SWIPE_THRESHOLD) {
        exit(Math.sign(event.translationX))
      } else {
        translateX.value = withSpring(0, MOTION.spring)
      }
    })

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }, { translateX: translateX.value }],
  }))

  const progressStyle = useAnimatedStyle(() => ({
    // Scale rather than width: width animations can't run on the UI thread.
    transform: [{ scaleX: progress.value }],
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: COLORS.surface,
            borderRadius: RADIUS.card,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingVertical: SPACING.md,
            paddingLeft: SPACING.md,
            paddingRight: SPACING.sm,
            gap: SPACING.md,
            overflow: 'hidden',
            ...SHADOW.floating,
          },
          animatedStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`${item.type}: ${item.message}`}
      >
        {/* Colour rail — carries the type even before you read the words. */}
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: look.accent,
          }}
        />

        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: RADIUS.pill,
            backgroundColor: look.tint,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: SPACING.xs,
          }}
        >
          <Text style={{ fontSize: TYPE.body, fontWeight: '800', color: look.accent }}>
            {look.glyph}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: TYPE.body, fontWeight: '700', color: COLORS.ink }}>
            {item.message}
          </Text>
          {item.description ? (
            <Text style={{ marginTop: 2, fontSize: TYPE.small, color: COLORS.muted }}>
              {item.description}
            </Text>
          ) : null}
        </View>

        <Pressable
          onPress={() => exit(0)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Dismiss notification"
          style={{
            width: 28,
            height: 28,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: TYPE.subtitle, color: COLORS.subtle, fontWeight: '600' }}>
            ✕
          </Text>
        </Pressable>

        {/* Countdown rail, pinned to the bottom edge. */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 2,
              backgroundColor: look.accent,
              opacity: 0.35,
              // Shrink toward the left edge rather than the centre.
              transform: [{ scaleX: 1 }],
              transformOrigin: 'left',
            },
            progressStyle,
          ]}
        />
      </Animated.View>
    </GestureDetector>
  )
}
