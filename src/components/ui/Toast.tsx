// A single toast card; ToastContainer owns the list.

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
import type { ToastItem, ToastType } from '../../store/toastStore'
import { MOTION, RADIUS, SPACING, TYPE, type Palette } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface ToastProps {
  item: ToastItem
  onDismiss: (id: string) => void
}

interface ToastLook {
  accent: string
  tint: string
  glyph: string
}

function look(colors: Palette): Record<ToastType, ToastLook> {
  return {
    success: { accent: colors.accent, tint: colors.accentSoft, glyph: '✓' },
    error: { accent: colors.danger, tint: colors.dangerSoft, glyph: '✕' },
    warning: { accent: colors.warn, tint: colors.warnSoft, glyph: '!' },
    info: { accent: colors.info, tint: colors.infoSoft, glyph: 'i' },
  }
}

const SWIPE_THRESHOLD = 88

export default function Toast({ item, onDismiss }: ToastProps) {
  const { colors } = useTheme()

  const appearance = look(colors)[item.type]

  const opacity = useSharedValue(0)
  const translateY = useSharedValue(28)
  const translateX = useSharedValue(0)
  const progress = useSharedValue(1)

  const remove = useCallback(() => onDismiss(item.id), [onDismiss, item.id])

  const exit = useCallback(
    (direction: number) => {
      'worklet'
      if (direction === 0) {
        translateY.value = withTiming(28, { duration: MOTION.fast })
      } else {
        translateX.value = withTiming(direction * 420, { duration: MOTION.fast })
      }
      opacity.value = withTiming(0, { duration: MOTION.fast }, (finished) => {
        if (finished) runOnJS(remove)()
      })
    },
    [opacity, translateX, translateY, remove],
  )

  useEffect(() => {
    opacity.value = withTiming(1, { duration: MOTION.base })
    translateY.value = withSpring(0, MOTION.spring)
    progress.value = withTiming(0, { duration: item.duration, easing: Easing.linear })

    const timer = setTimeout(() => exit(0), item.duration)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const pan = Gesture.Pan()
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
    transform: [{ scaleX: progress.value }],
  }))

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.surface,
            borderRadius: RADIUS.card,
            borderWidth: 1,
            borderColor: colors.border,
            paddingVertical: SPACING.md,
            paddingLeft: SPACING.md,
            paddingRight: SPACING.sm,
            gap: SPACING.md,
            overflow: 'hidden',
            ...colors.shadowFloating,
          },
          animatedStyle,
        ]}
        accessibilityRole="alert"
        accessibilityLabel={`${item.type}: ${item.message}`}
      >
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: appearance.accent,
          }}
        />

        <View
          style={{
            width: 28,
            height: 28,
            borderRadius: RADIUS.pill,
            backgroundColor: appearance.tint,
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: SPACING.xs,
          }}
        >
          <Text style={{ fontSize: TYPE.body, fontWeight: '800', color: appearance.accent }}>
            {appearance.glyph}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: TYPE.body, fontWeight: '700', color: colors.text }}>
            {item.message}
          </Text>
          {item.description ? (
            <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
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
          <Text style={{ fontSize: TYPE.subtitle, color: colors.textSubtle, fontWeight: '600' }}>
            ✕
          </Text>
        </Pressable>

        <Animated.View
          style={[
            {
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              height: 2,
              backgroundColor: appearance.accent,
              opacity: 0.35,
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
