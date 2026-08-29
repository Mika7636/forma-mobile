import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import ChartCard from './ChartCard'
import { formatCompact, niceScale, roundedTopBar } from './chartUtils'
import { formatThousands } from '../../utils/formatting'
import type {
  BucketStanding,
  Granularity,
  LoadBand,
  LoadBucket,
  LoadVerdict,
} from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, type Palette } from '../../theme/tokens'

const PLOT_H = 200
const PAD_L = 36
const PAD_R = 10
const PAD_T = 16
const PAD_B = 24

/** What each bar colour means, in words an athlete would use. */
const LEGEND: { standing: BucketStanding; text: string }[] = [
  { standing: 'above', text: 'Above your range — ramping fast' },
  { standing: 'inside', text: 'In your range — building safely' },
  { standing: 'below', text: 'Below your range — easing off' },
]

/**
 * The colour a bar takes from where it sits against the band.
 *
 * The one place this mapping lives, so the legend swatches and the bars can
 * never disagree — which is the whole basis on which the chart is read.
 */
function standingColor(standing: BucketStanding, colors: Palette): string {
  if (standing === 'above') return colors.warn
  if (standing === 'below') return colors.textMuted
  return colors.accent
}

const SUBTITLE: Record<Granularity, string> = {
  daily: 'One bar per day',
  weekly: 'One bar per week',
  monthly: 'One bar per month',
}

interface TrainingLoadChartProps {
  buckets: LoadBucket[]
  band: LoadBand | null
  verdict: LoadVerdict
  granularity: Granularity
  /** The date span the buckets cover, for the card's subtitle. */
  rangeLabel: string
  delay?: number
}

/**
 * The screen's primary chart: how much training went in, against how much this
 * athlete can currently absorb.
 *
 * It replaced a three-line Fitness/Fatigue/Form plot. That chart is a good
 * picture of the model and a poor picture of the athlete's week — reading it
 * required knowing what CTL and ATL are, and what their difference means. This
 * asks one question instead ("am I doing about the right amount?") and answers
 * it with a bar and a shaded band, which needs no vocabulary at all.
 *
 * The model itself is unchanged and still runs underneath: the band *is* CTL,
 * scaled to the bucket length. It moved from being the subject of the chart to
 * being the reference the chart is read against.
 */
export default function TrainingLoadChart({
  buckets,
  band,
  verdict,
  granularity,
  rangeLabel,
  delay = 0,
}: TrainingLoadChartProps) {
  return (
    <ChartCard
      title="Training Load"
      subtitle={`${rangeLabel} · ${SUBTITLE[granularity]}`}
      delay={delay}
      legend={<Legend />}
    >
      {(width) => (
        <LoadPlot buckets={buckets} band={band} verdict={verdict} width={width} />
      )}
    </ChartCard>
  )
}

/**
 * The verdict, above the chart.
 *
 * Deliberately a sentence and not a number. The athlete's question at the top of
 * this screen is "is what I'm doing sensible", and a headline that answers it
 * outright means the chart underneath is confirmation rather than homework.
 */
export function LoadVerdictHeader({ verdict }: { verdict: LoadVerdict }) {
  const { colors } = useTheme()

  const tone =
    verdict.tone === 'above'
      ? colors.tint.amber
      : verdict.tone === 'below'
        ? colors.tint.sky
        : verdict.tone === 'inside'
          ? colors.tint.green
          : colors.tint.teal

  return (
    <View
      style={{
        backgroundColor: tone.bg,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: tone.border,
        padding: SPACING.base,
      }}
    >
      <Text style={{ fontSize: TYPE.title, fontWeight: WEIGHT.heavy, color: tone.text }}>
        {verdict.headline}
      </Text>
      <Text
        style={{
          marginTop: SPACING.xs,
          fontSize: TYPE.small,
          lineHeight: 19,
          color: colors.textBody,
        }}
      >
        {verdict.detail}
      </Text>
    </View>
  )
}

function Legend() {
  const { colors } = useTheme()

  return (
    <View style={{ gap: 6 }}>
      {LEGEND.map((entry) => (
        <View key={entry.standing} style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 3,
              backgroundColor: standingColor(entry.standing, colors),
              marginRight: 8,
            }}
          />
          <Text style={{ fontSize: TYPE.micro, color: colors.textBody }}>{entry.text}</Text>
        </View>
      ))}
    </View>
  )
}

