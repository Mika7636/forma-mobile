import { Alert, Pressable, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Haptics from 'expo-haptics'
import { COLORS } from '../constants/theme'
import { useAuthStore } from '../store/authStore'

export default function SettingsScreen() {
  const profile = useAuthStore((s) => s.profile)
  const user = useAuthStore((s) => s.user)
  const signOut = useAuthStore((s) => s.signOut)

  const displayName = profile?.displayName ?? user?.displayName ?? 'Athlete'
  const email = profile?.email ?? user?.email ?? ''
  const initial = displayName.trim().charAt(0).toUpperCase() || '?'

  const handleLogout = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: () => {
          // RootNavigator swaps to the login screen once the user clears.
          void signOut()
        },
      },
    ])
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.white }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ flexGrow: 1, paddingHorizontal: 24, paddingTop: 12 }}
      >
        <Text
          style={{ fontSize: 30, fontWeight: '800', color: COLORS.ink, marginBottom: 24 }}
        >
          Settings
        </Text>

        {/* Profile card */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: COLORS.fieldBg,
            borderRadius: 16,
            padding: 18,
            marginBottom: 24,
          }}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              backgroundColor: COLORS.teal,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 16,
            }}
          >
            <Text style={{ color: COLORS.white, fontSize: 24, fontWeight: '800' }}>
              {initial}
            </Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: COLORS.ink }}>
              {displayName}
            </Text>
            {email ? (
              <Text style={{ fontSize: 14, color: COLORS.muted, marginTop: 2 }}>
                {email}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={{ flex: 1 }} />

        <Pressable
          onPress={handleLogout}
          // Not a style function: NativeWind's interop never calls it, which
          // would leave this button entirely unstyled.
          style={{
            height: 54,
            borderRadius: 12,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 1.5,
            borderColor: COLORS.danger,
            backgroundColor: COLORS.white,
            marginBottom: 24,
          }}
        >
          <Text style={{ color: COLORS.danger, fontSize: 16, fontWeight: '700' }}>
            Log Out
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}
