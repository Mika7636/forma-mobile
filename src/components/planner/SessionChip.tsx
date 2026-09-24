// A logged session inside a planner day card.

import { Alert, Pressable, Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { severityStyle, type ConflictSeverity } from '../../constants/conflictColors'
import { formatDistanceKm } from '../../utils/formatting'
import { sportVisual } from '../../utils/sportMeta'
import type { Session } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'
import { onColor } from '../../theme/tokens'

const ACTION_WIDTH = 92
const REVEAL_AT = 34
const AUTO_DELETE_AT = 190
const MAX_DRAG = 240

interface SessionChipProps {
  session: Session
  conflictSeverity?: ConflictSeverity
  showTime?: boolean
  onPress: (session: Session) => void
  onDelete: (session: Session) => Promise<void>
}

function metaLine(session: Session, showTime: boolean): string {
  const parts: string[] = []
  if (showTime) {
    parts.push(
      new Date(session.date).toLocaleTimeString(undefined, {
        hour: 'numeric',
        minute: '2-digit',
      }),
    )
  }
  parts.push(`${session.durationMinutes} min`, `RPE ${session.rpe}`)
  if (session.estimatedCalories != null) parts.push(`${session.estimatedCalories} kcal`)
  if (session.distanceKm != null) parts.push(formatDistanceKm(session.distanceKm))
  return parts.join(' · ')
}

export default function SessionChip({
  session,
  conflictSeverity,
  showTime = false,
  onPress,
  onDelete,
}: SessionChipProps) {
  const { colors } = useTheme()

  const { color, icon, label } = sportVisual(session.sport, colors)
  const conflicted = conflictSeverity != null
  const conflictStyle = conflicted ? severityStyle(conflictSeverity, colors) : null

  const translateX = useSharedValue(0)
  const startX = useSharedValue(0)
  const buzzed = useSharedValue(false)

  const revealHaptic = () => haptics.medium()

  const close = () => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
  }

  const confirmDelete = () => {
    Alert.alert(
      'Delete Session?',
      `This will permanently remove this ${label} session. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: close },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            haptics.warning()
            try {
              await onDelete(session)
              translateX.value = withTiming(-MAX_DRAG, { duration: 160 })
            } catch {
              haptics.error()
              close()
            }
          },
        },
      ],
    )
  }

  const handlePress = () => {
    if (translateX.value < -4) {
      close()
      return
    }
    haptics.light()
    onPress(session)
  }

  const pan = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      startX.value = translateX.value
      buzzed.value = translateX.value < -REVEAL_AT
    })
    .onUpdate((e) => {
      const next = Math.min(0, Math.max(startX.value + e.translationX, -MAX_DRAG))
      translateX.value = next
      if (!buzzed.value && next < -REVEAL_AT) {
        buzzed.value = true
        runOnJS(revealHaptic)()
      } else if (buzzed.value && next > -REVEAL_AT) {
        buzzed.value = false
      }
    })
    .onEnd(() => {
      if (translateX.value <= -AUTO_DELETE_AT) {
        runOnJS(confirmDelete)()
      } else if (translateX.value <= -ACTION_WIDTH / 2) {
        translateX.value = withSpring(-ACTION_WIDTH, { damping: 18, stiffness: 220 })
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
      }
    })

  const tap = Gesture.Tap().maxDuration(320).onEnd((_e, success) => {
    if (success) runOnJS(handlePress)()
  })

  const gesture = Gesture.Exclusive(pan, tap)

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [0, REVEAL_AT], [0, 1], 'clamp'),
  }))

  return (
    <View style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden' }}>
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: ACTION_WIDTH + 16,
            backgroundColor: colors.danger,
            borderRadius: 12,
            paddingRight: 8,
          },
          actionStyle,
        ]}
      >
        <Pressable
          onPress={confirmDelete}
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
        >
          <Text style={{ fontSize: 18 }}>🗑️</Text>
          <Text style={{ color: onColor(colors.danger), fontSize: 12, fontWeight: '800', marginTop: 2 }}>
            Delete
          </Text>
        </Pressable>
      </Animated.View>

      <GestureDetector gesture={gesture}>
        <Animated.View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.surface,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: conflictStyle ? conflictStyle.softBorder : colors.border,
              shadowColor: colors.shadow,
              shadowOpacity: 0.06,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
              overflow: 'hidden',
            },
            rowStyle,
          ]}
        >
          <View
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 0,
              width: 4,
              backgroundColor: color,
            }}
          />

          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 17,
              backgroundColor: `${color}1F`,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: 4,
              marginRight: 10,
            }}
          >
            <Text style={{ fontSize: 17 }}>{icon}</Text>
          </View>

          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text
                style={{ fontSize: 14, fontWeight: '700', color: colors.text }}
                numberOfLines={1}
              >
                {label}
              </Text>
              {session.trackingMode === 'live' ? (
                <Text style={{ fontSize: 11, marginLeft: 5 }} accessibilityLabel="GPS tracked">
                  📍
                </Text>
              ) : null}
              {conflictStyle ? (
                <Text style={{ fontSize: 11, marginLeft: 5 }} accessibilityLabel="Has a conflict">
                  {conflictStyle.icon}
                </Text>
              ) : null}
            </View>
            <Text style={{ marginTop: 2, fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
              {metaLine(session, showTime)}
            </Text>
          </View>

          <Text style={{ fontSize: 14, fontWeight: '800', color: colors.text, marginLeft: 8 }}>
            {session.loadScore} AU
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
