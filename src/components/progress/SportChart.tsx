import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg'
import ChartCard from './ChartCard'
import { formatCompact, niceScale, roundedTopBar } from './chartUtils'
import { COLORS } from '../../constants/theme'
import { formatThousands } from '../../utils/formatting'
import type { SportPoint } from '../../utils/progressMetrics'

const PLOT_H = 190
const PAD_L = 34
const PAD_R = 8
const PAD_T = 18
const PAD_B = 14

interface SportChartProps {
  sports: SportPoint[]
  delay?: number
}

/**
 * Total training load per sport, one bar each, coloured by sport and sorted
 * descending — a glance at where effort actually goes. Tap a bar for its exact
 * AU and session count.
 */
export default function SportChart({ sports, delay = 0 }: SportChartProps) {
  return (
    <ChartCard title="Training Load by Sport" subtitle="Where your effort goes" delay={delay}>
      {(width) => <SportPlot sports={sports} width={width} />}
    </ChartCard>
  )
}

function SportPlot({ sports, width }: { sports: SportPoint[]; width: number }) {
  const [active, setActive] = useState<number | null>(null)

  const n = sports.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    const maxLoad = sports.reduce((m, s) => Math.max(m, s.load), 0)
    const scale = niceScale(0, maxLoad, 4)
    const band = n > 0 ? plotW / n : plotW
    const barW = Math.min(46, band * 0.56)
    const yAt = (v: number) =>
      PAD_T + plotH - ((v - scale.min) / (scale.max - scale.min || 1)) * plotH
    const bars = sports.map((s, i) => {
      const cx = PAD_L + (i + 0.5) * band
      const top = yAt(s.load)
      return { s, cx, x: cx - barW / 2, top, barW }
    })
    return { scale, bars, yBase: yAt(0) }
  }, [sports, n, plotW, plotH])

  if (n === 0) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 13, color: COLORS.subtle }}>No sessions in this range</Text>
      </View>
    )
  }

  const activeBar = active != null ? geom.bars[active] : null

  return (
    <View>
      <Svg width={width} height={PLOT_H}>
        {/* Gridlines + y labels */}
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
          <G key={b.s.sport}>
            <Path
              d={roundedTopBar(b.x, b.top, b.barW, geom.yBase, 4)}
              fill={b.s.color}
              opacity={active == null || active === i ? 1 : 0.4}
              onPress={() => setActive(active === i ? null : i)}
            />
            <SvgText
              x={b.cx}
              y={b.top - 5}
              fontSize={9.5}
              fontWeight="700"
              fill={COLORS.body}
              textAnchor="middle"
            >
              {formatCompact(b.s.load)}
            </SvgText>
          </G>
        ))}
      </Svg>

      {/* Emoji + name axis, rendered as native Text so emoji display reliably */}
      <View style={{ flexDirection: 'row', paddingLeft: PAD_L, width: PAD_L + plotW }}>
        {sports.map((s) => (
          <View key={s.sport} style={{ flex: 1, alignItems: 'center' }}>
            <Text style={{ fontSize: 15 }}>{s.icon}</Text>
            <Text
              numberOfLines={1}
              style={{ fontSize: 9.5, color: COLORS.muted, marginTop: 1, maxWidth: '96%' }}
            >
              {s.label.split(' ')[0]}
            </Text>
          </View>
        ))}
      </View>

      {activeBar ? (
        <Tooltip
          point={activeBar.s}
          cx={activeBar.cx}
          width={width}
        />
      ) : null}
    </View>
  )
}

function Tooltip({ point, cx, width }: { point: SportPoint; cx: number; width: number }) {
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
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: point.color, marginRight: 6 }} />
        <Text style={{ color: COLORS.white, fontSize: 12, fontWeight: '800' }}>
          {point.icon} {point.label}
        </Text>
      </View>
      <Text style={{ color: '#D1D5DB', fontSize: 11 }}>
        <Text style={{ color: COLORS.white, fontWeight: '700' }}>{formatThousands(point.load)}</Text> AU
        {'  ·  '}
        <Text style={{ color: COLORS.white, fontWeight: '700' }}>{point.sessions}</Text>{' '}
        {point.sessions === 1 ? 'session' : 'sessions'}
      </Text>
    </View>
  )
}
