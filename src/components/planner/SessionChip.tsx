// A single session inside a planner day card: tap to open the detail sheet,
// swipe left to reveal (or fling past the threshold to trigger) delete.
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
import * as Haptics from 'expo-haptics'
import { COLORS } from '../../constants/theme'
import { severityStyle, type ConflictSeverity } from '../../constants/conflictColors'
import { SPORT_OPTIONS } from '../../constants/training'
import { SPORT_META } from '../../utils/sportMeta'
import type { Session } from '../../types/session'

/** How far the row rests open once the delete button is revealed. */
const ACTION_WIDTH = 92
/** Drag distance at which the delete button counts as "revealed" (haptic). */
const REVEAL_AT = 34
/** Past this, releasing fires the delete without tapping the button. */
const AUTO_DELETE_AT = 190
/** Hard stop so the row can't be dragged off into space. */
const MAX_DRAG = 240

interface SessionChipProps {
  session: Session
  /** Severity of the worst unresolved conflict naming this session, if any —
   *  tints the chip border and shows a matching icon. Undefined = no conflict. */
  conflictSeverity?: ConflictSeverity
  /** Prefix the meta line with the session's time — used when a day holds more
   *  than one session so their order/spacing is clear at a glance. */
  showTime?: boolean
  onPress: (session: Session) => void
  /** Runs the actual Firestore delete; resolve/reject decides the animation. */
  onDelete: (session: Session) => Promise<void>
}

/**
 * Sport accent + icon. Colours come from {@link SPORT_OPTIONS} (the palette the
 * sport pickers use) and fall back to {@link SPORT_META} for anything unknown.
 */
function sportVisual(session: Session) {
  const option = SPORT_OPTIONS.find((o) => o.value === session.sport)
  const meta = SPORT_META[session.sport]
  return {
    color: option?.accent ?? meta?.color ?? COLORS.muted,
    icon: option?.icon ?? meta?.icon ?? '🏅',
    label: option?.label ?? meta?.label ?? session.sport,
  }
}

/** "2:30 PM · 45 min · RPE 7 · 412 kcal" (time only when requested) */
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
  if (session.distanceKm != null) parts.push(`${session.distanceKm} km`)
  return parts.join(' · ')
}

export default function SessionChip({
  session,
  conflictSeverity,
  showTime = false,
  onPress,
  onDelete,
}: SessionChipProps) {
  const { color, icon, label } = sportVisual(session)
  const conflicted = conflictSeverity != null
  const conflictStyle = conflicted ? severityStyle(conflictSeverity) : null

  const translateX = useSharedValue(0)
  // Drag bookkeeping, kept on the UI thread so the gesture never waits on React.
  const startX = useSharedValue(0)
  const buzzed = useSharedValue(false)

  const revealHaptic = () => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)

  const close = () => {
    translateX.value = withSpring(0, { damping: 18, stiffness: 220 })
  }

  /**
   * Confirm, then delete. The row stays swiped open under the alert so it's
   * obvious which session is about to go; cancelling springs it back.
   */
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
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
            try {
              await onDelete(session)
              // The Firestore listener removes the chip; slide it out so the
              // gap doesn't just pop.
              translateX.value = withTiming(-MAX_DRAG, { duration: 160 })
            } catch {
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
              close()
            }
          },
        },
      ],
    )
  }

  const handlePress = () => {
    // A tap on an open row closes it instead of opening the sheet — standard
    // swipeable-row behaviour.
    if (translateX.value < -4) {
      close()
      return
    }
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    onPress(session)
  }

  const pan = Gesture.Pan()
    // Only claim clearly-horizontal drags: vertical ones belong to the
    // ScrollView, and a slow diagonal belongs to the week-swipe gesture above.
    .activeOffsetX([-10, 10])
    .failOffsetY([-14, 14])
    .onBegin(() => {
      startX.value = translateX.value
      buzzed.value = translateX.value < -REVEAL_AT
    })
    .onUpdate((e) => {
      // Left only, and never past the hard stop.
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
        // Flung far enough — treat it as pressing Delete.
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

  // Pan wins outright: a drag must never also register as a tap.
  const gesture = Gesture.Exclusive(pan, tap)

  const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: translateX.value }] }))

  // The underlay only fades in as the row actually moves, so it never peeks out
  // from behind a resting chip.
  const actionStyle = useAnimatedStyle(() => ({
    opacity: interpolate(-translateX.value, [0, REVEAL_AT], [0, 1], 'clamp'),
  }))

  return (
    // The row clips its own bounds so a swiped chip slides out of view cleanly
    // instead of bleeding across the day card's padding.
    <View style={{ marginBottom: 8, borderRadius: 12, overflow: 'hidden' }}>
      {/* Delete underlay — revealed as the row slides left, and tappable once
          it is (the chip itself covers it at rest, so it can't be hit early). */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            top: 0,
            bottom: 0,
            right: 0,
            width: ACTION_WIDTH + 16,
            backgroundColor: COLORS.danger,
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
          <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800', marginTop: 2 }}>
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
              backgroundColor: COLORS.white,
              borderRadius: 12,
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderWidth: 1,
              borderColor: conflictStyle ? conflictStyle.softBorder : COLORS.border,
              shadowColor: '#000',
              shadowOpacity: 0.06,
              shadowRadius: 6,
              shadowOffset: { width: 0, height: 2 },
              elevation: 2,
              overflow: 'hidden',
            },
            rowStyle,
          ]}
        >
          {/* Sport colour bar */}
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
                style={{ fontSize: 14, fontWeight: '700', color: COLORS.ink }}
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
            <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.muted }} numberOfLines={1}>
              {metaLine(session, showTime)}
            </Text>
          </View>

          <Text style={{ fontSize: 14, fontWeight: '800', color: COLORS.ink, marginLeft: 8 }}>
            {session.loadScore} AU
          </Text>
        </Animated.View>
      </GestureDetector>
    </View>
  )
}
