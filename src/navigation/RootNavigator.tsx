// Picks auth, onboarding or app from session and profile state.

import { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import * as SplashScreen from 'expo-splash-screen'
import BrandSplash from '../components/ui/BrandSplash'
import { useNotificationSync } from '../hooks/useNotificationSync'
import NotificationPermissionScreen from '../screens/NotificationPermissionScreen'
import OnboardingScreen from '../screens/OnboardingScreen'
import { useAuthStore } from '../store/authStore'
import AppStack from './AppStack'
import AuthStack from './AuthStack'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'

export default function RootNavigator() {
  const { colors } = useTheme()

  const initialize = useAuthStore((s) => s.initialize)
  const loading = useAuthStore((s) => s.loading)
  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const profileStatus = useAuthStore((s) => s.profileStatus)

  const [splashFinished, setSplashFinished] = useState(false)

  useEffect(() => {
    const unsubscribe = initialize()
    return unsubscribe
  }, [initialize])

  useNotificationSync()

  const handleLayout = useCallback(() => {
    SplashScreen.hideAsync().catch(() => {})
  }, [])

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }} onLayout={handleLayout}>
      {loading ? (
        <View style={{ flex: 1, backgroundColor: colors.bg }} />
      ) : (
        <RootContent user={user} profile={profile} profileStatus={profileStatus} />
      )}

      {splashFinished ? null : (
        <BrandSplash ready={!loading} onFinished={() => setSplashFinished(true)} />
      )}
    </View>
  )
}

function RootContent({
  user,
  profile,
  profileStatus,
}: {
  user: ReturnType<typeof useAuthStore.getState>['user']
  profile: ReturnType<typeof useAuthStore.getState>['profile']
  profileStatus: ReturnType<typeof useAuthStore.getState>['profileStatus']
}) {
  if (!user) return <AuthStack />

  if (!profile) {
    if (profileStatus === 'missing') return <OnboardingScreen />
    return <GateSplash stalled={profileStatus === 'error'} />
  }

  if (!profile.onboardingCompleted) return <OnboardingScreen />

  if (profile.notificationPreferences === undefined) {
    return <NotificationPermissionScreen />
  }

  return <AppStack />
}

function GateSplash({ stalled = false }: { stalled?: boolean }) {
  const { colors } = useTheme()

  const refreshProfile = useAuthStore((s) => s.refreshProfile)

  if (!stalled) return <View style={{ flex: 1, backgroundColor: colors.bg }} />

  return (
    <View
      style={{
        flex: 1,
        backgroundColor: colors.bg,
        alignItems: 'center',
        justifyContent: 'center',
        padding: SPACING.xl,
      }}
    >
      <ActivityIndicator color={colors.accent} />
      <Text
        style={{
          marginTop: SPACING.base,
          fontSize: TYPE.subtitle,
          fontWeight: WEIGHT.bold,
          color: colors.text,
          textAlign: 'center',
        }}
      >
        Loading your profile
      </Text>
      <Text
        style={{
          marginTop: SPACING.sm,
          fontSize: TYPE.body,
          color: colors.textMuted,
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
          borderColor: colors.accent,
        }}
      >
        <Text style={{ fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: colors.accentText }}>
          Try now
        </Text>
      </Pressable>
    </View>
  )
}
