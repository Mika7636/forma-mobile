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
import { COLORS } from '../../constants/theme'
import type { DailyPoint } from '../../utils/progressMetrics'
import { PALETTE } from '../../theme/tokens'

// The one place the Fitness/Fatigue/Form colour language is defined. Blue reads
// as "building capacity", red as "cost/fatigue", teal is FORMA's own Form brand.
const CTL_COLOR = PALETTE.sky
const ATL_COLOR = PALETTE.red
const FORM_COLOR = COLORS.teal

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
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
      <LegendItem color={CTL_COLOR} label="Fitness" />
      <LegendItem color={ATL_COLOR} label="Fatigue" dashed />
      <LegendItem color={FORM_COLOR} label="Form" />
    </View>
  )
}

function LegendItem({ color, label, dashed }: { color: string; label: string; dashed?: boolean }) {
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
      <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.body }}>{label}</Text>
    </View>
  )
}

function FitnessPlot({ daily, width }: { daily: DailyPoint[]; width: number }) {
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
            <Stop offset="0" stopColor={FORM_COLOR} stopOpacity={0.22} />
            <Stop offset="1" stopColor={FORM_COLOR} stopOpacity={0.02} />
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
                stroke={COLORS.border}
                strokeWidth={1}
              />
              <SvgText
                x={PAD_L - 6}
                y={y + 3}
                fontSize={9}
                fill={COLORS.muted}
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
          stroke={COLORS.subtle}
          strokeWidth={1}
          strokeDasharray="2 3"
        />

        {/* Form area + lines (Form drawn under CTL/ATL so they stay readable) */}
        <Path d={geom.formArea} fill="url(#formFill)" />
        <Path d={smoothPath(geom.formPts)} stroke={FORM_COLOR} strokeWidth={2} fill="none" />
        <Path
          d={smoothPath(geom.atlPts)}
          stroke={ATL_COLOR}
          strokeWidth={2}
          strokeDasharray="5 4"
          fill="none"
        />
        <Path d={smoothPath(geom.ctlPts)} stroke={CTL_COLOR} strokeWidth={2.5} fill="none" />

        {/* X labels */}
        {geom.xLabels.map((l, i) => (
          <SvgText
            key={i}
            x={l.x}
            y={PLOT_H - 8}
            fontSize={9}
            fill={COLORS.muted}
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
              stroke={COLORS.subtle}
              strokeWidth={1}
            />
            <Circle cx={geom.xAt(active)} cy={geom.ctlPts[active].y} r={4} fill={CTL_COLOR} stroke={COLORS.surface} strokeWidth={1.5} />
            <Circle cx={geom.xAt(active)} cy={geom.atlPts[active].y} r={4} fill={ATL_COLOR} stroke={COLORS.surface} strokeWidth={1.5} />
            <Circle cx={geom.xAt(active)} cy={geom.formPts[active].y} r={4} fill={FORM_COLOR} stroke={COLORS.surface} strokeWidth={1.5} />
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
        // was. `COLORS.ink` used to be #111827 and made a perfectly good
        // tooltip; it is now the *lightest* colour in the palette, so this
        // rendered as a white card with white body copy on it.
        backgroundColor: COLORS.surfaceAlt,
        borderWidth: 1,
        borderColor: COLORS.border,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: COLORS.ink, fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
        {point.fullDate}
      </Text>
      <TipRow color={CTL_COLOR} label="Fitness" value={point.ctl} />
      <TipRow color={ATL_COLOR} label="Fatigue" value={point.atl} />
      <TipRow color={FORM_COLOR} label="Form" value={point.form} signed />
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
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 1 }}>
      <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color, marginRight: 6 }} />
      <Text style={{ color: COLORS.body, fontSize: 11, flex: 1 }}>{label}</Text>
      <Text style={{ color: COLORS.ink, fontSize: 11, fontWeight: '700' }}>
        {signed && value > 0 ? '+' : ''}
        {value}
      </Text>
    </View>
  )
}

function NotEnough() {
  return (
    <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 13, color: COLORS.subtle }}>Not enough data yet</Text>
    </View>
  )
}

/** "Jun 23" from a YYYY-MM-DD key, in local time. */
function shortLabel(dateISO: string): string {
  const [y, m, d] = dateISO.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
