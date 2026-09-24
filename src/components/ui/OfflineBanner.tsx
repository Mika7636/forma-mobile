// The "you're offline" strip, mounted once at the app root.

import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated'
import { useNetworkStore } from '../../store/networkStore'
import { RADIUS, SPACING, TYPE, onColor } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function OfflineBanner() {
  const { colors } = useTheme()

  const status = useNetworkStore((s) => s.status)
  const reconnecting = useNetworkStore((s) => s.reconnecting)
  const subscribe = useNetworkStore((s) => s.subscribe)
  const insets = useSafeAreaInsets()

  useEffect(() => subscribe(), [subscribe])

  const offline = status === 'offline'
  if (!offline && !reconnecting) return null

  const look = offline
    ? {
        bg: colors.surfaceAlt,
        fg: colors.text,
        dot: colors.warn,
        text: 'Offline — changes will sync when you’re back online',
      }
    : {
        bg: colors.accent,
        fg: colors.onAccent,
        dot: colors.onAccent,
        text: 'Back online — syncing…',
      }

  return (
    <>
      <StatusBar style={onColor(look.bg) === '#FFFFFF' ? 'light' : 'dark'} />

      <Animated.View
        key={offline ? 'offline' : 'reconnecting'}
        entering={FadeInUp.duration(220)}
        exiting={FadeOutUp.duration(180)}
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          paddingTop: insets.top,
          backgroundColor: look.bg,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: SPACING.sm,
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.base,
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: RADIUS.pill,
              backgroundColor: look.dot,
            }}
          />
          <Text
            style={{ fontSize: TYPE.micro, fontWeight: '600', color: look.fg }}
            numberOfLines={1}
          >
            {look.text}
          </Text>
        </View>
      </Animated.View>
    </>
  )
}
