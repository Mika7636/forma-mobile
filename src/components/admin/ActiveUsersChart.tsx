// Admin section 2: weekly active users, as a line.

import { useMemo } from 'react'
import { Text, View } from 'react-native'
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import ChartCard from '../progress/ChartCard'
import { ChartEmpty } from './AdminSection'
import { formatCompact, linePath, paddedScale, type Point } from '../progress/chartUtils'
import type { ActiveWeekPoint } from '../../utils/adminMetrics'
import { ACTIVE_WEEKS } from '../../utils/adminMetrics'
import { SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const PAD_T = 14
const PAD_B = 22
const PLOT_H = 168 + PAD_T + PAD_B
const PAD_L = 34
const PAD_R = 8

const DOT_R = 3.6

export default function ActiveUsersChart({ weeks }: { weeks: ActiveWeekPoint[] }) {
  const { colors } = useTheme()

  const peak = weeks.reduce((m, w) => Math.max(m, w.users), 0)
  const latest = weeks.length > 0 ? weeks[weeks.length - 1] : null

  return (
    <ChartCard title="Active users per week" subtitle={`Last ${ACTIVE_WEEKS} weeks`}>
      {(width) =>
        peak === 0 ? (
          <ChartEmpty
            message={`Nobody has logged a session in the last ${ACTIVE_WEEKS} weeks.`}
            height={PLOT_H}
          />
        ) : (
          <View>
            <WeeklyPlot weeks={weeks} width={width} />
            <Text style={{ marginTop: SPACING.md, fontSize: TYPE.small, color: colors.textMuted }}>
              <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>
                {latest?.users ?? 0}
              </Text>{' '}
              this week
              {'  ·  '}
              <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>{peak}</Text> at the
              peak
            </Text>
          </View>
        )
      }
    </ChartCard>
  )
}

function WeeklyPlot({ weeks, width }: { weeks: ActiveWeekPoint[]; width: number }) {
  const { colors } = useTheme()

  const n = weeks.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    const max = weeks.reduce((m, w) => Math.max(m, w.users), 0)
    const scale = paddedScale(max, 1.15, Math.max(1, Math.min(4, max)))
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    const slot = n > 0 ? plotW / n : plotW
    const coords: Point[] = weeks.map((w, i) => ({ x: PAD_L + (i + 0.5) * slot, y: yAt(w.users) }))
    return {
      ticks: scale.ticks.filter((t) => Number.isInteger(t)),
      yAt,
      yBase: yAt(0),
      coords,
    }
  }, [weeks, n, plotW, plotH])

  const line = linePath(geom.coords)
  const area =
    geom.coords.length > 0
      ? `${line} L ${geom.coords[geom.coords.length - 1].x.toFixed(2)} ${geom.yBase.toFixed(2)} ` +
        `L ${geom.coords[0].x.toFixed(2)} ${geom.yBase.toFixed(2)} Z`
      : ''

  const description = weeks.map((w) => `${w.label}: ${w.users}`).join(', ')

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={description}>
      <Svg width={width} height={PLOT_H}>
        <Defs>
          <LinearGradient id="adminActiveArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {geom.ticks.map((t) => (
          <SvgText
            key={t}
            x={PAD_L - 6}
            y={geom.yAt(t) + 3.5}
            fontSize={10}
            fill={colors.textMuted}
            textAnchor="end"
          >
            {formatCompact(t)}
          </SvgText>
        ))}

        <Line
          x1={PAD_L}
          y1={geom.yBase}
          x2={width - PAD_R}
          y2={geom.yBase}
          stroke={colors.border}
          strokeWidth={1}
        />

        {area ? <Path d={area} fill="url(#adminActiveArea)" /> : null}

        <Path
          d={line}
          stroke={colors.accent}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {weeks.map((week, i) => (
          <G key={week.startedAt}>
            <Circle
              cx={geom.coords[i].x}
              cy={geom.coords[i].y}
              r={DOT_R}
              fill={colors.accent}
              stroke={colors.surface}
              strokeWidth={1.5}
              opacity={week.partial ? 0.5 : 1}
            />
            {week.tick ? (
              <SvgText
                x={geom.coords[i].x}
                y={PLOT_H - 5}
                fontSize={10}
                fontWeight="600"
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {week.tick}
              </SvgText>
            ) : null}
          </G>
        ))}
      </Svg>
    </View>
  )
}
