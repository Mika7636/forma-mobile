import { useMemo } from 'react'
import { Text, View } from 'react-native'
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg'
import ChartCard from '../progress/ChartCard'
import { formatCompact, paddedScale, roundedTopBar } from '../progress/chartUtils'
import type { AdminDay } from '../../services/adminService'
import { SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/**
 * Plot geometry, matching `TrainingLoadChart`'s conventions — y-axis gutter on
 * the left, weekday ticks in the bottom band — at two thirds the height, because
 * this is seven columns rather than twelve and a 200pt plot for seven small
 * integers is mostly air.
 */
const PAD_T = 12
const PAD_B = 20
const PLOT_H = 132 + PAD_T + PAD_B
const PAD_L = 30
const PAD_R = 8

interface DailySessionsChartProps {
  days: AdminDay[]
  /** Sum of `days`, shown in the caption. */
  total: number
}

/**
 * Sessions logged per day across every account, for the last seven days.
 *
 * Built on the Progress screen's `ChartCard` and its chart maths — same card
 * chrome, same measured-width contract, the same `paddedScale` that fits the
 * axis to the window rather than rounding up past it, and the same
 * `roundedTopBar` geometry. The Admin screen is a back-office page and the least
 * useful thing it could do is invent a second visual language for a bar chart
 * the app already has one of.
 *
 * The bars are the plain accent rather than the load chart's three-colour
 * standing scale: there is no band to be above or below here, and colour that
 * doesn't encode anything is just decoration pretending to be data.
 */
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
    // Whole sessions only: a "0.5 sessions" gridline is nonsense, and with a
    // quiet week the padded scale will happily produce one. Asking for at most
    // `max` ticks keeps the step at 1 until there is enough range to need more.
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

  // Seven empty days is a real answer, not a failure — but an axis whose only
  // gridline is zero says it better than seven invisible bars would.
  if (geom.max === 0) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No sessions logged in the last 7 days
        </Text>
      </View>
    )
  }

  // The plot is one graphic to a screen reader, described in full: seven bars
  // are seven unlabelled shapes otherwise, and there is no tooltip here to tap.
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
            {/* Weekday initials. Duplicated letters (two Ts, two Ss) are fine on a
                seven-day axis where the order does the disambiguating; the full
                date is in the plot's accessible description above. */}
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
