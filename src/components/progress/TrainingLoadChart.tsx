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

/**
 * Plot geometry.
 *
 * `PLOT_H − PAD_T − PAD_B` is exactly 200: the drawable plot, not the SVG, is
 * what the reader sees as "the chart", so the height floor is applied there.
 */
const PAD_T = 14
const PAD_B = 22
const PLOT_H = 200 + PAD_T + PAD_B
const PAD_L = 34
const PAD_R = 8

/**
 * The plot's horizontal inset inside a card — the room the y-axis takes on the
 * left and the trailing gap on the right.
 *
 * Exported because anything that claims to share this chart's gutters has to
 * share them exactly: the conflict timeline's strip is only on the same axis as
 * this plot if both are divided across the same span. Both cards have identical
 * width and padding, so matching the inset is all the alignment needs.
 *
 * Held at its original values through the switch from bars to a line — the
 * timeline is drawn from the twelve-week series and is not part of this change,
 * and moving the gutter would have silently shifted it.
 */
export const PLOT_INSET = { left: PAD_L, right: PAD_R } as const

/** The tooltip's fixed width; its height is measured, since the copy varies. */
const TIP_W = 152

/** Radius of a point marker, and of the selected one. */
const DOT_R = 3.6
const DOT_R_ACTIVE = 5.5

/** What each dot colour means. One word each — the chips under the caption. */
const LEGEND: { standing: BucketStanding; chip: string }[] = [
  { standing: 'above', chip: 'Above' },
  { standing: 'inside', chip: 'In range' },
  { standing: 'below', chip: 'Below' },
]

/**
 * The colour a bucket takes from where it sits against the band.
 *
 * The one place this mapping lives, so the legend chips, the dots, the verdict
 * line and the consistency grid can never disagree — which is the whole basis on
 * which the screen is read. It outlived the bars it was written for: the signal
 * moved from the fill of a bar to the fill of a dot, and the mapping did not
 * change at all.
 */
export function standingColor(standing: BucketStanding, colors: Palette): string {
  if (standing === 'above') return colors.warn
  if (standing === 'below') return colors.textMuted
  return colors.accent
}

interface TrainingLoadChartProps {
  /** The active zoom level's points, band, verdict and caption. */
  series: TrendSeries
  /**
   * The Fitness / Fatigue / Form readout, rendered under the verdict line.
   *
   * Passed in rather than derived here, because whether it belongs on screen is
   * a question about the *tab* and about how settled the athlete's baseline is,
   * and this component knows about neither. `null` renders nothing at all — see
   * `ModelReadout` for why it is a Weekly-only block.
   */
  model?: ModelReadoutData | null
}

/**
 * The screen's primary chart: how much training went in, against how much this
 * athlete can currently absorb.
 *
 * ## Why it is a line now
 *
 * It was twelve bars. Bars are the right mark for twelve discrete weeks that are
 * each a completed quantity, and the wrong one the moment the chart has to work
 * at two zoom levels: seven daily bars with three rest days in them is a chart of
 * gaps, and the eye reads the gaps as missing data rather than as zeros. A line
 * with a dot on every point says "this is a continuous measure, and here is what
 * it did" — a rest day is a point on the floor, visibly part of the shape rather
 * than an absence from it.
 *
 * The trade the line makes is that a bar could carry the above/in/below signal in
 * its own fill, and a line cannot: one line is one colour. So the signal moved to
 * the dots, which is the only mark on a line chart that belongs to a single
 * bucket. The mapping itself is untouched — see {@link standingColor} — so the
 * legend, the consistency grid and this chart still agree by construction.
 *
 * The model underneath is unchanged and still runs: the band *is* CTL x the
 * bucket width.
 */
