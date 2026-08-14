import { useCallback, useEffect, useState } from 'react'
import { View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import BrandSplash from '../components/ui/BrandSplash'
import { COLORS } from '../constants/theme'
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
  // a frame containing it. Both draw the same mark on the same white at the same
  // size, so there's nothing to see at the seam — and because the JS overlay is
  // already on screen, hiding the native one can't expose a blank frame.
  const handleLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: COLORS.white }} onLayout={handleLayout}>
      {loading ? (
        // Nothing is decided yet — deliberately render no navigator at all
        // rather than mounting AuthStack and swapping it out a frame later.
        <View style={{ flex: 1, backgroundColor: COLORS.white }} />
      ) : (
        <RootContent user={user} profile={profile} />
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

/** The auth/onboarding/app gate, split out so the splash overlay above stays readable. */
function RootContent({
  user,
  profile,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user']
  profile: ReturnType<typeof useAuthStore.getState>['profile']
}) {
  if (!user) return <AuthStack />

  // Logged in but hasn't finished onboarding (or the profile couldn't load) →
  // run the setup wizard before granting access to the app.
  if (!profile || !profile.onboardingCompleted) return <OnboardingScreen />

  // Onboarded but never asked about notifications (a fresh account, or an
  // existing one from before Week 9) → the one-time permission screen. Writing
  // `notificationPreferences` — granted OR skipped — is what retires this gate.
  if (profile.notificationPreferences === undefined) {
    return <NotificationPermissionScreen />
  }

  return <AppStack />
}
