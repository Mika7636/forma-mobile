// Training load bars with the sustainable-range band behind them.

import { useMemo, useState } from 'react'
import { Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
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
import { formatCompact, linePath, paddedScale, type Point } from './chartUtils'
import ModelReadout from './ModelReadout'
import TabIcon, { type TabIconName } from '../ui/TabIcon'
import { formatThousands } from '../../utils/formatting'
import type {
  BucketStanding,
  LoadBand,
  LoadVerdict,
  ModelReadout as ModelReadoutData,
  TrendSeries,
} from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle, type Palette } from '../../theme/tokens'

const PAD_T = 14
const PAD_B = 22
const PLOT_H = 200 + PAD_T + PAD_B
const PAD_L = 34
const PAD_R = 8

export const PLOT_INSET = { left: PAD_L, right: PAD_R } as const

const TIP_W = 152

const DOT_R = 3.6
const DOT_R_ACTIVE = 5.5

const LEGEND: { standing: BucketStanding; chip: string }[] = [
  { standing: 'above', chip: 'Above' },
  { standing: 'inside', chip: 'In range' },
  { standing: 'below', chip: 'Below' },
]

export function standingColor(standing: BucketStanding, colors: Palette): string {
  if (standing === 'above') return colors.warn
  if (standing === 'below') return colors.textMuted
  return colors.accent
}

interface TrainingLoadChartProps {
  series: TrendSeries
  model?: ModelReadoutData | null
}

export default function TrainingLoadChart({ series, model = null }: TrainingLoadChartProps) {
  const { colors } = useTheme()

  const [width, setWidth] = useState(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (Math.abs(w - width) > 0.5) setWidth(w)
  }

  return (
    <View style={cardStyle(colors)}>
      <LegendChips />

      <View style={{ marginTop: SPACING.md }} onLayout={onLayout}>
        {width > 0 ? (
          <LoadPlot
            key={series.caption}
            points={series.points}
            band={series.band}
            width={width}
          />
        ) : null}
      </View>

      <Text
        style={{
          marginTop: SPACING.md,
          fontSize: TYPE.small,
          fontWeight: WEIGHT.semibold,
          color: colors.textMuted,
        }}
      >
        {series.caption}
      </Text>

      <VerdictLine verdict={series.verdict} />

      {model ? <ModelReadout model={model} /> : null}
    </View>
  )
}

function verdictStyle(tone: LoadVerdict['tone'], colors: Palette) {
  if (tone === 'above') {
    return { rail: colors.warn, ink: colors.warnText, icon: 'alert-triangle' as TabIconName }
  }
  if (tone === 'below') {
    return { rail: colors.textMuted, ink: colors.textBody, icon: 'trending-down' as TabIconName }
  }
  if (tone === 'inside') {
    return { rail: colors.accent, ink: colors.accentText, icon: 'check-circle' as TabIconName }
  }
  return { rail: colors.textMuted, ink: colors.textBody, icon: 'info' as TabIconName }
}

function VerdictLine({ verdict }: { verdict: LoadVerdict }) {
  const { colors } = useTheme()

  const style = verdictStyle(verdict.tone, colors)

  return (
    <View
      accessibilityRole="summary"
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: SPACING.md,
        paddingLeft: SPACING.md,
        borderLeftWidth: 3,
        borderLeftColor: style.rail,
      }}
    >
      <TabIcon name={style.icon} size={16} color={style.rail} focused />
      <Text
        numberOfLines={2}
        style={{ flex: 1, marginLeft: SPACING.sm, fontSize: TYPE.small, lineHeight: 18 }}
      >
        <Text style={{ fontWeight: WEIGHT.heavy, color: style.ink }}>{verdict.headline}</Text>
        <Text style={{ color: colors.textMuted }}> — {verdict.detail}.</Text>
      </Text>
    </View>
  )
}

function LegendChips() {
  const { colors } = useTheme()

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
      {LEGEND.map((entry, i) => (
        <View key={entry.standing} style={{ flexDirection: 'row', alignItems: 'center' }}>
          {i > 0 ? (
            <Text style={{ fontSize: TYPE.caption, color: colors.textSubtle, marginHorizontal: 8 }}>
              ·
            </Text>
          ) : null}
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 4.5,
              backgroundColor: standingColor(entry.standing, colors),
              marginRight: 6,
            }}
          />
          <Text style={{ fontSize: TYPE.caption, color: colors.textBody }}>{entry.chip}</Text>
        </View>
      ))}
    </View>
  )
}

