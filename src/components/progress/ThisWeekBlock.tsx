import { Text, View } from 'react-native'
import { formatThousands, formatZoneMinutes } from '../../utils/formatting'
import type { WeekSummary } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

interface ThisWeekBlockProps {
  summary: WeekSummary
}

/**
 * "This week", as three plain figures.
 *
 * ## Label above value
 *
 * Which is the opposite of the usual convention, and deliberate. A summary row
 * is read as a *set* — the athlete wants all three at once, not one of them —
 * and putting the small grey labels on a shared upper line gives the three big
 * numbers an unbroken baseline to sit on. Values under labels scan as one row of
 * figures; values over labels scan as three separate stacked items.
 *
 * ## No boxes
 *
 * This was six bordered, shadowed tiles with an emoji on each: six cards, six
 * hairlines and six drop shadows spent on six numbers, which was the heaviest
 * furniture on the screen wrapped around its lightest content. A number and its
 * label are already a legible unit; a box around them adds weight and no
 * meaning. The card underneath is the only container the block needs.
 */
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
