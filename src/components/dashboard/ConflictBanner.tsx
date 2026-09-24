// Dashboard banner for unresolved training conflicts.

import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { severityStyle } from '../../constants/conflictColors'
import { detectedAtDate } from '../../utils/conflictInfo'
import { formatTimeAgo } from '../../utils/formatting'
import type { Conflict } from '../../types/conflict'
import { RADIUS } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'
interface ConflictBannerProps {
  conflict: Conflict
  extraCount: number
  onDismiss: (id: string) => void
  onShowMore?: () => void
  onPress?: (conflict: Conflict) => void
}

export default function ConflictBanner({
  conflict,
  extraCount,
  onDismiss,
  onShowMore,
  onPress,
}: ConflictBannerProps) {
  const { colors } = useTheme()

  const style = severityStyle(conflict.severity, colors)

  const handleDismiss = () => {
    haptics.light()
    onDismiss(conflict.conflictId)
  }

  return (
    <Animated.View
      entering={FadeInDown.springify().damping(15).stiffness(140)}
      exiting={FadeOutUp.duration(220)}
      accessibilityRole="alert"
      style={{
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        backgroundColor: style.softBg,
        borderWidth: 1,
        borderColor: style.softBorder,
        borderLeftWidth: 3,
        borderLeftColor: style.solid,
        ...colors.shadowCard,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
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
              borderRadius: RADIUS.pill,
              backgroundColor: style.softBg,
              borderWidth: 1,
              borderColor: style.solid,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 12,
            }}
          >
            <Text style={{ fontSize: 20 }}>{style.icon}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: '800', color: style.deep }}>{style.title}</Text>
            <Text
              style={{ marginTop: 2, fontSize: 13, lineHeight: 17, color: colors.text }}
              numberOfLines={3}
            >
              {conflict.message}
            </Text>

            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textMuted }}>
                {formatTimeAgo(detectedAtDate(conflict).toISOString())}
              </Text>
              {extraCount > 0 ? (
                <Pressable onPress={onShowMore} hitSlop={8} style={{ marginLeft: 10 }}>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '800',
                      color: style.deep,
                      textDecorationLine: 'underline',
                    }}
                  >
                    +{extraCount} more
                  </Text>
                </Pressable>
              ) : (
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.textSubtle, marginLeft: 10 }}>
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
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: style.solid,
            borderRadius: 999,
            paddingHorizontal: 14,
            paddingVertical: 8,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: style.deep }}>Dismiss</Text>
        </Pressable>
      </View>
    </Animated.View>
  )
}
