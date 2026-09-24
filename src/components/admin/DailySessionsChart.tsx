// Admin bar chart of sessions per day across a week.

import { useMemo } from 'react'
import { Text, View } from 'react-native'
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg'
import ChartCard from '../progress/ChartCard'
import { formatCompact, paddedScale, roundedTopBar } from '../progress/chartUtils'
import type { AdminDay } from '../../services/adminService'
import { SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const PAD_T = 12
const PAD_B = 20
const PLOT_H = 132 + PAD_T + PAD_B
const PAD_L = 30
const PAD_R = 8

interface DailySessionsChartProps {
  days: AdminDay[]
  total: number
}

export default function DailySessionsChart({ days, total }: DailySessionsChartProps) {
  const { colors } = useTheme()

  return (
    <ChartCard title="Sessions per day" subtitle="All users, last 7 days">
      {(width) => (
        <View>
          <DailyPlot days={days} width={width} />
          <Text
            style={{
              marginTop: SPACING.md,
              fontSize: TYPE.small,
              color: colors.textMuted,
            }}
          >
            <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>{total}</Text>{' '}
            {total === 1 ? 'session' : 'sessions'} in this window
          </Text>
        </View>
      )}
    </ChartCard>
  )
}

function DailyPlot({ days, width }: { days: AdminDay[]; width: number }) {
  const { colors } = useTheme()

  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    const max = days.reduce((m, day) => Math.max(m, day.count), 0)
    const scale = paddedScale(max, 1.2, Math.max(1, Math.min(4, max)))
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    const slot = days.length > 0 ? plotW / days.length : plotW
    const barW = Math.max(6, Math.min(26, slot * 0.5))
    const ticks = scale.ticks.filter((t) => Number.isInteger(t))
    return {
      ticks: ticks.length > 0 ? ticks : [0],
      yAt,
      yBase: yAt(0),
      max,
      bars: days.map((day, i) => {
        const cx = PAD_L + (i + 0.5) * slot
        return { day, cx, x: cx - barW / 2, top: yAt(day.count), barW }
      }),
    }
  }, [days, plotW, plotH])

  if (geom.max === 0) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No sessions logged in the last 7 days
        </Text>
      </View>
    )
  }

  const description = days.map((day) => `${day.label}: ${day.count}`).join(', ')

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={description}>
      <Svg width={width} height={PLOT_H}>
        {geom.ticks.map((t) => (
          <G key={t}>
            <Line
              x1={PAD_L}
              y1={geom.yAt(t)}
              x2={width - PAD_R}
              y2={geom.yAt(t)}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={PAD_L - 6}
              y={geom.yAt(t) + 3.5}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {formatCompact(t)}
            </SvgText>
          </G>
        ))}

        {geom.bars.map((bar) => (
          <G key={bar.day.startedAt}>
            {bar.day.count > 0 ? (
              <Path
                d={roundedTopBar(bar.x, bar.top, bar.barW, geom.yBase, 4)}
                fill={colors.accent}
              />
            ) : null}
            <SvgText
              x={bar.cx}
              y={PLOT_H - 5}
              fontSize={10}
              fontWeight="600"
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {bar.day.initial}
            </SvgText>
          </G>
        ))}
      </Svg>
    </View>
  )
}
