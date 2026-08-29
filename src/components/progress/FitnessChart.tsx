import { useMemo, useState } from 'react'
import { Text, View, type GestureResponderEvent } from 'react-native'
import Svg, {
  Circle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg'
import ChartCard from './ChartCard'
import { formatCompact, niceScale, smoothPath, type Point } from './chartUtils'
import type { DailyPoint } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
// The one place the Fitness/Fatigue/Form colour language is defined. Blue reads
// as "building capacity", red as "cost/fatigue", teal is FORMA's own Form brand.

const PLOT_H = 232
const PAD_L = 34
const PAD_R = 12
const PAD_T = 12
const PAD_B = 26

interface FitnessChartProps {
  daily: DailyPoint[]
  delay?: number
}

/**
 * The hero chart: daily Fitness (CTL), Fatigue (ATL) and Form on one shared
 * axis. Fitness is a solid blue line, Fatigue a red dashed line, and Form a teal
 * line with a soft area fill toward the zero reference line — the visual story of
 * "built here, overreached here, recovered here". Tap or drag to scrub a tooltip.
 */
export default function FitnessChart({ daily, delay = 0 }: FitnessChartProps) {
  return (
    <ChartCard
      title="Fitness, Fatigue & Form"
      subtitle="Your training adaptation over time"
      delay={delay}
      legend={<Legend />}
    >
      {(width) => <FitnessPlot daily={daily} width={width} />}
    </ChartCard>
  )
}

function Legend() {
  const { colors } = useTheme()

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      <LegendItem color={colors.palette.sky} label="Fitness" />
      <LegendItem color={colors.palette.red} label="Fatigue" dashed />
      <LegendItem color={colors.accent} label="Form" />
    </View>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
  const { colors } = useTheme()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View
        style={{
          width: 16,
          height: 0,
          borderTopWidth: 3,
          borderColor: color,
          borderStyle: dashed ? 'dashed' : 'solid',
          marginRight: 6,
        }}
      />
      <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textBody }}>{label}</Text>
    </View>
  )
}

