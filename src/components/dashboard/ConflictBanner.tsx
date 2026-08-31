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
      // A tinted surface with a coloured left rail, rather than the solid
      // orange slab this used to be.
      //
      // A saturated fill is how you make something urgent on a white page. On a
      // dark dashboard it is simply the brightest object on screen, and a
      // *warning* that outshines the Form Score has its priorities backwards —
      // it also put white text on amber at 2.1:1. The rail carries the severity
      // colour at full strength where it costs nothing; the surface behind the
      // text stays a deep wash.
      style={{
        borderRadius: RADIUS.lg,
        overflow: 'hidden',
        backgroundColor: style.softBg,
        borderWidth: 1,
        borderColor: style.softBorder,
        // 3px, down from 4. On light the rail now sits against a tinted page
        // rather than a white one and reads heavier at the same width; on dark
        // the difference is invisible.
        borderLeftWidth: 3,
        borderLeftColor: style.solid,
        // The palette's card elevation, not a hardcoded 40% black — which on a
        // light page put a grey bruise under a banner whose whole job is to
        // look like a note, not a hole.
        ...colors.shadowCard,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 14 }}>
        {/* Body — tapping it opens the full explanation. */}
        <Pressable
          onPress={() => onPress?.(conflict)}
          accessibilityRole="button"
          accessibilityLabel={`${style.title}. ${conflict.message}. Tap for details.`}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', minWidth: 0 }}
        >
          {/* The disc is tinted with the severity, not with `surfaceAlt`. A
              page-grey circle inside an amber banner reads as a hole punched in
              it; the hue's own wash makes the icon look seated. */}
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
