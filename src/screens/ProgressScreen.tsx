import { useCallback } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Animated, { FadeIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import PrimaryButton from '../components/ui/PrimaryButton'
import ScreenPlaceholder from '../components/ui/ScreenPlaceholder'
import { COLORS } from '../constants/theme'
import { useSessionHistory } from '../hooks/useSessionHistory'
import { PROGRESS_UNLOCK_SESSIONS } from '../utils/calibration'
import type { ProgressScreenProps } from '../navigation/types'

export default function ProgressScreen({ navigation }: ProgressScreenProps) {
  const { sessions, loading } = useSessionHistory()

  const goToLog = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    navigation.navigate('Log')
  }, [navigation])

  if (loading) {
    return (
      <SafeAreaView
        style={{
          flex: 1,
          backgroundColor: COLORS.fieldBg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
        edges={['top']}
      >
        <ActivityIndicator color={COLORS.teal} />
      </SafeAreaView>
    )
  }

  // Sparse data makes trend charts misleading, so gate them until there's enough
  // history to say something honest.
  if (sessions.length < PROGRESS_UNLOCK_SESSIONS) {
    return (
      <ProgressLockedGuard logged={sessions.length} onLogSession={goToLog} />
    )
  }

  // Charts themselves land later; for now the unlocked state is the existing
  // "coming soon" placeholder.
  return <ScreenPlaceholder title="Progress" subtitle="Trends & history arrive in Week 2." />
}

function ProgressLockedGuard({
  logged,
  onLogSession,
}: {
  logged: number
  onLogSession: () => void
}) {
  const target = PROGRESS_UNLOCK_SESSIONS
  const fraction = Math.max(0, Math.min(logged / target, 1))

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.fieldBg }} edges={['top']}>
      <View style={{ flex: 1, justifyContent: 'center', padding: 20 }}>
        <Animated.View
          entering={FadeIn.duration(300)}
          style={{
            alignItems: 'center',
            backgroundColor: COLORS.white,
            borderRadius: 24,
            borderWidth: 1,
            borderColor: COLORS.border,
            paddingVertical: 40,
            paddingHorizontal: 24,
          }}
        >
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: COLORS.tealSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text style={{ fontSize: 40 }}>📈</Text>
          </View>

          <Text style={{ marginTop: 18, fontSize: 22, fontWeight: '800', color: COLORS.ink }}>
            Keep logging!
          </Text>
          <Text
            style={{
              marginTop: 8,
              fontSize: 14,
              lineHeight: 20,
              color: COLORS.muted,
              textAlign: 'center',
              maxWidth: 280,
            }}
          >
            Progress charts unlock after {target} sessions, once there&apos;s enough history
            to show a meaningful trend.
          </Text>

          {/* Linear unlock meter. */}
          <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: COLORS.body,
                textAlign: 'center',
                marginBottom: 8,
              }}
            >
              {logged} of {target} sessions
            </Text>
            <View
              style={{
                height: 8,
                borderRadius: 999,
                backgroundColor: COLORS.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${fraction * 100}%`,
                  height: '100%',
                  borderRadius: 999,
                  backgroundColor: COLORS.teal,
                }}
              />
            </View>
          </View>

          <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
            <PrimaryButton label="Log a Session" onPress={onLogSession} />
          </View>
        </Animated.View>
      </View>
    </SafeAreaView>
  )
}