export default function TrainingLoadChart({ series, model = null }: TrainingLoadChartProps) {
  const { colors } = useTheme()

  const [width, setWidth] = useState(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    // Only re-render on a real change — avoids a render loop from sub-pixel jitter.
    if (Math.abs(w - width) > 0.5) setWidth(w)
  }

  return (
    <View style={cardStyle(colors)}>
      <LegendChips />

      <View style={{ marginTop: SPACING.md }} onLayout={onLayout}>
        {width > 0 ? (
          <LoadPlot
            // Remounting on a tab switch drops any open tooltip, which would
            // otherwise survive into a series it does not describe and float
            // over the wrong point.
            key={series.caption}
            points={series.points}
            band={series.band}
            width={width}
          />
        ) : null}
      </View>

      {/* The window, under the plot, following the active tab. The tabs say
          which zoom you picked; this says what that actually spans. */}
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

/* ------------------------------------------------------------------ */
/* The verdict caption                                                 */
/* ------------------------------------------------------------------ */

/** How the verdict line is painted for each state. */
function verdictStyle(tone: LoadVerdict['tone'], colors: Palette) {
  if (tone === 'above') {
    return { rail: colors.warn, ink: colors.warnText, icon: 'alert-triangle' as TabIconName }
  }
  if (tone === 'below') {
    // The muted grey the *dots* already use for a below-range bucket, so the
    // caption and the chart above it agree by construction. Easing off is not a
    // warning and not a success, and a tint borrowed from either would say
    // otherwise.
    return { rail: colors.textMuted, ink: colors.textBody, icon: 'trending-down' as TabIconName }
  }
  if (tone === 'inside') {
    return { rail: colors.accent, ink: colors.accentText, icon: 'check-circle' as TabIconName }
  }
  return { rail: colors.textMuted, ink: colors.textBody, icon: 'info' as TabIconName }
}

/**
 * The verdict, as one line under the chart.
 *
 * It used to be a tinted hero banner above everything, which gave the screen two
 * headlines competing before the reader had seen any data — and it answered a
 * question about the chart while sitting where the chart wasn't. As a caption it
 * does the job it was always doing: it says out loud what the chart has just
 * shown, in the same three colours it was drawn in.
 *
 * It answers for the window on screen, against that window's own band, and so
 * it does change when the tabs do. It used to average the full twelve weeks,
 * which was right while the chart *was* twelve weeks — but leave it there and a
 * chart of six plainly enormous weeks gets captioned "you're easing off",
 * because the six older weeks doing the averaging are not on screen to explain
 * themselves. A caption that contradicts the picture it sits under is worse than
 * no caption. See `verdictFor`.
 */
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

/* ------------------------------------------------------------------ */
/* Legend                                                              */
/* ------------------------------------------------------------------ */

/**
 * The legend as one row of chips.
 *
 * Three colours and three words. The words are the *state*, not an explanation
 * of it: a legend's job is to let you decode a mark you are already looking at,
 * and for that "Above" is as good as a sentence and takes a tenth of the room.
 *
 * The swatches are discs rather than the rounded squares they were, because the
 * mark they now stand for is a dot.
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

/* ------------------------------------------------------------------ */
/* The plot                                                            */
/* ------------------------------------------------------------------ */

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
    // 1.15x the tallest thing in frame. The band counts as in frame: it is drawn
    // content, and a ceiling that clipped it would cut the reference the whole
    // chart is read against rather than merely cropping some white space.
    const ceiling = Math.max(maxLoad, band?.high ?? 0, 1) * 1.15
    // Headroom 1 — the ceiling above *is* the domain. `paddedScale` is used only
    // for its tick placement, since the axis now carries labels without lines.
    const scale = paddedScale(ceiling, 1, 3)
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    // Points sit at slot centres rather than edge to edge, so the first and last
    // dots keep their full radius inside the plot instead of being half-clipped
    // by the gutter.
    const slot = n > 0 ? plotW / n : plotW
    const xAt = (i: number) => PAD_L + (i + 0.5) * slot
    const coords: Point[] = points.map((p, i) => ({ x: xAt(i), y: yAt(p.load) }))
    return { scale, yAt, xAt, slot, maxLoad, coords, yBase: yAt(0) }
  }, [points, band, n, plotW, plotH])

  // Nothing logged *and* no band to measure it against: there is no axis worth
  // drawing, and forcing one gives a ceiling of 1 AU with ticks at 0.2 intervals
  // — several labels all rounding to "0". A sentence is the honest render.
  if (n === 0 || (geom.maxLoad === 0 && !band)) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in this window
        </Text>
      </View>
    )
  }

  /**
   * Tap-to-select, over the whole column rather than the dot itself.
   *
   * Done on the wrapping `View`'s responder rather than with `onPress` on each
   * `Circle`, for two reasons: a 3.6pt dot is far below the touch minimum and
   * nobody would ever hit one, and a tap that lands anywhere *else* has to clear
   * the selection — which is the behaviour that makes this a tooltip rather than
   * a permanent fixture.
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

  const activeIndex = active != null && active < n ? active : null
  const activePoint = activeIndex != null ? points[activeIndex] : null
  const activeCoord = activeIndex != null ? geom.coords[activeIndex] : null

  const bandTop = band ? geom.yAt(band.high) : 0
  const bandBottom = band ? geom.yAt(band.low) : 0
  // The caption sits above the band's upper edge, unless that edge is near the
  // top of the frame — then it drops inside the band, which always has room.
  const captionY = bandTop - 5 < PAD_T + 9 ? bandTop + 12 : bandTop - 5

  const line = linePath(geom.coords)
  // The area is the line, closed down the two ends to the baseline.
  const area =
    geom.coords.length > 0
      ? `${line} L ${geom.coords[geom.coords.length - 1].x.toFixed(2)} ${geom.yBase.toFixed(2)} ` +
        `L ${geom.coords[0].x.toFixed(2)} ${geom.yBase.toFixed(2)} Z`
      : ''

  return (
    <View onStartShouldSetResponder={() => true} onResponderRelease={onTap}>
      <Svg width={width} height={PLOT_H}>
        <Defs>
          {/* The soft wash under the line. Fades to nothing at the baseline
              rather than stopping on a hard edge, so the fill reads as the
              line's own weight rather than as a second filled series. */}
          <LinearGradient id="loadArea" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={colors.accent} stopOpacity={0.3} />
            <Stop offset="1" stopColor={colors.accent} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>

        {/* The sustainable band, as a soft tinted region and nothing else.
            It had dashed accent edges, which at a tenth of the chart's height
            put four near-parallel accent rules across the plot and competed with
            the line for exactly the attention the line should have. A band is a
            *region* — the edge is where the tint stops, and drawing it twice
            only made the reference louder than the data. The caption is what
            names it now. Drawn first, so everything else paints over it. */}
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

        {/* Axis labels without gridlines. The gutter still has to say what the
            line's height is worth, but a chart of one line does not need four
            rules through it to be read — the baseline below is the only
            reference the shape actually rests on. */}
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

        {/* The one rule that stays: zero. Every point's height is read against
            it, and without it a line floating in a blank frame has no floor. */}
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

        {/* The selected column, marked on the axis itself so the tooltip is
            anchored to something even when the point under it is a flat zero. */}
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
                // A ring in the card's own colour separates a dot from the line
                // and the wash behind it, which matters most where the line is
                // steep and a bare dot merges into the stroke.
                stroke={colors.surface}
                strokeWidth={1.5}
                // An unfinished bucket is drawn at half strength: it is real
                // data, but it is not a result yet, and at full weight a
                // three-hour-old day reads as a bad day.
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

/**
 * The floating read-out for one bucket.
 *
 * Appears only on a tap and hangs directly above the point it belongs to, which
 * is the only position that makes an unlabelled trend line legible without a
 * permanent table beside it.
 *
 * The height is measured rather than assumed: the card is two or three lines
 * depending on whether the bucket has a standing, and a hard-coded height would
 * either float it or overlap the point in one of those cases.
 */
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