function LoadPlot({
  points,
  band,
  width,
}: {
  points: TrendSeries['points']
  band: LoadBand | null
  width: number
}) {
  const { colors } = useTheme()

  const [active, setActive] = useState<number | null>(null)
  const [tipH, setTipH] = useState(0)

  const n = points.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    const maxLoad = points.reduce((m, p) => Math.max(m, p.load), 0)
    const ceiling = Math.max(maxLoad, band?.high ?? 0, 1) * 1.15
    const scale = paddedScale(ceiling, 1, 3)
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    const slot = n > 0 ? plotW / n : plotW
    const xAt = (i: number) => PAD_L + (i + 0.5) * slot
    const coords: Point[] = points.map((p, i) => ({ x: xAt(i), y: yAt(p.load) }))
    return { scale, yAt, xAt, slot, maxLoad, coords, yBase: yAt(0) }
  }, [points, band, n, plotW, plotH])

  if (n === 0 || (geom.maxLoad === 0 && !band)) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in this window
        </Text>
      </View>
    )
  }

  const onTap = (e: GestureResponderEvent) => {
    const { locationX, locationY } = e.nativeEvent
    const inside =
      locationX >= PAD_L &&
      locationX <= PAD_L + plotW &&
      locationY >= PAD_T &&
      locationY <= PAD_T + plotH
    if (!inside) {
      setActive(null)
      return
    }
    const index = Math.max(0, Math.min(n - 1, Math.floor((locationX - PAD_L) / geom.slot)))
    setActive((current) => (current === index ? null : index))
  }

  const activeIndex = active != null && active < n ? active : null
  const activePoint = activeIndex != null ? points[activeIndex] : null
  const activeCoord = activeIndex != null ? geom.coords[activeIndex] : null

  const bandTop = band ? geom.yAt(band.high) : 0
  const bandBottom = band ? geom.yAt(band.low) : 0
  const captionY = bandTop - 5 < PAD_T + 9 ? bandTop + 12 : bandTop - 5

  const line = linePath(geom.coords)
  const area =
    geom.coords.length > 0
      ? `${line} L ${geom.coords[geom.coords.length - 1].x.toFixed(2)} ${geom.yBase.toFixed(2)} ` +
        `L ${geom.coords[0].x.toFixed(2)} ${geom.yBase.toFixed(2)} Z`
      : ''

  return (
    <View onStartShouldSetResponder={() => true} onResponderRelease={onTap}>
      <Svg width={width} height={PLOT_H}>
        <Defs>
          <LinearGradient id="loadArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {band ? (
          <G>
            <Rect
              x={PAD_L}
              y={bandTop}
              width={plotW}
              height={Math.max(1, bandBottom - bandTop)}
              fill={colors.accent}
              opacity={0.1}
            />
            <SvgText
              x={width - PAD_R}
              y={captionY}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="end"
            >
              your range
            </SvgText>
          </G>
        ) : null}

        {geom.scale.ticks.map((t) => (
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

        {area ? <Path d={area} fill="url(#loadArea)" /> : null}

        <Path
          d={line}
          stroke={colors.accent}
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />

        {activeCoord ? (
          <Line
            x1={activeCoord.x}
            y1={PAD_T}
            x2={activeCoord.x}
            y2={PAD_T + plotH}
            stroke={colors.borderStrong}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}

        {points.map((point, i) => {
          const coord = geom.coords[i]
          const fill = point.standing ? standingColor(point.standing, colors) : colors.accent
          return (
            <G key={point.key}>
              <Circle
                cx={coord.x}
                cy={coord.y}
                r={activeIndex === i ? DOT_R_ACTIVE : DOT_R}
                fill={fill}
                stroke={colors.surface}
                strokeWidth={1.5}
                opacity={point.partial ? 0.5 : 1}
              />
              <SvgText
                x={coord.x}
                y={PLOT_H - 5}
                fontSize={10}
                fontWeight="600"
                fill={colors.textMuted}
                textAnchor="middle"
              >
                {point.tick}
              </SvgText>
            </G>
          )
        })}
      </Svg>

      {activePoint && activeCoord ? (
        <Tooltip
          point={activePoint}
          band={band}
          cx={activeCoord.x}
          anchorY={activeCoord.y}
          width={width}
          height={tipH}
          onMeasure={setTipH}
        />
      ) : null}
    </View>
  )
}

function Tooltip({
  point,
  band,
  cx,
  anchorY,
  width,
  height,
  onMeasure,
}: {
  point: TrendSeries['points'][number]
  band: LoadBand | null
  cx: number
  anchorY: number
  width: number
  height: number
  onMeasure: (h: number) => void
}) {
  const { colors } = useTheme()

  const left = Math.max(0, Math.min(width - TIP_W, cx - TIP_W / 2))
  const top = Math.max(0, Math.min(PLOT_H - height, anchorY - height - 12))

  const standingText = point.partial
    ? 'Still in progress'
    : point.standing === 'above'
      ? 'Above your range'
      : point.standing === 'below'
        ? 'Below your range'
        : point.standing === 'inside'
          ? 'In your range'
          : null

  const onLayout = (e: LayoutChangeEvent) => {
    const h = e.nativeEvent.layout.height
    if (Math.abs(h - height) > 0.5) onMeasure(h)
  }

  return (
    <View
      pointerEvents="none"
      onLayout={onLayout}
      style={{
        position: 'absolute',
        top,
        left,
        width: TIP_W,
        opacity: height > 0 ? 1 : 0,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.borderStrong,
        borderRadius: RADIUS.sm,
        paddingVertical: 7,
        paddingHorizontal: 9,
        ...colors.shadowFloating,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: TYPE.caption,
          fontWeight: WEIGHT.heavy,
          marginBottom: 2,
        }}
      >
        {point.label}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: TYPE.caption }}>
        <Text style={{ color: colors.text, fontWeight: WEIGHT.bold }}>
          {formatThousands(point.load)}
        </Text>{' '}
        AU{'  ·  '}
        <Text style={{ color: colors.text, fontWeight: WEIGHT.bold }}>{point.sessions}</Text>{' '}
        {point.sessions === 1 ? 'session' : 'sessions'}
      </Text>
      {standingText ? (
        <Text style={{ marginTop: 3, color: colors.textSubtle, fontSize: TYPE.caption }}>
          {standingText}
          {band && !point.partial
            ? ` (${formatThousands(band.low)}–${formatThousands(band.high)})`
            : ''}
        </Text>
      ) : null}
    </View>
  )
}
