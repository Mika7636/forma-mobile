import { useMemo, useState } from 'react'
import { Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import ChartCard from './ChartCard'
import { formatCompact, paddedScale, roundedTopBar, sampleIndices } from './chartUtils'
import TabIcon, { type TabIconName } from '../ui/TabIcon'
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

/**
 * Plot geometry.
 *
 * `PLOT_H − PAD_T − PAD_B` is exactly 200: the drawable plot, not the SVG, is
 * what the reader sees as "the chart", so the 200pt floor is applied there.
 */
const PAD_T = 14
const PAD_B = 22
const PLOT_H = 200 + PAD_T + PAD_B
const PAD_L = 34
const PAD_R = 8

/**
 * The plot's horizontal inset inside a chart card — the room the y-axis takes
 * on the left and the trailing gap on the right.
 *
 * Exported because anything that claims to share this chart's time axis has to
 * share its gutters too: the conflict timeline's bucket `i` only sits under
 * bar `i` if both are divided across the *same* span. Both cards have identical
 * width and padding, so matching the inset is all the alignment needs.
 */
export const PLOT_INSET = { left: PAD_L, right: PAD_R } as const

/** Most x-axis labels a phone-width frame can carry without them touching. */
const MAX_X_LABELS = 5

/** The tooltip's fixed width; its height is measured, since the copy varies. */
const TIP_W = 152

/** What each bar colour means, in full — behind the header's info button. */
const LEGEND: { standing: BucketStanding; chip: string; text: string }[] = [
  { standing: 'above', chip: 'Above', text: 'Above your range — ramping faster than you adapt' },
  { standing: 'inside', chip: 'In range', text: 'Inside your range — building safely' },
  { standing: 'below', chip: 'Below', text: 'Below your range — easing off' },
]

/**
 * The colour a bar takes from where it sits against the band.
 *
 * The one place this mapping lives, so the legend chips and the bars can never
 * disagree — which is the whole basis on which the chart is read.
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
      legend={<LegendChips />}
      info={<LegendDetail band={band} />}
      infoLabel="What the training load colours mean"
    >
      {(width) => (
        <LoadPlot buckets={buckets} band={band} granularity={granularity} width={width} />
      )}
    </ChartCard>
  )
}

/* ------------------------------------------------------------------ */
/* The verdict headline                                                */
/* ------------------------------------------------------------------ */

/** How the headline card is painted for each verdict state. */
function verdictStyle(tone: LoadVerdict['tone'], colors: Palette) {
  if (tone === 'above') {
    return {
      bg: colors.tint.amber.bg,
      border: colors.tint.amber.border,
      rail: colors.warn,
      ink: colors.tint.amber.text,
      icon: 'alert-triangle' as TabIconName,
    }
  }
  if (tone === 'below') {
    // No `tint` entry is right here. Easing off is not a warning and not a
    // success, and borrowing sky or teal for it would say "this is a state with
    // a meaning" when the meaning is precisely that nothing is happening. So it
    // takes the neutral surface, and the muted grey the *bars* already use for
    // a below-range bucket — the card and the chart agree by construction.
    return {
      bg: colors.surfaceAlt,
      border: colors.border,
      rail: colors.textMuted,
      ink: colors.textBody,
      icon: 'trending-down' as TabIconName,
    }
  }
  if (tone === 'inside') {
    return {
      bg: colors.tint.green.bg,
      border: colors.tint.green.border,
      rail: colors.accent,
      ink: colors.tint.green.text,
      icon: 'check-circle' as TabIconName,
    }
  }
  return {
    bg: colors.tint.teal.bg,
    border: colors.tint.teal.border,
    rail: colors.tint.teal.text,
    ink: colors.tint.teal.text,
    icon: 'info' as TabIconName,
  }
}

/**
 * The verdict, above the chart.
 *
 * Deliberately a sentence and not a number. The athlete's question at the top of
 * this screen is "is what I'm doing sensible", and a headline that answers it
 * outright means the chart underneath is confirmation rather than homework.
 *
 * It used to be sky-tinted in the "easing off" state and teal in the unknown
 * one, which put two blues at the top of a green-branded screen and, worse,
 * coloured the card by *nothing in particular* — the tint was decoration. It now
 * takes the same three colours the bars do, so the headline and the chart under
 * it are the same statement said twice.
 */
export function LoadVerdictHeader({ verdict }: { verdict: LoadVerdict }) {
  const { colors } = useTheme()

  const style = verdictStyle(verdict.tone, colors)

  return (
    <View
      accessibilityRole="summary"
      style={{
        flexDirection: 'row',
        backgroundColor: style.bg,
        borderRadius: RADIUS.card,
        borderWidth: 1,
        borderColor: style.border,
        // The rail is what carries the state at a glance from across the room,
        // and it is a second, non-colour channel: even where the tint is nearly
        // invisible (the neutral "easing off" card) the edge still marks it.
        borderLeftWidth: 4,
        borderLeftColor: style.rail,
        padding: SPACING.base,
        alignItems: 'flex-start',
      }}
    >
      <View style={{ marginRight: SPACING.md, paddingTop: 1 }}>
        <TabIcon name={style.icon} size={22} color={style.rail} focused />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: TYPE.title, fontWeight: WEIGHT.heavy, color: style.ink }}>
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
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Legend                                                              */
/* ------------------------------------------------------------------ */

/**
 * The legend as one row of chips.
 *
 * Three colours and three words. The words are the *state*, not an explanation
 * of it — the explanation is a tap away in the header — because a legend's job
 * is to let you decode a bar you are already looking at, and for that "Above" is
 * as good as a sentence and takes a tenth of the room.
 */
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
              borderRadius: 2.5,
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

/** The long form, shown when the header's info button is open. */
function LegendDetail({ band }: { band: LoadBand | null }) {
  const { colors } = useTheme()

  return (
    <View style={{ gap: 8 }}>
      <Text style={{ fontSize: TYPE.micro, lineHeight: 18, color: colors.textBody }}>
        Your range is the weekly load your current fitness can absorb
        {band ? ` — right now ${formatThousands(band.low)}–${formatThousands(band.high)} AU` : ''}.
        Each bar is coloured by where it landed against it.
      </Text>
      {LEGEND.map((entry) => (
        <View key={entry.standing} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 2.5,
              backgroundColor: standingColor(entry.standing, colors),
              marginRight: 8,
              marginTop: 4,
            }}
          />
          <Text style={{ flex: 1, fontSize: TYPE.micro, lineHeight: 17, color: colors.textBody }}>
            {entry.text}
          </Text>
        </View>
      ))}
      <Text style={{ fontSize: TYPE.micro, lineHeight: 17, color: colors.textSubtle }}>
        A faded bar is a period still in progress — drawn, but not yet judged.
      </Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* The plot                                                            */
/* ------------------------------------------------------------------ */

function LoadPlot({
  buckets,
  band,
  granularity,
  width,
}: {
  buckets: LoadBucket[]
  band: LoadBand | null
  granularity: Granularity
  width: number
}) {
  const { colors } = useTheme()

  const [active, setActive] = useState<number | null>(null)
  const [tipH, setTipH] = useState(0)

  const n = buckets.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    const maxLoad = buckets.reduce((m, b) => Math.max(m, b.load), 0)
    // The axis fits the *window*, not a round number above it. 1.15× the tallest
    // bar leaves it a little air at the top; the band's own ceiling only has to
    // be in frame, so it is admitted at 1.06× rather than dragging the whole
    // axis up with it. The old version scaled to a nice round number over both,
    // which is how a chart of 800 AU weeks ended up with a 4k y-axis and every
    // bar pinned to the floor.
    const ceiling = Math.max(maxLoad * 1.15, (band?.high ?? 0) * 1.06, 1)
    const scale = paddedScale(ceiling, 1, 4)
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    const slot = n > 0 ? plotW / n : plotW
    // Wide bars: this is a bar chart of a dozen values, not a histogram, and at
    // 62% of a narrow slot they read as rules rather than as quantities.
    const barW = Math.max(6, Math.min(44, slot * 0.78))
    const bars = buckets.map((bucket, i) => {
      const cx = PAD_L + (i + 0.5) * slot
      return { bucket, cx, x: cx - barW / 2, top: yAt(bucket.load), barW }
    })
    // Daily is fourteen bars and one initial each — "M T W T F S S" fits where
    // no date would. Every other grain samples down to what the frame can hold.
    const labelled =
      granularity === 'daily'
        ? bars.map((_, i) => i)
        : sampleIndices(n, MAX_X_LABELS)
    return { scale, bars, slot, maxLoad, yBase: yAt(0), yAt, labelled: new Set(labelled) }
  }, [buckets, band, granularity, n, plotW, plotH])

  // Nothing logged *and* no band to measure it against: there is no axis worth
  // drawing, and forcing one gives a ceiling of 1 AU with gridlines at 0.2
  // intervals — six ticks all rounding to "0". A sentence is the honest render.
  if (n === 0 || (geom.maxLoad === 0 && !band)) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in this range
        </Text>
      </View>
    )
  }

  /**
   * Tap-to-select, over the whole column rather than the bar itself.
   *
   * Done on the wrapping `View`'s responder rather than with `onPress` on each
   * `Path`, for two reasons: a zero-load bar has no bar to press, and a tap that
   * lands anywhere *else* has to clear the selection — which is the behaviour
   * that turned the tooltip from a permanent fixture into a tooltip.
   *
   * `onStartShouldSetResponder` only, never `onMoveShouldSetResponder`: the
   * latter makes the chart greedy and hijacks any page scroll whose finger
   * happens to cross it.
   */
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

  // Switching grain re-renders this component with a different bucket count
  // under the same `active` index. Without the bounds check a selection of 13
  // made in the daily view survives into the twelve-bar weekly one, where it
  // matches no bar — and every bar dims to "not the selected one".
  const activeIndex = active != null && active < n ? active : null
  const activeBar = activeIndex != null ? geom.bars[activeIndex] : null
  const bandTop = band ? geom.yAt(band.high) : 0
  const bandBottom = band ? geom.yAt(band.low) : 0
  // The caption sits above the upper edge, unless the edge is near the top of
  // the frame — then it drops inside the band, which always has room for it.
  const captionY = bandTop - 5 < PAD_T + 9 ? bandTop + 12 : bandTop - 5

  return (
    <View onStartShouldSetResponder={() => true} onResponderRelease={onTap}>
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
              y={geom.yAt(t) + 3.5}
              fontSize={10}
              fill={colors.textMuted}
              textAnchor="end"
            >
              {formatCompact(t)}
            </SvgText>
          </G>
        ))}

        {/* The sustainable band. Drawn behind the bars so it reads as the ground
            they stand on rather than as another series competing with them —
            but drawn *properly*: a tint you can actually see, dashed accent
            edges top and bottom, and the upper edge labelled in place so the
            band does not need the legend to be understood. */}
        {band ? (
          <G>
            <Rect
              x={PAD_L}
              y={bandTop}
              width={plotW}
              height={Math.max(1, bandBottom - bandTop)}
              fill={colors.accent}
              opacity={0.16}
            />
            {[bandTop, bandBottom].map((y, i) => (
              <Line
                key={i}
                x1={PAD_L}
                y1={y}
                x2={width - PAD_R}
                y2={y}
                stroke={colors.accent}
                strokeWidth={1.5}
                strokeDasharray="5 4"
                opacity={0.9}
              />
            ))}
            <SvgText
              x={width - PAD_R}
              y={captionY}
              fontSize={10}
              fontWeight="600"
              fill={colors.accentText}
              textAnchor="end"
            >
              your range
            </SvgText>
          </G>
        ) : null}

        {geom.bars.map((bar, i) => {
          const { bucket } = bar
          const fill = bucket.standing ? standingColor(bucket.standing, colors) : colors.accent
          return (
            <G key={bucket.key}>
              {bucket.load > 0 ? (
                <Path
                  d={roundedTopBar(bar.x, bar.top, bar.barW, geom.yBase, 4)}
                  fill={fill}
                  // An unfinished bucket is drawn at half strength: it is real
                  // data, but it is not a result yet, and at full weight a
                  // three-day-old week reads as a bad week.
                  opacity={
                    (bucket.partial ? 0.45 : 1) *
                    (activeIndex == null || activeIndex === i ? 1 : 0.4)
                  }
                />
              ) : null}
              {geom.labelled.has(i) ? (
                <SvgText
                  x={bar.cx}
                  y={PLOT_H - 5}
                  fontSize={10}
                  fill={activeIndex === i ? colors.text : colors.textMuted}
                  textAnchor="middle"
                >
                  {bucket.tickShort}
                </SvgText>
              ) : null}
            </G>
          )
        })}

        {/* The selected column, marked on the axis itself so the tooltip is
            anchored to something even when the bar under it is a flat zero. */}
        {activeBar ? (
          <Line
            x1={activeBar.cx}
            y1={PAD_T}
            x2={activeBar.cx}
            y2={PAD_T + plotH}
            stroke={colors.borderStrong}
            strokeWidth={1}
            strokeDasharray="3 3"
          />
        ) : null}
      </Svg>

      {activeBar ? (
        <Tooltip
          bucket={activeBar.bucket}
          band={band}
          cx={activeBar.cx}
          barTop={activeBar.top}
          width={width}
          height={tipH}
          onMeasure={setTipH}
        />
      ) : null}
    </View>
  )
}

