// "This week", as three plain figures.

import { Text, View } from 'react-native'
import { formatThousands, formatZoneMinutes } from '../../utils/formatting'
import type { WeekSummary } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

interface ThisWeekBlockProps {
  summary: WeekSummary
}

export default function ThisWeekBlock({ summary }: ThisWeekBlockProps) {
  const { colors } = useTheme()

  return (
    <View style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        This week
      </Text>

      <View style={{ flexDirection: 'row', marginTop: SPACING.base }}>
        <Stat label="Load" value={formatThousands(summary.load)} unit="AU" />
        <Stat label="Time" value={formatZoneMinutes(summary.minutes)} />
        <Stat label="Sessions" value={String(summary.sessions)} />
      </View>
    </View>
  )
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, minWidth: 0, paddingRight: SPACING.sm }}>
      <Text
        numberOfLines={1}
        style={{ fontSize: TYPE.small, color: colors.textMuted, marginBottom: 3 }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
        <Text
          numberOfLines={1}
          style={{
            fontSize: TYPE.heading,
            lineHeight: 27,
            fontWeight: WEIGHT.bold,
            color: colors.text,
            flexShrink: 1,
          }}
        >
          {value}
        </Text>
        {unit ? (
          <Text style={{ marginLeft: 3, fontSize: TYPE.caption, color: colors.textSubtle }}>
            {unit}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
