import { Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import PrimaryButton from '../ui/PrimaryButton'
import { COLORS } from '../../constants/theme'

interface EmptyDashboardStateProps {
  onLogSession: () => void
}

/**
 * Shown to a user with no logged sessions. There are no metrics to render yet,
 * so the screen's whole job is to get them to their first workout.
 */
export default function EmptyDashboardState({ onLogSession }: EmptyDashboardStateProps) {
  return (
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
        <Text style={{ fontSize: 40 }}>🏃</Text>
      </View>

      <Text style={{ marginTop: 18, fontSize: 22, fontWeight: '800', color: COLORS.ink }}>
        Welcome to FORMA!
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
        Log your first workout to see your training insights — form, load,
        calories and recovery, all in one place.
      </Text>

      <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
        <PrimaryButton label="Log a Session" onPress={onLogSession} />
      </View>
    </Animated.View>
  )
}
