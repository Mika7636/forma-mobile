// Advanced expander contents while the baseline gate is closed.

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
      <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.micro, color: colors.textMuted }}>
        {sessionsLogged} session{sessionsLogged === 1 ? '' : 's'} logged
      </Text>
    </View>
  )
}
