// Twelve weeks of consistency, counted in load not attendance.

import { Text, View } from 'react-native'
import { standingColor } from './TrainingLoadChart'
import type { WeekBucket } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT, cardStyle, type Palette } from '../../theme/tokens'

const DOT = 15
const CELL = 23
const GAP = 5

interface TrainingConsistencyProps {
  weeks: WeekBucket[]
  streak: number
}

export default function TrainingConsistency({ weeks, streak }: TrainingConsistencyProps) {
  const { colors } = useTheme()

  return (
    <View style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Consistency
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        How often the amount was right
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.base }}>
        <View style={{ minWidth: 92 }}>
          <Text
            accessibilityLabel={`${streak} ${streak === 1 ? 'week' : 'weeks'} in range`}
            style={{
              fontSize: 52,
              lineHeight: 56,
              fontWeight: WEIGHT.heavy,
              color: streak > 0 ? colors.accentText : colors.textMuted,
            }}
          >
            {streak}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: TYPE.caption,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              fontWeight: WEIGHT.semibold,
              color: colors.textMuted,
            }}
          >
            {streak === 1 ? 'week in range' : 'weeks in range'}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <DotGrid weeks={weeks} />
          <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.caption, color: colors.textSubtle }}>
            Last {weeks.length} weeks
          </Text>
        </View>
      </View>

      <Text
        style={{
          marginTop: SPACING.base,
          fontSize: TYPE.micro,
          lineHeight: 18,
          color: colors.textBody,
        }}
      >
        Consistency beats intensity. Weeks inside your range build fitness that lasts.
      </Text>
    </View>
  )
}

function dotStyle(week: WeekBucket, colors: Palette) {
  const standing = week.standingSoFar
  if (standing === 'inside' || standing === 'above') {
    return { fill: standingColor(standing, colors), hollow: false }
  }
  return { fill: 'transparent', hollow: true }
}

function DotGrid({ weeks }: { weeks: WeekBucket[] }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: GAP,
        maxWidth: (CELL + GAP) * 6,
      }}
    >
      {weeks.map((week) => {
        const style = dotStyle(week, colors)
        return (
          <View
            key={week.key}
            accessibilityLabel={`Week of ${week.label}: ${week.standingSoFar ?? 'in progress'}`}
            style={{
              width: CELL,
              height: CELL,
              borderRadius: CELL / 2,
              alignItems: 'center',
              justifyContent: 'center',
              borderWidth: week.partial ? 1.5 : 0,
              borderColor: colors.borderStrong,
            }}
          >
            <View
              style={{
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                backgroundColor: style.fill,
                borderWidth: style.hollow ? 1.5 : 0,
                borderColor: colors.borderStrong,
              }}
            />
          </View>
        )
      })}
    </View>
  )
}