function LoadPlot({
  buckets,
  band,
  width,
}: {
  buckets: LoadBucket[]
  band: LoadBand | null
  verdict: LoadVerdict
  width: number
}) {
  const { colors } = useTheme()

  const [active, setActive] = useState<number | null>(null)

  const n = buckets.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B
  // Fewer x labels as the bar count grows, so ticks never collide.
  const labelStep = n > 12 ? 2 : 1

  const geom = useMemo(() => {
    const maxLoad = buckets.reduce((m, b) => Math.max(m, b.load), 0)
    // The band has to be *visible* even in a light week, or "below your range"
    // is asserted by a colour with nothing on screen to justify it. Including
    // its top in the scale guarantees the whole band is always in frame.
    const ceiling = Math.max(maxLoad, band?.high ?? 0)
    const scale = niceScale(0, ceiling, 4)
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    const slot = n > 0 ? plotW / n : plotW
    const barW = Math.min(34, slot * 0.62)
    const bars = buckets.map((bucket, i) => {
      const cx = PAD_L + (i + 0.5) * slot
      return { bucket, cx, x: cx - barW / 2, top: yAt(bucket.load), barW }
    })
    return { scale, bars, yBase: yAt(0), yAt }
  }, [buckets, band, n, plotW, plotH])

  if (n === 0) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in this range
        </Text>
      </View>
    )
  }

  const activeBar = active != null ? geom.bars[active] : null
  const bandTop = band ? geom.yAt(band.high) : 0
  const bandBottom = band ? geom.yAt(band.low) : 0

  return (
    <View>
      <Svg width={width} height={PLOT_H}>
        {/* Gridlines first, so the band washes over them rather than under. */}
        {geom.scale.ticks.map((t) => (
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
              y={geom.yAt(t) + 3}
              fontSize={9}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {formatCompact(t)}
            </SvgText>
          </G>
        ))}

        {/* The sustainable band: a soft accent wash with faint edges. Drawn
            behind the bars so it reads as the ground they stand against, not as
            another series competing with them. */}
        {band ? (
          <G>
            <Rect
              x={PAD_L}
              y={bandTop}
              width={plotW}
              height={Math.max(1, bandBottom - bandTop)}
              fill={colors.accent}
              opacity={0.14}
            />
            <Line
              x1={PAD_L}
              y1={bandTop}
              x2={width - PAD_R}
              y2={bandTop}
              stroke={colors.accent}
              strokeWidth={1}
              opacity={0.45}
            />
            <Line
              x1={PAD_L}
              y1={bandBottom}
              x2={width - PAD_R}
              y2={bandBottom}
              stroke={colors.accent}
              strokeWidth={1}
              opacity={0.45}
            />
          </G>
        ) : null}

        {geom.bars.map((bar, i) => {
          const { bucket } = bar
          const fill = bucket.standing
            ? standingColor(bucket.standing, colors)
            : colors.accent
          return (
            <G key={bucket.key}>
              <Path
                d={roundedTopBar(bar.x, bar.top, bar.barW, geom.yBase, 4)}
                fill={fill}
                // An unfinished bucket is drawn at half strength: it is real
                // data, but it is not a result yet, and at full weight a
                // three-day-old week reads as a bad week.
                opacity={
                  (bucket.partial ? 0.45 : 1) * (active == null || active === i ? 1 : 0.45)
                }
                onPress={() => setActive(active === i ? null : i)}
              />
              {i % labelStep === 0 ? (
                <SvgText
                  x={bar.cx}
                  y={PLOT_H - 6}
                  fontSize={9}
                  fill={colors.textMuted}
                  textAnchor="middle"
                >
                  {bucket.tick}
                </SvgText>
              ) : null}
            </G>
          )
        })}
      </Svg>

      {activeBar ? (
        <Tooltip bucket={activeBar.bucket} band={band} cx={activeBar.cx} width={width} />
      ) : null}
    </View>
  )
}

function Tooltip({
  bucket,
  band,
  cx,
  width,
}: {
  bucket: LoadBucket
  band: LoadBand | null
  cx: number
  width: number
}) {
  const { colors } = useTheme()

  const BUBBLE_W = 168
  const left = Math.max(4, Math.min(width - BUBBLE_W - 4, cx - BUBBLE_W / 2))

  const standingText = bucket.partial
    ? 'Still in progress'
    : bucket.standing === 'above'
      ? 'Above your range'
      : bucket.standing === 'below'
        ? 'Below your range'
        : bucket.standing === 'inside'
          ? 'In your range'
          : null

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left,
        width: BUBBLE_W,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: RADIUS.sm,
        paddingVertical: 8,
        paddingHorizontal: 10,
      }}
    >
      <Text
        style={{
          color: colors.text,
          fontSize: TYPE.micro,
          fontWeight: WEIGHT.heavy,
          marginBottom: 2,
        }}
      >
        {bucket.label}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: TYPE.caption }}>
        <Text style={{ color: colors.text, fontWeight: WEIGHT.bold }}>
          {formatThousands(bucket.load)}
        </Text>{' '}
        AU{'  ·  '}
        <Text style={{ color: colors.text, fontWeight: WEIGHT.bold }}>{bucket.sessions}</Text>{' '}
        {bucket.sessions === 1 ? 'session' : 'sessions'}
      </Text>
      {standingText ? (
        <Text style={{ marginTop: 3, color: colors.textSubtle, fontSize: TYPE.caption }}>
          {standingText}
          {band && !bucket.partial
            ? ` (${formatThousands(band.low)}–${formatThousands(band.high)})`
            : ''}
        </Text>
      ) : null}
    </View>
  )
}
