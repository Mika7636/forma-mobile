// One empty state, used everywhere.
//
// Dashboard, Planner, Progress and Conflict History had each grown their own
// near-identical version of this card; they're unified here so an empty screen
// always looks like the same app. The shape is deliberate: an emoji in a soft
// teal disc (friendly, not an error icon), a short headline, one sentence of
// context, and — where there's something useful to do — a single CTA. Never a
// dead end.
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import { COLORS, MOTION, RADIUS, SPACING, TYPE } from '../../constants/theme'
import PrimaryButton from './PrimaryButton'

export interface EmptyStateProgress {
  /** How far along the user is, e.g. sessions logged so far. */
  current: number
  /** What unlocks the feature. */
  target: number
  /** Caption above the meter, e.g. "3 of 5 sessions". */
  label: string
}

interface EmptyStateProps {
  emoji: string
  title: string
  message: string
  actionLabel?: string
  onAction?: () => void
  /** Renders a teal unlock meter between the copy and the CTA. */
  progress?: EmptyStateProgress
  /**
   * `quiet` drops the card chrome and shrinks everything — for empty states
   * that are normal rather than notable (an empty past week in the Planner),
   * where a full hero card would over-dramatise "you rested".
   */
  tone?: 'card' | 'quiet'
  style?: StyleProp<ViewStyle>
}

export default function EmptyState({
  emoji,
  title,
  message,
  actionLabel,
  onAction,
  progress,
  tone = 'card',
  style,
}: EmptyStateProps) {
  const quiet = tone === 'quiet'
  const discSize = quiet ? 56 : 84

  return (
    <Animated.View
      entering={FadeIn.duration(MOTION.base)}
      style={[
        {
          alignItems: 'center',
          paddingVertical: quiet ? SPACING.lg : 40,
          paddingHorizontal: SPACING.lg,
        },
        quiet
          ? null
          : {
              backgroundColor: COLORS.white,
              borderRadius: RADIUS.xl,
              borderWidth: 1,
              borderColor: COLORS.border,
            },
        style,
      ]}
    >
      <View
        style={{
          width: discSize,
          height: discSize,
          borderRadius: RADIUS.pill,
          backgroundColor: COLORS.tealSoft,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: quiet ? 26 : 40 }}>{emoji}</Text>
      </View>

      <Text
        style={{
          marginTop: quiet ? SPACING.md : 18,
          fontSize: quiet ? TYPE.subtitle : TYPE.heading,
          fontWeight: '800',
          color: COLORS.ink,
          textAlign: 'center',
        }}
      >
        {title}
      </Text>

      <Text
        style={{
          marginTop: SPACING.sm,
          fontSize: quiet ? TYPE.small : TYPE.body,
          lineHeight: quiet ? 18 : 20,
          color: COLORS.muted,
          textAlign: 'center',
          maxWidth: 280,
        }}
      >
        {message}
      </Text>

      {progress ? (
        <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
          <Text
            style={{
              fontSize: TYPE.small,
              fontWeight: '700',
              color: COLORS.body,
              textAlign: 'center',
              marginBottom: SPACING.sm,
            }}
          >
            {progress.label}
          </Text>
          <View
            style={{
              height: 8,
              borderRadius: RADIUS.pill,
              backgroundColor: COLORS.border,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${Math.max(0, Math.min(progress.current / progress.target, 1)) * 100}%`,
                height: '100%',
                borderRadius: RADIUS.pill,
                backgroundColor: COLORS.teal,
              }}
            />
          </View>
        </View>
      ) : null}

      {actionLabel && onAction ? (
        <View style={{ marginTop: 22, alignSelf: 'stretch' }}>
          <PrimaryButton label={actionLabel} onPress={onAction} />
        </View>
      ) : null}
    </Animated.View>
  )
}
