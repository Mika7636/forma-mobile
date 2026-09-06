// The "Demo mode" pill, and the strip it sits in.
//
// ## Why this is a strip and not a floating badge
//
// FORMA has no shared header — every screen draws its own, and the top-right
// corner of each is already occupied (the Dashboard's log button, Settings'
// "Saving…" indicator). A badge pinned over that corner would sit on top of a
// control on two screens and next to nothing on the others.
//
// So the badge lives in a band of its own above the navigator, and the band
// takes real height rather than overlaying anything. `OfflineBanner` makes the
// opposite choice — it floats over the top of the screen — and is right to: it
// appears for a few seconds when connectivity flickers, and reflowing every
// screen for that would be far more disruptive than a brief overlap. This one is
// on screen for the entire session, and a permanent overlay covering the top of
// every header is not a trade anybody would make.
//
// Taking real height means the safe-area inset has to move with it, or the strip
// would clear the notch and then each screen's own `SafeAreaView edges={['top']}`
// would clear it a second time, leaving a band of dead space under the badge.
// That is what {@link DemoChrome} is for.
//
// ## Why "Exit demo" is a confirm and not a tap
//
// It signs out, and the way back in is a button on the login screen that a
// tester has no reason to look for. A stranger exploring the app's chrome should
// not be able to end the demo by tapping something interesting in the corner.
import { useMemo, useState } from 'react'
import { Modal, Pressable, Text, View } from 'react-native'
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import TabIcon from './TabIcon'
import { useAuthStore, useIsDemo } from '../../store/authStore'
import { haptics } from '../../utils/haptics'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, onColor } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** Height of the strip itself, above the safe-area inset. */
const STRIP_H = 34

/**
 * Wraps the navigator so the demo strip can push it down.
 *
 * Off the demo account this is a plain full-height container and the insets pass
 * straight through, so an ordinary build pays for one boolean and one extra
 * view.
 *
 * On it, the strip absorbs the top inset and the children are handed an
 * inset context with `top: 0`. Every `SafeAreaView edges={['top']}` and every
 * `useSafeAreaInsets()` below this point reads from that context, so the screens
 * stop padding for a notch the strip has already cleared. `bottom`, `left` and
 * `right` pass through untouched — the tab bar still needs its gesture-bar
 * padding, and nothing about a top strip changes that.
 */
export default function DemoChrome({ children }: { children: React.ReactNode }) {
  const isDemo = useIsDemo()
  const insets = useSafeAreaInsets()
  const { colors } = useTheme()

  // The tree shape is identical either way, and that is deliberate rather than
  // tidy. Returning bare children when demo mode is off and a wrapped tree when
  // it is on would move `children` to a different position in the element tree
  // the moment somebody signs in or out, and React unmounts and remounts a
  // subtree that moves — taking `NavigationContainer` and `navigationRef` with
  // it. Keeping the wrapper always mounted makes signing into the demo a change
  // of props, not of structure.
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

/**
 * The strip: a label, a dot, and the way out.
 *
 * Accent-filled rather than warn-tinted. A demo build is not a fault state and
 * an amber bar across the top of every screen for an hour would read as one; the
 * accent says "this is FORMA, in a particular mode" — which is what it is.
 */
function DemoBanner() {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()
  const signOut = useAuthStore((s) => s.signOut)

  const [confirming, setConfirming] = useState(false)
  const ink = onColor(colors.accent)

  return (
    <>
      {/* The inset is painted in the page ground, not in the accent, so the
          status bar keeps sitting on `bg` and `ThemedStatusBar` stays correct in
          both themes. Running the accent up under the clock would put whatever
          ink the active screen asked for on a saturated green: white on this
          accent is about 2.3:1, which is the exact trap `OfflineBanner` has to
          declare its own `<StatusBar>` to avoid. Not extending sidesteps it
          rather than fighting it, and a band below the status bar is what this
          reads as anyway. */}
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

/** "Are you sure" — see the note at the top of the file for why it is here. */
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
