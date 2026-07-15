import { Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInUp, FadeOutUp } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { formatTimeAgo } from '../../utils/formatting'
import type { Conflict } from '../../types/conflict'

interface ConflictBannerProps {
  conflict: Conflict
  /** Count of *other* unresolved conflicts, surfaced as an "N more" hint. */
  extraCount: number
  onDismiss: (id: string) => void
  onShowMore?: () => void
}

// Visual treatment per severity. Both an icon AND a colour carry the meaning so
// the banner stays legible for colour-blind users.
const SEVERITY = {
  warning: {
    icon: '⚠️',
    title: 'Training Conflict Detected',
    gradient: ['#b45309', '#f59e0b'] as readonly [string, string],
  },
  danger: {
    icon: '🚨',
    title: 'High Injury Risk',
    gradient: ['#7f1d1d', '#dc2626'] as readonly [string, string],
  },
} as const

function detectedAtISO(conflict: Conflict): string {
  const ts = conflict.detectedAt
  if (ts && typeof ts.toDate === 'function') return ts.toDate().toISOString()
  return new Date().toISOString()
}

/**
 * FORMA's signature injury-risk warning, shown above the dashboard hero when the
 * conflict engine has flagged unresolved clashes in recent training.
 */
export default function ConflictBanner({
  conflict,
  extraCount,
  onDismiss,
  onShowMore,
}: ConflictBannerProps) {
  const style = SEVERITY[conflict.severity] ?? SEVERITY.warning

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onDismiss(conflict.conflictId)
  }

  return (
    <Animated.View
      entering={FadeInUp.duration(320)}
      exiting={FadeOutUp.duration(220)}
      accessibilityRole="alert"
      style={{
        borderRadius: 18,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOpacity: 0.2,
        shadowRadius: 12,
        shadowOffset: { width: 0, height: 6 },
        elevation: 6,
      }}
    >
      <LinearGradient
        colors={style.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}
      >
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            backgroundColor: 'rgba(0,0,0,0.18)',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 20 }}>{style.icon}</Text>
        </View>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>
            {style.title}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 12.5,
              lineHeight: 17,
              color: 'rgba(255,255,255,0.92)',
            }}
          >
            {conflict.message}
          </Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>
              {formatTimeAgo(detectedAtISO(conflict))}
            </Text>
            {extraCount > 0 ? (
              <Pressable onPress={onShowMore} hitSlop={8} style={{ marginLeft: 10 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '800',
                    color: '#FFFFFF',
                    textDecorationLine: 'underline',
                  }}
                >
                  {extraCount} more
                </Text>
              </Pressable>
            ) : null}
          </View>
        </View>

        <Pressable
          onPress={handleDismiss}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Dismiss conflict"
          style={{
            marginLeft: 10,
            backgroundColor: 'rgba(255,255,255,0.22)',
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' }}>
            Dismiss
          </Text>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  )
}
