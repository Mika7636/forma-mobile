import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg'
import ChartCard from './ChartCard'
import { formatCompact, niceScale, roundedTopBar } from './chartUtils'
import { COLORS } from '../../constants/theme'
import { formatThousands } from '../../utils/formatting'
import type { WeeklyPoint } from '../../utils/progressMetrics'

const PLOT_H = 176
const PAD_L = 34
const PAD_R = 8
const PAD_T = 16
const PAD_B = 22

interface WeeklyLoadChartProps {
  weekly: WeeklyPoint[]
  delay?: number
}

/**
 * Weekly total load, one teal bar per week. Reading the ramp is the point — big
 * week-on-week jumps are the classic injury-risk signal — so bars share a single
 * colour and the eye tracks their heights. Tap a bar for the week's range.
 */
export default function WeeklyLoadChart({ weekly, delay = 0 }: WeeklyLoadChartProps) {
  return (
    <ChartCard
      title="Weekly Training Load"
      subtitle="Watch your ramp — big jumps mean risk"
      delay={delay}
    >
      {(width) => <WeeklyPlot weekly={weekly} width={width} />}
    </ChartCard>
  )
}

function WeeklyPlot({ weekly, width }: { weekly: WeeklyPoint[]; width: number }) {
  const [active, setActive] = useState<number | null>(null)

  const n = weekly.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B
  // Fewer x labels as the range widens so "Wk n" ticks never collide.
  const labelStep = n > 8 ? 2 : 1

  const geom = useMemo(() => {
    const maxLoad = weekly.reduce((m, w) => Math.max(m, w.load), 0)
    const scale = niceScale(0, maxLoad, 4)
    const band = n > 0 ? plotW / n : plotW
    const barW = Math.min(40, band * 0.6)
    const yAt = (v: number) =>
      PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH
    const bars = weekly.map((w, i) => {
      const cx = PAD_L + (i + 0.5) * band
      return { w, cx, x: cx - barW / 2, top: yAt(w.load), barW }
    })
    return { scale, bars, yBase: yAt(0) }
  }, [weekly, n, plotW, plotH])

  if (n === 0) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, color: COLORS.subtle }}>No data in this range</Text>
      </View>
    )
  }

  const activeBar = active != null ? geom.bars[active] : null

  return (
    <View>
      <Svg width={width} height={PLOT_H}>
        {geom.scale.ticks.map((t) => {
          const y = geom.yBase - ((t - geom.scale.min) / (geom.scale.max - geom.scale.min || 1)) * plotH
          return (
            <G key={t}>
              <Line x1={PAD_L} y1={y} x2={width - PAD_R} y2={y} stroke={COLORS.border} strokeWidth={1} />
              <SvgText x={PAD_L - 6} y={y + 3} fontSize={9} fill={COLORS.subtle} textAnchor="end">
                {formatCompact(t)}
              </SvgText>
            </G>
          )
        })}

        {geom.bars.map((b, i) => (
          <G key={b.w.weekStartISO}>
            <Path
              d={roundedTopBar(b.x, b.top, b.barW, geom.yBase, 4)}
              fill={COLORS.teal}
              opacity={active == null || active === i ? 1 : 0.4}
              onPress={() => setActive(active === i ? null : i)}
            />
            {i % labelStep === 0 ? (
              <SvgText x={b.cx} y={PLOT_H - 6} fontSize={9} fill={COLORS.subtle} textAnchor="middle">
                {b.w.weekLabel}
              </SvgText>
            ) : null}
          </G>
        ))}
      </Svg>

      {activeBar ? <Tooltip point={activeBar.w} cx={activeBar.cx} width={width} /> : null}
    </View>
  )
}

function Tooltip({ point, cx, width }: { point: WeeklyPoint; cx: number; width: number }) {
  const BUBBLE_W = 150
  const left = Math.max(4, Math.min(width - BUBBLE_W - 4, cx - BUBBLE_W / 2))
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
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
      <Text style={{ color: '#D1D5DB', fontSize: 11 }}>
        <Text style={{ color: COLORS.white, fontWeight: '700' }}>{formatThousands(point.load)}</Text> AU
        {'  ·  '}
        <Text style={{ color: COLORS.white, fontWeight: '700' }}>{point.sessions}</Text>{' '}
        {point.sessions === 1 ? 'session' : 'sessions'}
      </Text>
    </View>
  )
}
