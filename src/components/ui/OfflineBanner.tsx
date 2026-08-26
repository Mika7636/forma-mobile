// The "you're offline" strip, mounted once at the app root so it's there on
// every screen without any of them knowing about it.
//
// It sits over the top of the screen rather than pushing content down: pushing
// would reflow every screen the instant connectivity flickers, which is far more
// disruptive than a thin bar briefly overlapping a header. It's also why the bar
// is deliberately short and quiet — informative, not alarming. Nothing in FORMA
// is actually broken while offline.
import { useEffect } from 'react'
import { Text, View } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated'
import { COLORS, RADIUS, SPACING, TYPE } from '../../constants/theme'
import { useNetworkStore } from '../../store/networkStore'

export default function OfflineBanner() {
  const status = useNetworkStore((s) => s.status)
  const reconnecting = useNetworkStore((s) => s.reconnecting)
  const subscribe = useNetworkStore((s) => s.subscribe)
  const insets = useSafeAreaInsets()

  // One NetInfo listener for the whole app, owned by the one component that
  // renders its result.
  useEffect(() => subscribe(), [subscribe])

  const offline = status === 'offline'
  if (!offline && !reconnecting) return null

  // On the light theme both slabs were dark with white type. On dark, "a dark
  // slab" is no longer distinguishable from the page, so the offline state
  // becomes a raised surface with a hairline and the reconnecting state keeps
  // its accent fill — where the type has to go dark, not light.
  const look = offline
    ? {
        bg: COLORS.surfaceAlt,
        fg: COLORS.ink,
        dot: COLORS.warning,
        text: 'Offline — changes will sync when you’re back online',
      }
    : {
        bg: COLORS.teal,
        fg: COLORS.onAccent,
        dot: COLORS.onAccent,
        text: 'Back online — syncing…',
      }

  return (
    <>
      {/* The bar extends under the status bar. Every screen is `light` now, so
          this is no longer correcting anything — it is here so the banner keeps
          stating its own requirement rather than inheriting one, since the
          reconnecting variant fills with the accent and would need light icons
          regardless of what the screen underneath asked for. */}
      <StatusBar style="light" />

      <Animated.View
        // Keyed by state so swapping offline -> reconnecting replays the
        // entrance and the colour change reads as a new message, not a
        // restyled old one.
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
