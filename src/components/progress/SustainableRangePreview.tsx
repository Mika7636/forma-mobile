// The Progress chart before there is anything to chart.
//
// ## Why a frame and not a blank card
//
// The screen used to hold a locked card: an icon, "Keep logging!", and an unlock
// meter. It told the athlete they couldn't have the feature yet without ever
// telling them what the feature *was*, so the only way to find out whether
// twelve weeks of logging would be worth it was to do twelve weeks of logging.
//
// This draws the real chart's frame instead — the same axis, the same twelve
// weekly slots, the same dashed sustainable band, the same colour rules — with
// the bars replaced by faint ghosts and one line of type over them saying what
// will fill them. The band is explicitly labelled a sample, because the athlete's
// real one is derived from their own fitness and this one cannot be.
//
// The geometry is deliberately a small standalone copy rather than
// `TrainingLoadChart` with an `empty` flag. That component's whole job is to
// scale an axis to real data, classify each bar against a real band, and place a
// tooltip on tap; threading "there is no data and the band is invented" through
// all of it would put a demo mode inside the component that draws the athlete's
// actual training — which is the last place a plausible-looking fake belongs.
import { useState } from 'react'
import { Text, View, type LayoutChangeEvent } from 'react-native'
import Svg, { G, Line, Rect, Text as SvgText } from 'react-native-svg'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

/** Matches TrainingLoadChart's plot geometry, so the two read as one chart. */
const PAD_T = 14
const PAD_B = 22
const PLOT_H = 160 + PAD_T + PAD_B
const PAD_L = 34
const PAD_R = 8

/** Twelve slots, the same window the real chart is fixed to. */
const SLOTS = 12

/**
 * The ghost bars' heights as a fraction of the plot.
 *
 * Shaped like a plausible training block — a build, a down week, a build — so
 * the frame reads as a chart rather than as a random bar pattern. They are drawn
 * at low opacity and are never labelled with a number, so there is no figure here
 * that could be mistaken for the athlete's own.
 */
const GHOSTS = [0.34, 0.46, 0.52, 0.3, 0.5, 0.6, 0.66, 0.4, 0.58, 0.68, 0.74, 0.44]

/** The sample band, as a fraction of the plot height (bottom-up). */
const BAND_LOW = 0.42
const BAND_HIGH = 0.68

export default function SustainableRangePreview() {
  const { colors } = useTheme()

  const [width, setWidth] = useState(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    // Only re-render on a real change — avoids a render loop from sub-pixel jitter.
    if (Math.abs(w - width) > 0.5) setWidth(w)
  }

  const plotW = width - PAD_L - PAD_R
  const plotH = PLOT_H - PAD_T - PAD_B
  const yBase = PAD_T + plotH
  const slot = plotW / SLOTS
  const barW = Math.max(6, Math.min(30, slot * 0.62))
  const bandTop = yBase - BAND_HIGH * plotH
  const bandBottom = yBase - BAND_LOW * plotH

  return (
    <View style={cardStyle(colors)}>
      <Text
        style={{ fontSize: TYPE.small, fontWeight: WEIGHT.semibold, color: colors.textMuted }}
      >
        Past 12 weeks
      </Text>

      <View style={{ marginTop: SPACING.md }} onLayout={onLayout}>
        {width > 0 ? (
          <View>
            <Svg width={width} height={PLOT_H}>
              {/* Gridlines. Unlabelled on purpose: a y-axis with numbers on it
                  would be inventing units for an athlete who has none yet. */}
              {[0, 0.25, 0.5, 0.75, 1].map((t) => (
                <Line
                  key={t}
                  x1={PAD_L}
                  y1={yBase - t * plotH}
                  x2={width - PAD_R}
                  y2={yBase - t * plotH}
                  stroke={colors.border}
                  strokeWidth={1}
                />
              ))}

              {/* The sample band, drawn exactly as the real one is: a wash
                  between two dashed accent edges. */}
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
                  y={bandTop - 5}
                  fontSize={10}
                  fontWeight="600"
                  fill={colors.accentText}
                  textAnchor="end"
                >
                  sample range
                </SvgText>
              </G>

              {/* Ghost bars — the shape of the answer, at a weight that cannot be
                  misread as data. */}
              {GHOSTS.map((h, i) => {
                const top = yBase - h * plotH
                return (
                  <Rect
                    key={i}
                    x={PAD_L + (i + 0.5) * slot - barW / 2}
                    y={top}
                    width={barW}
                    height={Math.max(1, yBase - top)}
                    rx={4}
                    fill={colors.textMuted}
                    opacity={0.14}
                  />
                )
              })}
            </Svg>

            {/* The one line of type over the frame. Centred on the plot rather
                than the card so it sits on the bars it is about. */}
            <View
              pointerEvents="none"
              style={{
                position: 'absolute',
                left: PAD_L,
                right: PAD_R,
                top: PAD_T,
                height: plotH,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <View
                style={{
                  paddingHorizontal: SPACING.md,
                  paddingVertical: SPACING.sm,
                  borderRadius: RADIUS.pill,
                  backgroundColor: colors.surfaceAlt,
                  borderWidth: 1,
                  borderColor: colors.borderStrong,
                }}
              >
                <Text
                  style={{
                    fontSize: TYPE.small,
                    fontWeight: WEIGHT.bold,
                    color: colors.textBody,
                  }}
                >
                  Log sessions to see your bars
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      {/* What the band means, in the place the real verdict line occupies. */}
      <View
        style={{
          flexDirection: 'row',
          marginTop: SPACING.base,
          paddingLeft: SPACING.md,
          borderLeftWidth: 3,
          borderLeftColor: colors.accent,
        }}
      >
        <Text style={{ flex: 1, fontSize: TYPE.small, lineHeight: 18 }}>
          <Text style={{ fontWeight: WEIGHT.heavy, color: colors.accentText }}>
            The shaded band is your sustainable range
          </Text>
          <Text style={{ color: colors.textMuted }}>
            {' '}
            — how much training your current fitness can absorb in a week. Bars inside it
            mean you&apos;re building safely; above it is where injuries start. FORMA works
            it out from your own sessions, so the one above is only an example.
          </Text>
        </Text>
      </View>
    </View>
  )
}
