// The "Demo mode" pill, and the strip it sits in.

import { useMemo, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import TabIcon from './TabIcon'
import { useAuthStore, useIsDemo } from '../../store/authStore'
import { haptics } from '../../utils/haptics'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, onColor } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const STRIP_H = 34

export default function DemoChrome({ children }: { children: React.ReactNode }) {
  const isDemo = useIsDemo()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  const nestedInsets = useMemo(
    () => (isDemo ? { ...insets, top: 0 } : insets),
    [isDemo, insets],
  )

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      {isDemo ? <DemoBanner /> : null}
      <SafeAreaInsetsContext.Provider value={nestedInsets}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  )
}

function DemoBanner() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)

  const [confirming, setConfirming] = useState(false)
  const ink = onColor(colors.accent)

  return (
    <>
      <Animated.View
        entering={FadeIn.duration(200)}
        style={{ paddingTop: insets.top, backgroundColor: colors.bg }}
      >
        <View
          style={{
            height: STRIP_H,
            backgroundColor: colors.accent,
            flexDirection: 'row',
            alignItems: 'center',
            paddingLeft: SPACING.base,
            paddingRight: SPACING.sm,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: RADIUS.pill,
              backgroundColor: ink,
              opacity: 0.9,
              marginRight: SPACING.sm,
            }}
          />
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              flex: 1,
              fontSize: TYPE.micro,
              fontWeight: WEIGHT.heavy,
              letterSpacing: 0.6,
              color: ink,
            }}
          >
            Demo mode · sample training data
          </Text>

          <Pressable
            onPress={() => {
              haptics.light()
              setConfirming(true)
            }}
            accessibilityRole="button"
            accessibilityLabel="Exit demo mode"
            hitSlop={10}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: RADIUS.pill,
              borderWidth: 1,
              borderColor: ink,
            }}
          >
            <TabIcon name="sliders" size={11} color={ink} focused />
            <Text style={{ fontSize: TYPE.caption, fontWeight: WEIGHT.heavy, color: ink }}>
              Exit demo
            </Text>
          </Pressable>
        </View>
      </Animated.View>

      <ExitConfirm
        visible={confirming}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          setConfirming(false)
          void signOut()
        }}
      />
    </>
  )
}

function ExitConfirm({
  visible,
  onCancel,
  onConfirm,
}: {
  visible: boolean
  onCancel: () => void
  onConfirm: () => void
}) {
  const { colors } = useTheme()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          entering={FadeInDown.duration(180)}
          style={{ backgroundColor: colors.surface, borderRadius: RADIUS.xl, padding: 20 }}
        >
          <Text
            style={{
              fontSize: TYPE.subtitle,
              fontWeight: WEIGHT.heavy,
              color: colors.text,
              textAlign: 'center',
            }}
          >
            Leave the demo?
          </Text>
          <Text
            style={{
              marginTop: SPACING.sm,
              fontSize: TYPE.small,
              lineHeight: 20,
              color: colors.textBody,
              textAlign: 'center',
            }}
          >
            This signs out and returns to the login screen. Tap &quot;Try Demo&quot; there to
            come back — the sample data is untouched.
          </Text>

          <Pressable
            onPress={onConfirm}
            accessibilityRole="button"
            style={{
              minHeight: MIN_TOUCH,
              borderRadius: RADIUS.md,
              marginTop: SPACING.base,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: colors.onAccent, fontSize: TYPE.body, fontWeight: WEIGHT.bold }}>
              Exit demo
            </Text>
          </Pressable>
          <Pressable
            onPress={onCancel}
            accessibilityRole="button"
            style={{
              minHeight: MIN_TOUCH,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: 4,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: TYPE.body, fontWeight: WEIGHT.bold }}>
              Stay in the demo
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
