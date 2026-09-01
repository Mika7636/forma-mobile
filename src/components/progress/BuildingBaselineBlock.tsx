// The Advanced expander's contents while the baseline gate is still closed.
//
// Fitness, Fatigue and Form are three exponentially-weighted averages, and
// until there is both time and training behind them a chart of them is mostly a
// picture of those averages charging up from their seeds. Drawing it would put
// a confident line on screen that says more about the maths than about the
// athlete — and it is the same line the Dashboard hero refuses to reduce to a
// Form Score, so showing it here would let one screen contradict the other.
//
// It shows where the gate has got to instead, from the same `getBaselineState`
// the Dashboard reads, and headlines the same one of the two conditions — via
// `baselineMeters` — so the two screens never quote different numbers at each
// other.
import { Text, View } from 'react-native'
import { baselineMeters, type BaselineState } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function BuildingBaselineBlock({ baseline }: { baseline: BaselineState }) {
  const { colors } = useTheme()

  const { headline, secondary } = baselineMeters(baseline)

  return (
    <View>
      <Text style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}>
        Building your baseline
      </Text>
      <Text
        style={{ marginTop: 6, fontSize: TYPE.small, lineHeight: 19, color: colors.textMuted }}
      >
        Fitness and Fatigue are rolling averages over 42 and 7 days. They need both time
        and training days behind them — about two weeks since your first session, and at
        least six separate days you trained — before their difference tracks you rather
        than the maths, so FORMA holds the chart back instead of drawing a confident line
        through almost no data.
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
        {headline.value} of {headline.target} {headline.noun}
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
            width: `${headline.fraction * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>
      {/* The other condition. Both have to close, so quoting only the headline
          would set a date the score is not arriving on. */}
      <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.micro, color: colors.textMuted }}>
        {secondary.value} of {secondary.target} {secondary.noun}
      </Text>
    </View>
  )
}