/**
 * The floating read-out for one bucket.
 *
 * It used to be pinned to the top-left of the plot and rendered permanently,
 * covering the bars it described. Now it appears only on a tap and hangs
 * directly above the bar it belongs to, which is the only position that makes
 * an unlabelled bar chart legible without a permanent table beside it.
 *
 * The height is measured rather than assumed: the card is two or three lines
 * depending on whether the bucket has a standing, and a hard-coded height would
 * either float it or overlap the bar in one of those cases.
 */
function Tooltip({
  bucket,
  band,
  cx,
  barTop,
  width,
  height,
  onMeasure,
}: {
  bucket: LoadBucket
  band: LoadBand | null
  cx: number
  barTop: number
  width: number
  height: number
  onMeasure: (h: number) => void
}) {
  const { colors } = useTheme()

  const left = Math.max(0, Math.min(width - TIP_W, cx - TIP_W / 2))
  const top = Math.max(0, Math.min(PLOT_H - height, barTop - height - 10))

  const standingText = bucket.partial
    ? 'Still in progress'
    : bucket.standing === 'above'
      ? 'Above your range'
      : bucket.standing === 'below'
        ? 'Below your range'
        : bucket.standing === 'inside'
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
        // Hidden until measured, so it never flashes at the top-left corner on
        // the frame between mount and layout.
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
