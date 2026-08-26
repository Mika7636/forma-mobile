import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import BrandSplash from '../components/ui/BrandSplash'
import { COLORS, MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../constants/theme'
import { useNotificationSync } from '../hooks/useNotificationSync'
import NotificationPermissionScreen from '../screens/NotificationPermissionScreen'
import OnboardingScreen from '../screens/OnboardingScreen'
import { useAuthStore } from '../store/authStore'
import AppStack from './AppStack'
import AuthStack from './AuthStack'

export default function RootNavigator() {
  const initialize = useAuthStore((s) => s.initialize)
  const loading = useAuthStore((s) => s.loading)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const profileStatus = useAuthStore((s) => s.profileStatus)

  // Once the branded overlay has finished fading we stop rendering it entirely,
  // rather than leaving a transparent full-screen view over the app.
  const [splashFinished, setSplashFinished] = useState(false)

  // Attach the Firebase auth-state listener once. It restores a persisted
  // session (AsyncStorage) and loads the Firestore profile before flipping
  // `loading` off.
  useEffect(() => {
    const unsubscribe = initialize()
    return unsubscribe
  }, [initialize])

  // Reconciles scheduled local notifications with saved preferences. Safe to
  // call unconditionally — it no-ops until there's a signed-in user who has
  // actually made a notification choice.
  useNotificationSync()

  // Hand off from the native splash to <BrandSplash> the moment we've laid out
  // a frame containing it. Both draw the same mark at the same size on the same
  // page ground — `app.json`'s splash backgroundColor and `COLORS.pageBg` are
  // the same value — so there's nothing to see at the seam, and because the JS
  // overlay is already on screen, hiding the native one can't expose a blank
  // frame.
  const handleLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.pageBg }} onLayout={handleLayout}>
      {loading ? (
        // Nothing is decided yet — deliberately render no navigator at all
        // rather than mounting AuthStack and swapping it out a frame later.
        <View style={{ flex: 1, backgroundColor: COLORS.pageBg }} />
      ) : (
        <RootContent user={user} profile={profile} profileStatus={profileStatus} />
      )}

      {splashFinished ? null : (
        // `ready` is auth having resolved — the one thing that would otherwise
        // cause a visible flash (Login appearing, then vanishing as the stored
        // session restores). Screen-level data arrives behind skeletons, which
        // is a designed state rather than an empty one, so it isn't gated here.
        <BrandSplash ready={!loading} onFinished={() => setSplashFinished(true)} />
      )}
    </View>
  )
}

/**
 * The auth/onboarding/app gate, split out so the splash overlay above stays
 * readable.
 *
 * ## The rule this encodes
 *
 * Onboarding is destructive-adjacent: it tells an existing athlete the app has
 * never met them and walks them back through a five-step wizard. It must
 * therefore be reachable from exactly one state — the backend having confirmed
 * that no profile document exists — and from nothing that merely *resembles*
 * it.
 *
 * The version of this function that shipped read `!profile` as that condition,
 * which quietly folded four other states into it: auth still resolving, the
 * profile read still in flight, the read having failed, and the app being
 * offline with a cold cache. All four are "we don't know yet", and all four
 * sent returning users to step 1 of 5. Reopening the app offline hit the last
 * two every time.
 *
 * So the states are enumerated, and anything unresolved renders a splash and
 * waits. Waiting is always recoverable; a wrongly-shown onboarding wizard is
 * not, because finishing it overwrites the real profile.
 */
function RootContent({
  user,
  profile,
  profileStatus,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user']
  profile: ReturnType<typeof useAuthStore.getState>['profile']
  profileStatus: ReturnType<typeof useAuthStore.getState>['profileStatus']
}) {
  // Not authed → login. Auth itself has resolved by the time we render (the
  // caller gates on `loading`), so this is a real answer, not an absence.
  if (!user) return <AuthStack />

  // Authed, profile not yet decided → splash. Covers the in-flight read and the
  // failed one alike: `error` means the question is still open, and the store is
  // already retrying it in the background.
  if (!profile) {
    if (profileStatus === 'missing') return <OnboardingScreen />
    return <GateSplash stalled={profileStatus === 'error'} />
  }

  // We have a profile — from Firestore or from the offline mirror. A profile
  // that exists but hasn't been through the wizard is the *other* legitimate
  // route to onboarding, and unlike the one above it can't be caused by a
  // network failure: the flag was read off a document we actually hold.
  if (!profile.onboardingCompleted) return <OnboardingScreen />

  // Onboarded but never asked about notifications (a fresh account, or an
  // existing one from before Week 9) → the one-time permission screen. Writing
  // `notificationPreferences` — granted OR skipped — is what retires this gate.
  if (profile.notificationPreferences === undefined) {
    return <NotificationPermissionScreen />
  }

  return <AppStack />
}

/**
 * The "we don't know yet" screen.
 *
 * Normally just the page ground rather than a spinner: <BrandSplash> is usually
 * still fading over the top of it on a cold start, and on a resume the wait is
 * measured in frames. A spinner would flash.
 *
 * `stalled` is the one case that needs words. It means we asked Firestore, the
 * read failed, and there is no cached profile to fall back on — a first launch
 * on a phone with no connectivity. The store is retrying with backoff and the
 * screen will resolve itself, but "silently blank for thirty seconds" is
 * indistinguishable from a hang, and the temptation when an app looks hung is to
 * reinstall it. So after the first failure this says what is happening.
 *
 * What it deliberately does NOT do is offer a way out into the app. There is no
 * profile; there is nothing to show. Waiting is the correct behaviour, and the
 * whole point of this rewrite is that the alternative — guessing "new user" and
 * opening the onboarding wizard — is how an existing athlete's account got
 * overwritten.
 */
function GateSplash({ stalled = false }: { stalled?: boolean }) {
  const refreshProfile = useAuthStore((s) => s.refreshProfile)

  if (!stalled) return <View style={{ flex: 1, backgroundColor: COLORS.pageBg }} />

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.pageBg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
      }}
    >
      <ActivityIndicator color={COLORS.teal} />
      <Text
        style={{
          marginTop: SPACING.base,
          fontSize: TYPE.subtitle,
          fontWeight: WEIGHT.bold,
          color: COLORS.ink,
          textAlign: 'center',
        }}
      >
        Loading your profile
      </Text>
      <Text
        style={{
          marginTop: SPACING.sm,
          fontSize: TYPE.body,
          color: COLORS.muted,
          textAlign: 'center',
          lineHeight: 20,
        }}
      >
        FORMA can&apos;t reach the network right now. You&apos;re still signed in — this will
        finish on its own once you&apos;re back online.
      </Text>
      <Pressable
        onPress={() => void refreshProfile()}
        accessibilityRole="button"
        style={{
          marginTop: SPACING.lg,
          minHeight: MIN_TOUCH,
          justifyContent: 'center',
          paddingHorizontal: SPACING.lg,
          borderRadius: RADIUS.pill,
          borderWidth: 1,
          borderColor: COLORS.teal,
        }}
      >
        <Text style={{ fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: COLORS.teal }}>
          Try now
        </Text>
      </Pressable>
    </View>
  )
}
