import { Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import { severityStyle } from '../../constants/conflictColors'
import { detectedAtDate } from '../../utils/conflictInfo'
import { formatTimeAgo } from '../../utils/formatting'
import type { Conflict } from '../../types/conflict'

interface ConflictBannerProps {
  conflict: Conflict
  /** Count of *other* unresolved conflicts, surfaced as an "N more" hint. */
  extraCount: number
  onDismiss: (id: string) => void
  onShowMore?: () => void
  /** Tapping the banner body (not Dismiss) opens the detail sheet. */
  onPress?: (conflict: Conflict) => void
}

/**
 * FORMA's signature injury-risk warning, shown above the dashboard hero when the
 * conflict engine has flagged unresolved clashes in recent training. Slides down
 * on a spring when it appears and up when dismissed. Severity styling comes from
 * the single source of truth so it matches every other conflict surface.
 */
export default function ConflictBanner({
  conflict,
  extraCount,
  onDismiss,
  onShowMore,
  onPress,
}: ConflictBannerProps) {
  const style = severityStyle(conflict.severity)

  const handleDismiss = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onDismiss(conflict.conflictId)
  }

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15).stiffness(140)}
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
        {/* Body — tapping it opens the full explanation. */}
        <Pressable
          onPress={() => onPress?.(conflict)}
          accessibilityRole="button"
          accessibilityLabel={`${style.title}. ${conflict.message}. Tap for details.`}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}
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
            <Text style={{ fontSize: 14, fontWeight: '800', color: '#FFFFFF' }}>{style.title}</Text>
            <Text
              style={{ marginTop: 2, fontSize: 12.5, lineHeight: 17, color: 'rgba(255,255,255,0.92)' }}
              numberOfLines={3}
            >
              {conflict.message}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: 'rgba(255,255,255,0.7)' }}>
                {formatTimeAgo(detectedAtDate(conflict).toISOString())}
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
                    +{extraCount} more
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ fontSize: 11, fontWeight: '700', color: 'rgba(255,255,255,0.6)', marginLeft: 10 }}>
                  Tap for details
                </Text>
              )}
            </View>
          </View>
        </Pressable>

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
          <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' }}>Dismiss</Text>
        </Pressable>
      </LinearGradient>
    </Animated.View>
  )
}
