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
import { formatThousands } from '../../utils/formatting'
import type { LoadBucket } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'

const PLOT_H = 178
const PAD_L = 36
const PAD_R = 12
const PAD_T = 14
const PAD_B = 24

interface CalorieChartProps {
  buckets: LoadBucket[]
  delay?: number
}

/**
 * Calories burned as a smooth area with a fire-orange gradient, one point per
 * bucket. Tap or drag to read a bucket's total.
 */
export default function CalorieChart({ buckets, delay = 0 }: CalorieChartProps) {
  return (
    <ChartCard title="Calories Burned" subtitle="Energy out over the period" icon="🔥" delay={delay}>
      {(width) => <CaloriePlot buckets={buckets} width={width} />}
    </ChartCard>
  )
}

function CaloriePlot({ buckets, width }: { buckets: LoadBucket[]; width: number }) {
  const { colors } = useTheme()

  const [active, setActive] = useState<number | null>(null)

  const n = buckets.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B
  const labelStep = n > 8 ? 2 : 1

  const geom = useMemo(() => {
    const maxCal = buckets.reduce((m, b) => Math.max(m, b.calories), 0)
    const scale = niceScale(0, maxCal, 4)
    const xAt = (i: number) => PAD_L + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW)
    const yAt = (v: number) =>
      PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH
    const pts: Point[] = buckets.map((b, i) => ({ x: xAt(i), y: yAt(b.calories) }))
    const yBase = yAt(scale.min)
    const area =
      pts.length > 0
        ? `${smoothPath(pts)} L ${pts[n - 1].x.toFixed(2)} ${yBase.toFixed(2)} L ${pts[0].x.toFixed(
            2,
          )} ${yBase.toFixed(2)} Z`
        : ''
    return { scale, xAt, yAt, pts, area, yBase }
  }, [buckets, n, plotW, plotH])

  if (n < 2) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, color: colors.textSubtle }}>Not enough data yet</Text>
      </View>
    )
  }

  const onTouch = (e: GestureResponderEvent) => {
    const clamped = Math.max(PAD_L, Math.min(PAD_L + plotW, e.nativeEvent.locationX))
    const idx = Math.round(((clamped - PAD_L) / plotW) * (n - 1))
    setActive(Math.max(0, Math.min(n - 1, idx)))
  }

  const activePoint = active != null ? buckets[active] : null

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
            <Stop offset="0" stopColor={colors.palette.orange} stopOpacity={0.32} />
            <Stop offset="1" stopColor={colors.palette.orange} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {geom.scale.ticks.map((t) => {
          const y = geom.yAt(t)
          return (
            <G key={t}>
              <Line x1={PAD_L} y1={y} x2={width - PAD_R} y2={y} stroke={colors.border} strokeWidth={1} />
              <SvgText x={PAD_L - 6} y={y + 3} fontSize={9} fill={colors.textMuted} textAnchor="end">
                {formatCompact(t)}
              </SvgText>
            </G>
          )
        })}

        <Path d={geom.area} fill="url(#calFill)" />
        <Path d={smoothPath(geom.pts)} stroke={colors.palette.orange} strokeWidth={2.5} fill="none" />

        {buckets.map((b, i) =>
          i % labelStep === 0 ? (
            <SvgText
              key={b.key}
              x={geom.xAt(i)}
              y={PLOT_H - 7}
              fontSize={9}
              fill={colors.textMuted}
              textAnchor="middle"
            >
              {b.tick}
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
              stroke={colors.textSubtle}
              strokeWidth={1}
            />
            <Circle
              cx={geom.xAt(active)}
              cy={geom.pts[active].y}
              r={4.5}
              fill={colors.palette.orange}
              stroke={colors.surface}
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

function Tooltip({ point, x, width }: { point: LoadBucket; x: number; width: number }) {
  const { colors } = useTheme()

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
      <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800', marginBottom: 2 }}>
        {point.label}
      </Text>
      <Text style={{ color: colors.palette.orange, fontSize: 12, fontWeight: '700' }}>
        🔥 {formatThousands(point.calories)} kcal
      </Text>
    </View>
  )
}
