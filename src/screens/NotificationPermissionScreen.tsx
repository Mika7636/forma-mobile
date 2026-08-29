// One-time notification permission ask, shown immediately after onboarding.
//
// Deliberately NOT a step inside OnboardingScreen: that flow's step indices and
// its "You're all set!" → setProfile handoff are load-bearing, and the OS
// permission dialog is an interruption we don't want mid-wizard. Instead
// RootNavigator renders this whenever a logged-in, onboarded user has no
// `notificationPreferences` yet — which also means existing accounts get asked
// exactly once, rather than the feature being invisible to them.
import { useState } from 'react'
import { Linking, Platform, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import * as Device from 'expo-device'
import { haptics } from '../utils/haptics'
import Animated, { FadeInDown } from 'react-native-reanimated'
import PrimaryButton from '../components/ui/PrimaryButton'
import { requestPermissions } from '../services/notificationService'
import { updateUserProfile } from '../services/userService'
import { useAuthStore } from '../store/authStore'
import {
  DEFAULT_NOTIFICATION_PREFERENCES,
  DISABLED_NOTIFICATION_PREFERENCES,
} from '../types/notifications'
import { useTheme } from '../theme/ThemeProvider'

const PERKS = [
  {
    icon: '⏰',
    title: 'Training reminders',
    body: 'A nudge at your chosen time — never a spam cannon.',
  },
  {
    icon: '⚠️',
    title: 'Conflict warnings',
    body: 'Know before you train when a session risks injury.',
  },
  {
    icon: '🔥',
    title: 'Streak celebrations',
    body: 'We shout when you hit 3, 7, 14 and 30 days in a row.',
  },
  {
    icon: '📊',
    title: 'Weekly review',
    body: 'A Sunday-evening summary of what you actually did.',
  },
]

export default function NotificationPermissionScreen() {
  const { colors } = useTheme()

  const user = useAuthStore((s) => s.user)
  const profile = useAuthStore((s) => s.profile)
  const setProfile = useAuthStore((s) => s.setProfile)

  const [busy, setBusy] = useState(false)
  const [denied, setDenied] = useState(false)

  /**
   * Record the choice and let RootNavigator fall through to the app.
   *
   * The in-memory commit goes FIRST and the Firestore write is deliberately not
   * awaited. `setDoc` only settles once the server acks (this project runs
   * Firestore with `memoryLocalCache`, so there's no offline queue to resolve
   * against), and on a flaky emulator connection that await can hang — which
   * would strand the user on this screen with no way forward. Persistence is
   * best-effort; Settings can re-save later.
   */
  const commit = (enabled: boolean) => {
    const prefs = enabled
      ? DEFAULT_NOTIFICATION_PREFERENCES
      : DISABLED_NOTIFICATION_PREFERENCES
    if (!user || !profile) return
    setProfile({ ...profile, notificationPreferences: prefs })
    void updateUserProfile(user.uid, { notificationPreferences: prefs }).catch(() => {})
  }

  const handleEnable = async () => {
    if (busy) return
    setBusy(true)
    try {
      const granted = await requestPermissions()
      if (granted) {
        haptics.success()
        setDenied(false)
        commit(true)
        return
      }
      // Denied at the OS level — keep prefs off and offer the settings escape
      // hatch. The user can still skip; Settings can enable it later.
      haptics.warning()
      setDenied(true)
    } catch {
      setDenied(true)
    } finally {
      // Always clear, including the success path: if `commit` can't unmount this
      // screen for any reason, leaving `busy` true would dead-end every
      // subsequent tap.
      setBusy(false)
    }
  }

  const handleSkip = () => {
    if (busy) return
    haptics.light()
    commit(false)
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top', 'bottom']}>
      <ThemedStatusBar />
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, padding: 24, justifyContent: 'center' }}
        showsVerticalScrollIndicator={false}
      >
        <Animated.View entering={FadeInDown.duration(280)}>
          <View
            style={{
              alignSelf: 'center',
              width: 96,
              height: 96,
              borderRadius: 48,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 46 }}>🔔</Text>
          </View>

          <Text
            style={{
              marginTop: 22,
              fontSize: 27,
              fontWeight: '800',
              color: colors.text,
              textAlign: 'center',
            }}
          >
            Stay on track with reminders
          </Text>
          <Text
            style={{
              marginTop: 10,
              fontSize: 16,
              lineHeight: 22,
              color: colors.textMuted,
              textAlign: 'center',
            }}
          >
            FORMA can remind you to train, warn you about conflicts, and celebrate your
            streaks.
          </Text>

          <View style={{ marginTop: 26 }}>
            {PERKS.map((perk) => (
              <View
                key={perk.title}
                style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16 }}
              >
                <View
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 12,
                    backgroundColor: colors.fieldBg,
                    borderWidth: 1,
                    borderColor: colors.border,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginRight: 13,
                  }}
                >
                  <Text style={{ fontSize: 20 }}>{perk.icon}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: colors.text }}>
                    {perk.title}
                  </Text>
                  <Text
                    style={{ marginTop: 2, fontSize: 14, lineHeight: 19, color: colors.textMuted }}
                  >
                    {perk.body}
                  </Text>
                </View>
              </View>
            ))}
          </View>

          {denied ? (
            <Animated.View
              entering={FadeInDown.duration(200)}
              style={{
                backgroundColor: colors.warnSoft,
                borderRadius: 14,
                borderWidth: 1,
                borderColor: colors.warnBorder,
                padding: 14,
                marginBottom: 16,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: colors.warnText }}>
                Notifications are blocked
              </Text>
              <Text
                style={{ marginTop: 4, fontSize: 13, lineHeight: 19, color: colors.textBody }}
              >
                Android won&apos;t ask again once dismissed. You can turn them on in system
                settings — or skip for now and enable them later from Settings.
              </Text>
              <Pressable
                onPress={() => void Linking.openSettings()}
                style={{
                  marginTop: 12,
                  height: 44,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surface,
                  borderWidth: 1.5,
                  borderColor: colors.warnBorder,
                }}
              >
                <Text style={{ fontSize: 15, fontWeight: '700', color: colors.warnText }}>
                  Open System Settings
                </Text>
              </Pressable>
            </Animated.View>
          ) : null}

          <PrimaryButton
            label={denied ? 'Try Again' : 'Enable Notifications'}
            onPress={handleEnable}
            loading={busy && !denied}
          />

          <Pressable
            onPress={handleSkip}
            disabled={busy}
            style={{ alignSelf: 'center', marginTop: 16, padding: 8 }}
          >
            <Text style={{ fontSize: 15, fontWeight: '700', color: colors.textMuted }}>
              Maybe later
            </Text>
          </Pressable>

          {/*
            Local notifications work on emulators, so this is a heads-up about
            muted system sound, not a blocker — the demo still fires.
          */}
          {!Device.isDevice && Platform.OS === 'android' ? (
            <Text
              style={{
                marginTop: 14,
                fontSize: 12,
                color: colors.textSubtle,
                textAlign: 'center',
              }}
            >
              Emulator detected — notifications still fire, but check the system
              notification settings if you don&apos;t see them.
            </Text>
          ) : null}
        </Animated.View>
      </ScrollView>
    </SafeAreaView>
  )
}
