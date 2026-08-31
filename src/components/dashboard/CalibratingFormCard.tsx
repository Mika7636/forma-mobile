import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import FormInfoModal from './FormInfoModal'
import type { BaselineState } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface CalibratingFormCardProps {
  baseline: BaselineState
  /** Opens the Log tab — the only thing that moves this card forward. */
  onLogSession: () => void
}

/**
 * The dashboard hero for an account with less than {@link BASELINE_DAYS} of
 * training history.
 *
 * ## Why the numbers are gone
 *
 * This card used to show the Form Score anyway — demoted, labelled "estimated",
 * under a "Building Your Baseline" heading, with CTL and CATL beside it marked
 * CALIBRATING. That was a compromise between two incompatible messages, and the
 * number won: a "+72" set in 40pt type is the thing a reader takes away, and no
 * amount of qualifying caption beside it changes that. On a two-day-old account
 * that figure is an artefact of the CTL/ATL ramp rather than a measurement, and
 * publishing it — hedged or not — spends credibility the app cannot yet afford.
 *
 * So the readouts are not shown at all until the window closes. What replaces
 * them is not an empty state: it is a progress state that says exactly where the
 * athlete is ("6 of 14 days"), what the number will mean when it arrives, and
 * what makes it arrive. The colour is the calm teal used for "in progress"
 * elsewhere, never the alarming red a negative Form would otherwise take.
 */
export default function CalibratingFormCard({
  baseline,
  onLogSession,
}: CalibratingFormCardProps) {
  const { colors } = useTheme()

  const [infoOpen, setInfoOpen] = useState(false)
  const { daysCovered, target, daysRemaining, sessionsLogged } = baseline
  const fraction = Math.max(0, Math.min(daysCovered / target, 1))

  // Settle-in scale, matching FormScoreCard so swapping heroes isn't jarring.
  const scale = useSharedValue(0.96)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })
  }, [scale])
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View
      style={[
        {
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.tint.teal.border,
          shadowColor: colors.shadow,
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        cardStyle,
      ]}
    >
      <LinearGradient
        colors={[colors.tint.teal.bg, colors.surface] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 22 }}
      >
        {/* Info affordance, top-right. It explains what Form *is*, which is the
            question this card most reliably provokes. */}
        <Pressable
          onPress={() => setInfoOpen(true)}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="What is the Form Score?"
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}
        >
          <Text style={{ fontSize: 18 }}>ℹ️</Text>
        </Pressable>

        <Text
          style={{
            fontSize: TYPE.caption,
            fontWeight: WEIGHT.heavy,
            letterSpacing: 1.6,
            color: colors.textMuted,
          }}
        >
          FORM SCORE
        </Text>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            alignSelf: 'flex-start',
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.tint.teal.border,
            borderRadius: RADIUS.pill,
            paddingHorizontal: 14,
            paddingVertical: 6,
            marginTop: SPACING.sm,
          }}
        >
          <Text
            style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.tint.teal.text }}
          >
            Building your baseline
          </Text>
          <Text style={{ fontSize: TYPE.body, marginLeft: 6 }}>🌱</Text>
        </View>

        {/* The figure this card *can* stand behind: how far in you are. It takes
            the hero slot the Form Score will take once it is real, so the card
            doesn't change shape when the window closes. */}
        <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 14 }}>
          <Text
            style={{
              fontSize: 40,
              fontWeight: WEIGHT.heavy,
              color: colors.tint.teal.text,
              lineHeight: 46,
            }}
          >
            {daysCovered}
          </Text>
          <Text
            style={{
              marginLeft: 6,
              fontSize: TYPE.subtitle,
              fontWeight: WEIGHT.bold,
              color: colors.textMuted,
            }}
          >
            of {target} days
          </Text>
        </View>

        <View
          style={{
            height: 8,
            marginTop: SPACING.md,
            borderRadius: RADIUS.pill,
            // The unfilled track. Was a white scrim, which over a deep wash
            // would read as brighter than the fill it is supposed to sit behind.
            backgroundColor: colors.surfaceAlt,
            overflow: 'hidden',
          }}
        >
          <View
            style={{
              width: `${fraction * 100}%`,
              height: '100%',
              borderRadius: RADIUS.pill,
              backgroundColor: colors.tint.teal.text,
            }}
          />
        </View>

        <Text
          style={{
            marginTop: SPACING.md,
            fontSize: TYPE.small,
            fontWeight: WEIGHT.semibold,
            color: colors.textBody,
            lineHeight: 19,
          }}
        >
          Your Form Score compares recent fatigue against long-term fitness — it needs
          about two weeks of sessions before it means anything, so FORMA is holding it
          back rather than showing you a number it can&apos;t stand behind.
        </Text>

        <Text
          style={{
            marginTop: SPACING.sm,
            fontSize: TYPE.micro,
            color: colors.textMuted,
          }}
        >
          {sessionsLogged} session{sessionsLogged === 1 ? '' : 's'} logged ·{' '}
          {daysRemaining} day{daysRemaining === 1 ? '' : 's'} to go
        </Text>

        <Pressable
          onPress={onLogSession}
          accessibilityRole="button"
          style={{
            marginTop: SPACING.base,
            alignSelf: 'flex-start',
            paddingHorizontal: SPACING.base,
            paddingVertical: 10,
            borderRadius: RADIUS.pill,
            backgroundColor: colors.surfaceAlt,
            borderWidth: 1,
            borderColor: colors.tint.teal.border,
          }}
        >
          <Text
            style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.tint.teal.text }}
          >
            Log a session
          </Text>
        </Pressable>
      </LinearGradient>

      <FormInfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Animated.View>
  )
}
