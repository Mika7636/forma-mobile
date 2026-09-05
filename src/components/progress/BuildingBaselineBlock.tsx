// The Advanced expander's contents while the baseline gate is still closed.
//
// Fitness, Fatigue and Form are three exponentially-weighted averages, and
// until 42 days of training have gone into them a chart of them is mostly a
// picture of those averages charging up from their seeds. Drawing it would put a confident line
// on screen that says more about the maths than about the athlete — and it is
// the same line the Dashboard hero refuses to reduce to a Form Score, so
// showing it here would let one screen contradict the other.
//
// It shows where the gate has got to instead, from the same `getBaselineState`
// the Dashboard reads, so the two screens never quote different numbers at each
// other.
import { Text, View } from 'react-native'
import { type BaselineState } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function BuildingBaselineBlock({ baseline }: { baseline: BaselineState }) {
  const { colors } = useTheme()

  const { daysCovered, target, fraction, sessionsLogged } = baseline

  return (
    <View>
      <Text style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}>
        Building your baseline
      </Text>
      <Text
        style={{ marginTop: 6, fontSize: TYPE.small, lineHeight: 19, color: colors.textMuted }}
      >
        Fitness is a rolling 42-day average, so it needs 42 days you actually trained
        before its difference from Fatigue tracks you rather than the maths. Rest days
        don&apos;t move it. Until then FORMA holds the chart back instead of drawing a
        confident line through an average that is still filling.
      </Text>

      <Text
        style={{
          marginTop: SPACING.base,
          marginBottom: SPACING.sm,
          fontSize: TYPE.small,
          fontWeight: WEIGHT.bold,
          color: colors.textBody,
        }}
      >
        {daysCovered} of {target} training days
      </Text>
      <View
        style={{
          height: 8,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>
      {/* The raw count beneath the clock, matching the Dashboard hero's caption. */}
      <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.micro, color: colors.textMuted }}>
        {sessionsLogged} session{sessionsLogged === 1 ? '' : 's'} logged
      </Text>
    </View>
  )
}
