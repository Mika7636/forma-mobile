import { useEffect } from 'react'
import { ActivityIndicator, View } from 'react-native'
import FormaLogo from '../components/ui/FormaLogo'
import { COLORS } from '../constants/theme'
import { useNotificationSync } from '../hooks/useNotificationSync'
import NotificationPermissionScreen from '../screens/NotificationPermissionScreen'
import OnboardingScreen from '../screens/OnboardingScreen'
import { useAuthStore } from '../store/authStore'
import AppStack from './AppStack'
import AuthStack from './AuthStack'

/** Centered FORMA splash shown while the persisted session is restoring. */
function SplashScreen() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: COLORS.white,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <FormaLogo />
      <ActivityIndicator color={COLORS.teal} style={{ marginTop: 24 }} />
    </View>
  )
}

export default function RootNavigator() {
  const initialize = useAuthStore((s) => s.initialize)
  const loading = useAuthStore((s) => s.loading)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)

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

  if (loading) return <SplashScreen />

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
