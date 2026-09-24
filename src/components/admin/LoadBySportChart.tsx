// Admin section 4: training load by sport, as horizontal bars.

import { Text, View } from 'react-native'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import type { SportLoadBar } from '../../utils/adminMetrics'
import { sportVisual } from '../../utils/sportMeta'
import type { SportType } from '../../types/session'
import { formatThousands } from '../../utils/formatting'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const BAR_H = 10

export default function LoadBySportChart({
  bars,
  windowDays,
}: {
  bars: SportLoadBar[]
  windowDays: number
}) {
  const { colors } = useTheme()

  const total = bars.reduce((sum, b) => sum + b.load, 0)

  return (
    <ChartCard
      title="Training load by sport"
      subtitle={`All users, last ${windowDays} days`}
      info={
        <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textBody }}>
          Load is session duration multiplied by RPE, in arbitrary units (AU) — the same figure
          the Progress screen charts for an individual athlete. A sport can rank high here on few
          sessions if those sessions are long or hard, which is exactly where this chart and the
          one above it disagree most usefully.
        </Text>
      }
      infoLabel="About the load by sport chart"
    >
      {() =>
        total === 0 ? (
          <ChartEmpty message="No training load recorded in this window." height={132} />
        ) : (
          <View style={{ gap: SPACING.md }}>
            {bars.map((bar) => (
              <LoadRow key={bar.sport} bar={bar} share={bar.load / total} />
            ))}
          </View>
        )
      }
    </ChartCard>
  )
}

function LoadRow({ bar, share }: { bar: SportLoadBar; share: number }) {
  const { colors } = useTheme()

  const color = sportVisual(bar.sport as SportType, colors).color

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${bar.label}: ${Math.round(bar.load)} AU from ${bar.sessions} sessions, ${Math.round(share * 100)} percent of total load`}
    >
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginBottom: 5 }}>
        <Text
          numberOfLines={1}
          style={{ flex: 1, minWidth: 0, fontSize: TYPE.small, color: colors.textBody }}
        >
          {bar.label}
        </Text>
        <Text
          style={{
            fontSize: TYPE.small,
            fontWeight: WEIGHT.semibold,
            color: colors.text,
            marginLeft: SPACING.sm,
          }}
        >
          {formatThousands(bar.load)} AU
        </Text>
      </View>

      <View
        style={{
          height: BAR_H,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.surfaceAlt,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${Math.max(bar.fraction, 0.01) * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: color,
          }}
        />
      </View>

      <Text style={{ marginTop: 4, fontSize: TYPE.caption, color: colors.textSubtle }}>
        {Math.round(share * 100)}% of total load
        {'  ·  '}
        {formatThousands(bar.sessions)} {bar.sessions === 1 ? 'session' : 'sessions'}
      </Text>
    </View>
  )
}
