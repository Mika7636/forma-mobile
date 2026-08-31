// The Advanced expander's contents while the baseline window is still filling.
//
// Fitness, Fatigue and Form are three exponentially-weighted averages, and for
// the first fortnight a chart of them is mostly a picture of those averages
// charging up from their seeds. Drawing it would put a confident line on screen
// that says more about the maths than about the athlete — and it is the same
// line the Dashboard hero refuses to reduce to a Form Score, so showing it here
// would let one screen contradict the other.
//
// It shows where the window has got to instead, in the same "X of 14 days" the
// Dashboard uses, from the same `getBaselineState`.
import { Text, View } from 'react-native'
import type { BaselineState } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function BuildingBaselineBlock({ baseline }: { baseline: BaselineState }) {
  const { colors } = useTheme()

  const fraction = Math.max(0, Math.min(baseline.daysCovered / baseline.target, 1))

  return (
    <View>
      <Text style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}>
        Building your baseline
      </Text>
      <Text
        style={{ marginTop: 6, fontSize: TYPE.small, lineHeight: 19, color: colors.textMuted }}
      >
        Fitness and Fatigue are rolling averages over 42 and 7 days. Until there are about
        two weeks behind them, their difference — your Form Score — tracks the maths rather
        than your training, so FORMA holds the chart back instead of drawing a confident
        line through almost no data.
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
        {baseline.daysCovered} of {baseline.target} days
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
    </View>
  )
}
