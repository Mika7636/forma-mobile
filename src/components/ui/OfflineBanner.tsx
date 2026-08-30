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
import { useNetworkStore } from '../../store/networkStore'
import { RADIUS, SPACING, TYPE, onColor } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function OfflineBanner() {
  const { colors } = useTheme()

  const status = useNetworkStore((s) => s.status)
  const reconnecting = useNetworkStore((s) => s.reconnecting)
  const subscribe = useNetworkStore((s) => s.subscribe)
  const insets = useSafeAreaInsets()

  // One NetInfo listener for the whole app, owned by the one component that
  // renders its result.
  useEffect(() => subscribe(), [subscribe])

  const offline = status === 'offline'
  if (!offline && !reconnecting) return null

  // On dark, "a dark slab" is not distinguishable from the page, so the offline
  // state is a raised surface with a hairline while the reconnecting state keeps
  // its accent fill.
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
      {/* The bar extends under the status bar, so what is behind the clock and
          the battery here is the banner, not the page — it states its own
          requirement rather than going through <ThemedStatusBar>, and
          unmounting restores whatever the screen underneath asked for.

          Derived from the slab rather than hard-coded: this used to assert
          "light", on the grounds that both variants were dark in both themes.
          Neither half of that is true now. The light theme's offline slab is
          `surfaceAlt`, which is near-white, and its reconnecting slab is the
          vibrant accent, which carries dark ink — white icons on either are
          about 1.1:1 and 2.3:1. `onColor` answers the same question for the
          status bar that it answers for the banner's own label. */}
      <StatusBar style={onColor(look.bg) === '#FFFFFF' ? 'light' : 'dark'} />

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
