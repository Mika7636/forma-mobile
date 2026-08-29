import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { G, Line, Path, Text as SvgText } from 'react-native-svg'
import ChartCard from './ChartCard'
import { formatCompact, niceScale, roundedTopBar } from './chartUtils'
import { formatThousands } from '../../utils/formatting'
import type { SportPoint } from '../../utils/progressMetrics'
import { sportVisual } from '../../utils/sportMeta'
import { useTheme } from '../../theme/ThemeProvider'

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
  const { colors } = useTheme()

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
        <Text style={{ fontSize: 13, color: colors.textSubtle }}>No sessions in this range</Text>
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
              <Line x1={PAD_L} y1={y} x2={width - PAD_R} y2={y} stroke={colors.border} strokeWidth={1} />
              <SvgText x={PAD_L - 6} y={y + 3} fontSize={9} fill={colors.textMuted} textAnchor="end">
                {formatCompact(t)}
              </SvgText>
            </G>
          )
        })}

        {geom.bars.map((b, i) => (
          <G key={b.s.sport}>
            <Path
              d={roundedTopBar(b.x, b.top, b.barW, geom.yBase, 4)}
              fill={sportVisual(b.s.sport, colors).color}
              opacity={active == null || active === i ? 1 : 0.4}
              onPress={() => setActive(active === i ? null : i)}
            />
            <SvgText
              x={b.cx}
              y={b.top - 5}
              fontSize={9.5}
              fontWeight="700"
              fill={colors.textBody}
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
              style={{ fontSize: 10, color: colors.textMuted, marginTop: 1, maxWidth: '96%' }}
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
  const { colors } = useTheme()

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
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 3 }}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: sportVisual(point.sport, colors).color,
            marginRight: 6,
          }}
        />
        <Text style={{ color: colors.text, fontSize: 12, fontWeight: '800' }}>
          {point.icon} {point.label}
        </Text>
      </View>
      <Text style={{ color: colors.textBody, fontSize: 11 }}>
        <Text style={{ color: colors.text, fontWeight: '700' }}>{formatThousands(point.load)}</Text> AU
        {'  ·  '}
        <Text style={{ color: colors.text, fontWeight: '700' }}>{point.sessions}</Text>{' '}
        {point.sessions === 1 ? 'session' : 'sessions'}
      </Text>
    </View>
  )
}