function FitnessPlot({ daily, width }: { daily: DailyPoint[]; width: number }) {
  const { colors } = useTheme()

  const [active, setActive] = useState<number | null>(null)

  const n = daily.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    if (n === 0) return null
    let lo = Infinity
    let hi = -Infinity
    for (const d of daily) {
      lo = Math.min(lo, d.ctl, d.atl, d.form)
      hi = Math.max(hi, d.ctl, d.atl, d.form)
    }
    // Always include zero so the reference line and Form's sign are visible.
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
    const scale = niceScale(lo, hi, 5)

    const xAt = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const yAt = (v: number) =>
      PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min)) * plotH

    const ctlPts: Point[] = daily.map((d, i) => ({ x: xAt(i), y: yAt(d.ctl) }))
    const atlPts: Point[] = daily.map((d, i) => ({ x: xAt(i), y: yAt(d.atl) }))
    const formPts: Point[] = daily.map((d, i) => ({ x: xAt(i), y: yAt(d.form) }))

    const y0 = yAt(0)
    const formArea = `${smoothPath(formPts)} L ${formPts[n - 1].x.toFixed(2)} ${y0.toFixed(
      2,
    )} L ${formPts[0].x.toFixed(2)} ${y0.toFixed(2)} Z`

    // Weekly-ish x labels: fewer as the range widens, so they never collide.
    const step = n > 60 ? 21 : n > 30 ? 14 : 7
    const xLabels: { x: number; label: string }[] = []
    for (let i = 0; i < n; i += step) {
      xLabels.push({ x: xAt(i), label: shortLabel(daily[i].dateISO) })
    }

    return { scale, xAt, yAt, ctlPts, atlPts, formPts, formArea, y0, xLabels }
  }, [daily, n, plotW, plotH])

  if (!geom || n < 2) {
    return <NotEnough />
  }

  const onTouch = (e: GestureResponderEvent) => {
    const x = e.nativeEvent.locationX
    const clamped = Math.max(PAD_L, Math.min(PAD_L + plotW, x))
    const idx = Math.round(((clamped - PAD_L) / plotW) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, idx)))
  }

  const activePoint = active != null ? daily[active] : null

  return (
    <View
      // Claim the gesture only when it *starts* on the plot, so a tap or a drag
      // that begins here scrubs — but a vertical page-scroll passing over the
      // chart isn't hijacked (that needs onMoveShouldSetResponder, omitted).
      onStartShouldSetResponder={() => true}
      onResponderGrant={onTouch}
      onResponderMove={onTouch}
      onResponderRelease={onTouch}
    >
      <Svg width={width} height={PLOT_H}>
        <Defs>
          <LinearGradient id="formFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.22} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* Gridlines + y labels */}
        {geom.scale.ticks.map((t) => {
          const y = geom.yAt(t)
          return (
            <G key={t}>
              <Line
                x1={PAD_L}
                y1={y}
                x2={width - PAD_R}
                y2={y}
                stroke={colors.border}
                strokeWidth={1}
              />
              <SvgText
                x={PAD_L - 6}
                y={y + 3}
                fontSize={9}
                fill={colors.textMuted}
                textAnchor="end"
              >
                {formatCompact(t)}
              </SvgText>
            </G>
          )
        })}

        {/* Zero reference line (Form baseline) */}
        <Line
          x1={PAD_L}
          y1={geom.y0}
          x2={width - PAD_R}
          y2={geom.y0}
          stroke={colors.textSubtle}
          strokeWidth={1}
          strokeDasharray="2 3"
        />

        {/* Form area + lines (Form drawn under CTL/ATL so they stay readable) */}
        <Path d={geom.formArea} fill="url(#formFill)" />
        <Path d={smoothPath(geom.formPts)} stroke={colors.accent} strokeWidth={2} fill="none" />
        <Path
          d={smoothPath(geom.atlPts)}
          stroke={colors.palette.red}
          strokeWidth={2}
          strokeDasharray="5 4"
          fill="none"
        />
        <Path d={smoothPath(geom.ctlPts)} stroke={colors.palette.sky} strokeWidth={2.5} fill="none" />

        {/* X labels */}
        {geom.xLabels.map((l, i) => (
          <SvgText
            key={i}
            x={l.x}
            y={PLOT_H - 8}
            fontSize={9}
            fill={colors.textMuted}
            textAnchor="middle"
          >
            {l.label}
          </SvgText>
        ))}

        {/* Scrub crosshair + markers */}
        {active != null ? (
          <G>
            <Line
              x1={geom.xAt(active)}
              y1={PAD_T}
              x2={geom.xAt(active)}
              y2={PAD_T + plotH}
              stroke={colors.textSubtle}
              strokeWidth={1}
            />
            <Circle cx={geom.xAt(active)} cy={geom.ctlPts[active].y} r={4} fill={colors.palette.sky} stroke={colors.surface} strokeWidth={1.5} />
            <Circle cx={geom.xAt(active)} cy={geom.atlPts[active].y} r={4} fill={colors.palette.red} stroke={colors.surface} strokeWidth={1.5} />
            <Circle cx={geom.xAt(active)} cy={geom.formPts[active].y} r={4} fill={colors.accent} stroke={colors.surface} strokeWidth={1.5} />
          </G>
        ) : null}

        {/* Transparent hit layer already handled by the wrapping View */}
        <Rect x={0} y={0} width={width} height={PLOT_H} fill="transparent" />
      </Svg>

      {activePoint ? (
        <Tooltip point={activePoint} x={geom.xAt(active as number)} width={width} />
      ) : null}
    </View>
  )
}

function Tooltip({ point, x, width }: { point: DailyPoint; x: number; width: number }) {
  const { colors } = useTheme()

  const BUBBLE_W = 138
  const left = Math.max(4, Math.min(width - BUBBLE_W - 4, x - BUBBLE_W / 2))
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 4,
        left,
        width: BUBBLE_W,
        // A raised dark surface with a hairline, not the near-black slab this
        // was. `colors.text` used to be #111827 and made a perfectly good
        // tooltip; it is now the *lightest* colour in the palette, so this
        // rendered as a white card with white body copy on it.
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
        {point.fullDate}
      </Text>
      <TipRow color={colors.palette.sky} label="Fitness" value={point.ctl} />
      <TipRow color={colors.palette.red} label="Fatigue" value={point.atl} />
      <TipRow color={colors.accent} label="Form" value={point.form} signed />
    </View>
  )
}

function TipRow({
  color,
  label,
  value,
  signed,
}: {
  color: string
  label: string
  value: number
  signed?: boolean
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, marginRight: 6 }} />
      <Text style={{ color: colors.textBody, fontSize: 11, flex: 1 }}>{label}</Text>
      <Text style={{ color: colors.text, fontSize: 11, fontWeight: '700' }}>
        {signed && value > 0 ? '+' : ''}
        {value}
      </Text>
    </View>
  )
}

function NotEnough() {
  const { colors } = useTheme()

  return (
    <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, color: colors.textSubtle }}>Not enough data yet</Text>
    </View>
  )
}

/** "Jun 23" from a YYYY-MM-DD key, in local time. */
function shortLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
