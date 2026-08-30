import { useMemo, useState } from 'react'
import { Text, View, type GestureResponderEvent, type LayoutChangeEvent } from 'react-native'
import Svg, { G, Line, Path, Rect, Text as SvgText } from 'react-native-svg'
import { formatCompact, paddedScale, roundedTopBar } from './chartUtils'
import TabIcon, { type TabIconName } from '../ui/TabIcon'
import { formatThousands } from '../../utils/formatting'
import type { BucketStanding, LoadBand, LoadVerdict, WeekBucket } from '../../utils/progressMetrics'
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
 * Exported because anything that claims to share this chart's time axis has to
 * share its gutters too: the conflict timeline's bucket `i` only sits under bar
 * `i` if both are divided across the *same* span. Both cards have identical
 * width and padding, so matching the inset is all the alignment needs.
 */
export const PLOT_INSET = { left: PAD_L, right: PAD_R } as const

/** The tooltip's fixed width; its height is measured, since the copy varies. */
const TIP_W = 152

/** What each bar colour means. One word each — the chips under the caption. */
const LEGEND: { standing: BucketStanding; chip: string }[] = [
  { standing: 'above', chip: 'Above' },
  { standing: 'inside', chip: 'In range' },
  { standing: 'below', chip: 'Below' },
]

/**
 * The colour a bar takes from where it sits against the band.
 *
 * The one place this mapping lives, so the legend chips, the bars, the verdict
 * line and the consistency dots can never disagree — which is the whole basis on
 * which the screen is read.
 */
export function standingColor(standing: BucketStanding, colors: Palette): string {
  if (standing === 'above') return colors.warn
  if (standing === 'below') return colors.textMuted
  return colors.accent
}

interface TrainingLoadChartProps {
  weeks: WeekBucket[]
  band: LoadBand | null
  verdict: LoadVerdict
}

/**
 * The screen's primary chart: how much training went in each of the last twelve
 * weeks, against how much this athlete can currently absorb.
 *
 * It replaced a three-line Fitness/Fatigue/Form plot. That chart is a good
 * picture of the model and a poor picture of the athlete's week — reading it
 * required knowing what CTL and ATL are, and what their difference means. This
 * asks one question instead ("am I doing about the right amount?") and answers
 * it with a bar and a shaded band, which needs no vocabulary at all.
 *
 * The model itself is unchanged and still runs underneath: the band *is* CTL x
 * 7. It moved from being the subject of the chart to being the reference the
 * chart is read against.
 */
export default function TrainingLoadChart({ weeks, band, verdict }: TrainingLoadChartProps) {
  const { colors } = useTheme()

  const [width, setWidth] = useState(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    // Only re-render on a real change — avoids a render loop from sub-pixel jitter.
    if (Math.abs(w - width) > 0.5) setWidth(w)
  }

  return (
    <View style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.small, fontWeight: WEIGHT.semibold, color: colors.textMuted }}>
        Past 12 weeks
      </Text>

      <View style={{ marginTop: SPACING.md }}>
        <LegendChips />
      </View>

      <View style={{ marginTop: SPACING.md }} onLayout={onLayout}>
        {width > 0 ? <LoadPlot weeks={weeks} band={band} width={width} /> : null}
      </View>

      <VerdictLine verdict={verdict} />
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
    // The muted grey the *bars* already use for a below-range week, so the
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
 * does the job it was always doing: it says out loud what the bars have just
 * shown, in the same three colours they were drawn in.
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
        marginTop: SPACING.base,
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
 * of it: a legend's job is to let you decode a bar you are already looking at,
 * and for that "Above" is as good as a sentence and takes a tenth of the room.
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

/* ------------------------------------------------------------------ */
/* The plot                                                            */
/* ------------------------------------------------------------------ */

