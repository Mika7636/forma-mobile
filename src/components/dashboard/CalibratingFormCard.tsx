import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import FormInfoModal from './FormInfoModal'
import { baselineMeters, type BaselineState } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface CalibratingFormCardProps {
  baseline: BaselineState
  /** Opens the Log tab — the only thing that moves this card forward. */
  onLogSession: () => void
}

/**
 * The dashboard hero for an account that has not yet cleared the baseline gate.
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
 * So the readouts are not shown at all until the gate opens. What replaces them
 * is not an empty state: it is a progress state that says exactly where the
 * athlete is, and what makes it move. Which of the gate's two conditions gets
 * the headline is `baselineMeters`' call, not this card's — whichever is
 * further behind is the one the reader needs, and a card that always said
 * "days" would promise a Form Score on a date it is not coming.
 *
 * ## Why it is one flat card
 *
 * It was a tinted gradient — teal wash into `surface` — and on light that read
 * as two mismatched panels fused down the middle rather than as one object,
 * with the pill, the numeral and the bar each reaching for a slightly different
 * green. Now: one surface, one border, one shadow, and exactly one accent tone
 * on it. Nothing else here is coloured, because nothing else here is data.
 *
 * The explanation of *why* the score is withheld lives behind the ℹ️, not on
 * the card. A paragraph of hedging under a progress bar is the thing a reader
 * skips, and it was crowding out the one control that moves the bar.
 */
export default function CalibratingFormCard({
  baseline,
  onLogSession,
}: CalibratingFormCardProps) {
  const { colors } = useTheme()

  const [infoOpen, setInfoOpen] = useState(false)
  const { sessionsLogged } = baseline
  const { headline, secondary } = baselineMeters(baseline)

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
          backgroundColor: colors.surface,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 22,
          // The palette's own elevation rather than a hardcoded black at 45%,
          // which on a light page is a smudge rather than a lift.
          ...colors.shadowCard,
        },
        cardStyle,
      ]}
    >
      {/* Info affordance, top-right. It carries the full explanation of what
          the Form Score is and why it is being held back — see FormInfoModal's
          `building` branch. */}
      <Pressable
        onPress={() => setInfoOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="What is the Form Score?"
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}
      >
        <Text style={{ fontSize: 18 }}>ℹ️</Text>
      </Pressable>

      {/* The one accent tone on this card: the brand green at low alpha, with
          the type-safe variant of the same hue as its label. */}
      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: colors.accentSoft,
          borderRadius: RADIUS.pill,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.accentText }}
        >
          Building your baseline
        </Text>
      </View>

      {/* The figure this card *can* stand behind: how far in you are. It takes
          the hero slot the Form Score will take once it is real, so the card
          doesn't change shape when the gate opens. */}
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 14 }}>
        <Text
          style={{
            fontSize: 40,
            fontWeight: WEIGHT.heavy,
            // `accentText`, not `accent`: same green, but `accent` is 1.85:1 on
            // a white card — below the 3:1 floor even at this size.
            color: colors.accentText,
            lineHeight: 46,
          }}
        >
          {headline.value}
        </Text>
        <Text
          style={{
            marginLeft: 6,
            fontSize: TYPE.subtitle,
            fontWeight: WEIGHT.bold,
            color: colors.textMuted,
          }}
        >
          of {headline.target} {headline.noun}
        </Text>
      </View>

      <View
        style={{
          height: 8,
          marginTop: SPACING.md,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${headline.fraction * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>

      {/* The condition that is *not* the headline, plus the raw count. Both
          have to close before a Form Score appears, so hiding the other one
          would set up the same false expectation the single-condition gate did.
          Once it *has* closed it drops off rather than reading "0 days to go",
          which looks like a bug beside a bar that is still filling. */}
      <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.micro, color: colors.textMuted }}>
        {sessionsLogged} session{sessionsLogged === 1 ? '' : 's'} logged
        {secondary.remaining > 0
          ? ` · ${secondary.remaining} ${pluralNoun(secondary.noun, secondary.remaining)} to go`
          : ''}
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
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.text }}>
          Log a session
        </Text>
      </Pressable>

      <FormInfoModal building visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Animated.View>
  )
}

/** `days` → `day` for a count of one; `training days` → `training day`. */
function pluralNoun(noun: string, count: number): string {
  return count === 1 ? noun.replace(/s$/, '') : noun
}
