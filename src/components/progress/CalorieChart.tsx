import { useMemo, useState } from 'react'
import { Text, View, type GestureResponderEvent } from 'react-native'
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
import ChartCard from './ChartCard'
import { formatCompact, niceScale, smoothPath, type Point } from './chartUtils'
import { COLORS } from '../../constants/theme'
import { formatThousands } from '../../utils/formatting'
import type { WeeklyPoint } from '../../utils/progressMetrics'

const LINE = '#F97316'
const FILL_TOP = '#FB923C'

const PLOT_H = 178
const PAD_L = 36
const PAD_R = 12
const PAD_T = 14
const PAD_B = 24

interface CalorieChartProps {
  weekly: WeeklyPoint[]
  delay?: number
}

/**
 * Weekly calories burned as a smooth area with a fire-orange gradient. Tap or
 * drag to read a week's total.
 */
export default function CalorieChart({ weekly, delay = 0 }: CalorieChartProps) {
  return (
    <ChartCard title="Est. Calories Burned" subtitle="Energy out, week by week" icon="🔥" delay={delay}>
      {(width) => <CaloriePlot weekly={weekly} width={width} />}
    </ChartCard>
  )
}

function CaloriePlot({ weekly, width }: { weekly: WeeklyPoint[]; width: number }) {
  const [active, setActive] = useState<number | null>(null)

  const n = weekly.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B
  const labelStep = n > 8 ? 2 : 1

  const geom = useMemo(() => {
    const maxCal = weekly.reduce((m, w) => Math.max(m, w.calories), 0)
    const scale = niceScale(0, maxCal, 4)
    const xAt = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const yAt = (v: number) =>
      PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH
    const pts: Point[] = weekly.map((w, i) => ({ x: xAt(i), y: yAt(w.calories) }))
    const yBase = yAt(scale.min)
    const area =
      pts.length > 0
        ? `${smoothPath(pts)} L ${pts[n - 1].x.toFixed(2)} ${yBase.toFixed(2)} L ${pts[0].x.toFixed(
            2,
          )} ${yBase.toFixed(2)} Z`
        : ''
    return { scale, xAt, yAt, pts, area, yBase }
  }, [weekly, n, plotW, plotH])

  if (n < 2) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, color: COLORS.subtle }}>Not enough data yet</Text>
      </View>
    )
  }

  const onTouch = (e: GestureResponderEvent) => {
    const clamped = Math.max(PAD_L, Math.min(PAD_L + plotW, e.nativeEvent.locationX))
    const idx = Math.round(((clamped - PAD_L) / plotW) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, idx)))
  }

  const activePoint = active != null ? weekly[active] : null

  return (
    <View
      // Claim only on gesture start (see FitnessChart) so vertical page-scroll
      // passing over the area chart isn't hijacked.
      onStartShouldSetResponder={() => true}
      onResponderGrant={onTouch}
      onResponderMove={onTouch}
      onResponderRelease={onTouch}
    >
      <Svg width={width} height={PLOT_H}>
        <Defs>
          <LinearGradient id="calFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={FILL_TOP} stopOpacity={0.32} />
            <Stop offset="1" stopColor={FILL_TOP} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {geom.scale.ticks.map((t) => {
          const y = geom.yAt(t)
          return (
            <G key={t}>
              <Line x1={PAD_L} y1={y} x2={width - PAD_R} y2={y} stroke={COLORS.border} strokeWidth={1} />
              <SvgText x={PAD_L - 6} y={y + 3} fontSize={9} fill={COLORS.subtle} textAnchor="end">
                {formatCompact(t)}
              </SvgText>
            </G>
          )
        })}

        <Path d={geom.area} fill="url(#calFill)" />
        <Path d={smoothPath(geom.pts)} stroke={LINE} strokeWidth={2.5} fill="none" />

        {weekly.map((w, i) =>
          i % labelStep === 0 ? (
            <SvgText
              key={w.weekStartISO}
              x={geom.xAt(i)}
              y={PLOT_H - 7}
              fontSize={9}
              fill={COLORS.subtle}
              textAnchor="middle"
            >
              {w.weekLabel}
            </SvgText>
          ) : null,
        )}

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
            <Circle
              cx={geom.xAt(active)}
              cy={geom.pts[active].y}
              r={4.5}
              fill={LINE}
              stroke={COLORS.white}
              strokeWidth={1.5}
            />
          </G>
        ) : null}
      </Svg>

      {activePoint ? (
        <Tooltip point={activePoint} x={geom.xAt(active as number)} width={width} />
      ) : null}
    </View>
  )
}

function Tooltip({ point, x, width }: { point: WeeklyPoint; x: number; width: number }) {
  const BUBBLE_W = 140
  const left = Math.max(4, Math.min(width - BUBBLE_W - 4, x - BUBBLE_W / 2))
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 2,
        left,
        width: BUBBLE_W,
        backgroundColor: COLORS.ink,
        borderRadius: 10,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800', marginBottom: 2 }}>
        {point.weekLabel} · {point.rangeLabel}
      </Text>
      <Text style={{ color: '#FDBA74', fontSize: 12, fontWeight: '700' }}>
        🔥 {formatThousands(point.calories)} kcal
      </Text>
    </View>
  )
}
