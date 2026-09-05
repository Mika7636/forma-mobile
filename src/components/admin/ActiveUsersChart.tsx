// Section 2 — weekly active users, as a line.
//
// Built to the Progress screen's load chart, deliberately and closely: the same
// `ChartCard` chrome, the same `paddedScale` fitting the axis to the window
// rather than rounding past it, the same `linePath`, the same accent stroke over
// the same top-down gradient wash, the same dot radius and the same
// surface-coloured ring that keeps a dot legible where the line is steep. An
// admin page inventing a second visual language for a line chart the app already
// draws would make the back office look like a different product.
//
// What it does *not* borrow is the three-colour dot scale. Over there a dot's
// fill says where a week sat against the athlete's sustainable band; there is no
// band here and no standing to encode, so the dots are plain accent. Colour that
// encodes nothing is decoration wearing data's clothes.
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

/** Plot geometry, matching `TrainingLoadChart`'s gutters at a shorter height. */
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
    // Whole people only: a gridline at 2.5 users is nonsense, and a padded scale
    // over a small count will happily produce one. Capping the tick request at
    // `max` holds the step at 1 until there is enough range to need more.
    const scale = paddedScale(max, 1.15, Math.max(1, Math.min(4, max)))
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    // Slot centres rather than edge to edge, so the first and last dots keep
    // their full radius inside the plot instead of being clipped by the gutter.
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
  // The area is the line, closed down its two ends to the baseline.
  const area =
    geom.coords.length > 0
      ? `${line} L ${geom.coords[geom.coords.length - 1].x.toFixed(2)} ${geom.yBase.toFixed(2)} ` +
        `L ${geom.coords[0].x.toFixed(2)} ${geom.yBase.toFixed(2)} Z`
      : ''

  // One graphic to a screen reader, described in full: twelve dots are twelve
  // unlabelled shapes otherwise, and there is no tooltip on this one to tap.
  const description = weeks.map((w) => `${w.label}: ${w.users}`).join(', ')

  return (
    <View accessible accessibilityRole="image" accessibilityLabel={description}>
      <Svg width={width} height={PLOT_H}>
        <Defs>
          {/* The soft wash under the line, fading to nothing at the baseline
              rather than stopping on a hard edge, so it reads as the line's own
              weight and not as a second filled series. */}
          <LinearGradient id="adminActiveArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Axis labels without gridlines: the gutter still has to say what a
            height is worth, but one line does not need four rules through it. */}
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

        {/* The one rule that stays: zero, the floor every point is read against. */}
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
              // The current week is not over. At full weight a Tuesday reads as
              // a collapse; at half it reads as what it is — still filling.
              opacity={week.partial ? 0.5 : 1}
            />
            {/* Month boundaries only. Twelve dated ticks under a twelve-point
                line is a wall of 10pt text, and the month is the orientation a
                reader actually needs — see `activeUsersByWeek`, which decides
                where the boundaries fall so the axis and the buckets cannot
                disagree. */}
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