function LoadPlot({
  weeks,
  band,
  width,
}: {
  weeks: WeekBucket[]
  band: LoadBand | null
  width: number
}) {
  const { colors } = useTheme()

  const [active, setActive] = useState<number | null>(null)
  const [tipH, setTipH] = useState(0)

  const n = weeks.length
  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B

  const geom = useMemo(() => {
    const maxLoad = weeks.reduce((m, w) => Math.max(m, w.load), 0)
    // The axis fits the *window*, not a round number above it. 1.15x the tallest
    // bar leaves it a little air at the top; the band's own ceiling only has to
    // be in frame, so it is admitted at 1.06x rather than dragging the whole
    // axis up with it. Rounding the domain up over both is how a chart of 800 AU
    // weeks ended up with a 4k y-axis and every bar pinned to the floor.
    const ceiling = Math.max(maxLoad * 1.15, (band?.high ?? 0) * 1.06, 1)
    const scale = paddedScale(ceiling, 1, 4)
    const span = scale.max - scale.min || 1
    const yAt = (v: number) => PAD_T + plotH - ((v - scale.min) / span) * plotH
    const slot = n > 0 ? plotW / n : plotW
    // Wide bars: this is a chart of twelve values, not a histogram, and at a
    // narrow fraction of the slot they read as rules rather than as quantities.
    const barW = Math.max(6, Math.min(30, slot * 0.62))
    const bars = weeks.map((week, i) => {
      const cx = PAD_L + (i + 0.5) * slot
      return { week, cx, x: cx - barW / 2, top: yAt(week.load), barW }
    })
    return { scale, bars, slot, maxLoad, yBase: yAt(0), yAt }
  }, [weeks, band, n, plotW, plotH])

  // Nothing logged *and* no band to measure it against: there is no axis worth
  // drawing, and forcing one gives a ceiling of 1 AU with gridlines at 0.2
  // intervals — several ticks all rounding to "0". A sentence is the honest
  // render.
  if (n === 0 || (geom.maxLoad === 0 && !band)) {
    return (
      <View style={{ height: PLOT_H, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in these 12 weeks
        </Text>
      </View>
    )
  }

  /**
   * Tap-to-select, over the whole column rather than the bar itself.
   *
   * Done on the wrapping `View`'s responder rather than with `onPress` on each
   * `Path`, for two reasons: a zero-load week has no bar to press, and a tap
   * that lands anywhere *else* has to clear the selection — which is the
   * behaviour that makes this a tooltip rather than a permanent fixture.
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
  const activeBar = activeIndex != null ? geom.bars[activeIndex] : null
  const bandTop = band ? geom.yAt(band.high) : 0
  const bandBottom = band ? geom.yAt(band.low) : 0
  // The caption sits above the upper edge, unless the edge is near the top of
  // the frame — then it drops inside the band, which always has room for it.
  const captionY = bandTop - 5 < PAD_T + 9 ? bandTop + 12 : bandTop - 5
  const currentIndex = weeks.findIndex((w) => w.partial)

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

        {/* Where the week in progress begins. A rule on the boundary rather than
            a highlight on the bar: it says "everything right of this has not
            finished yet" without recolouring data. Drawn before the band so the
            band's wash and its "your range" caption paint over it — a hairline
            slicing through the caption reads as a rendering fault. */}
        {currentIndex > 0 ? (
          <Line
            x1={PAD_L + currentIndex * geom.slot}
            y1={PAD_T}
            x2={PAD_L + currentIndex * geom.slot}
            y2={PAD_T + plotH}
            stroke={colors.borderStrong}
            strokeWidth={1}
          />
        ) : null}

        {/* The sustainable band. Drawn behind the bars so it reads as the ground
            they stand on rather than as another series competing with them —
            but drawn *properly*: a tint you can see, dashed accent edges top and
            bottom, and the upper edge labelled in place so the band does not
            need the legend to be understood. */}
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
          const { week } = bar
          const fill = week.standing ? standingColor(week.standing, colors) : colors.accent
          return (
            <G key={week.key}>
              {week.load > 0 ? (
                <Path
                  d={roundedTopBar(bar.x, bar.top, bar.barW, geom.yBase, 4)}
                  fill={fill}
                  // An unfinished week is drawn at half strength: it is real
                  // data, but it is not a result yet, and at full weight a
                  // three-day-old week reads as a bad week.
                  opacity={
                    (week.partial ? 0.45 : 1) * (activeIndex == null || activeIndex === i ? 1 : 0.4)
                  }
                />
              ) : null}
              {/* One tick per month, under the first week that starts in it. */}
              {week.monthTick ? (
                <SvgText
                  x={bar.cx}
                  y={PLOT_H - 5}
                  fontSize={10}
                  fontWeight="600"
                  fill={colors.textMuted}
                  textAnchor="middle"
                >
                  {week.monthTick}
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
          week={activeBar.week}
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
 * The floating read-out for one week.
 *
 * Appears only on a tap and hangs directly above the bar it belongs to, which is
 * the only position that makes an unlabelled bar chart legible without a
 * permanent table beside it.
 *
 * The height is measured rather than assumed: the card is two or three lines
 * depending on whether the week has a standing, and a hard-coded height would
 * either float it or overlap the bar in one of those cases.
 */
function Tooltip({
  week,
  band,
  cx,
  barTop,
  width,
  height,
  onMeasure,
}: {
  week: WeekBucket
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

  const standingText = week.partial
    ? 'Still in progress'
    : week.standing === 'above'
      ? 'Above your range'
      : week.standing === 'below'
        ? 'Below your range'
        : week.standing === 'inside'
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
        {week.label}
      </Text>
      <Text style={{ color: colors.textBody, fontSize: TYPE.caption }}>
        <Text style={{ color: colors.text, fontWeight: WEIGHT.bold }}>
          {formatThousands(week.load)}
        </Text>{' '}
        AU{'  ·  '}
        <Text style={{ color: colors.text, fontWeight: WEIGHT.bold }}>{week.sessions}</Text>{' '}
        {week.sessions === 1 ? 'session' : 'sessions'}
      </Text>
      {standingText ? (
        <Text style={{ marginTop: 3, color: colors.textSubtle, fontSize: TYPE.caption }}>
          {standingText}
          {band && !week.partial
            ? ` (${formatThousands(band.low)}–${formatThousands(band.high)})`
            : ''}
        </Text>
      ) : null}
    </View>
  )
}
