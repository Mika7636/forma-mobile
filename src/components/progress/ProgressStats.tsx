import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatThousands } from '../../utils/formatting'
import type { ProgressStatsData } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT } from '../../theme/tokens'

interface ProgressStatsProps {
  stats: ProgressStatsData
  /** Ms before the first row animates in; the second follows +60ms behind. */
  baseDelay?: number
}

/**
 * The period's numbers, as two borderless three-column rows.
 *
 * ## Why the cards went away
 *
 * These were six bordered, shadowed tiles with an emoji on each. That is six
 * cards, six hairlines and six drop shadows spent on six numbers — the heaviest
 * furniture on the screen wrapped around its lightest content, sitting directly
 * above the chart that is actually worth the reader's attention. Every activity
 * app that shows a period summary (Strava's Progress tab among them) draws it as
 * a plain row of figures for the same reason: a number and its label are already
 * a legible unit, and a box around them adds nothing but weight.
 *
 * The emoji went with the boxes. They were decorative — a clipboard glyph does
 * not tell you more about a session count than the word "sessions" underneath
 * it — and the one that carried information (the top sport's icon) said it
 * twice, since the sport is named in the value.
 *
 * ## The labels
 *
 * These used to name the model: "avg form score", "current fitness (CTL)". Both
 * are precise and neither is readable — Form is a term of art, and CTL is an
 * acronym for a term of art. The numbers underneath are unchanged; only what
 * they are called is. "Readiness" is what Form actually tells you, and "fitness
 * trend" is what the CTL card was already showing, given it carries the change
 * arrow alongside the value.
 */
export default function ProgressStats({ stats, baseDelay = 40 }: ProgressStatsProps) {
  const { colors } = useTheme()

  const form = stats.avgForm
  const formColor = form > 5 ? colors.accentText : form < -10 ? colors.dangerText : colors.text
  const trendUp = stats.ctlTrend >= 0

  return (
    <View>
      <StatRow delay={baseDelay}>
        <Stat label="Sessions" value={String(stats.totalSessions)} />
        <Stat label="Total load" value={formatThousands(stats.totalLoad)} unit="AU" />
        <Stat label="Calories" value={formatThousands(stats.totalCalories)} unit="kcal" />
      </StatRow>

      <View style={{ height: 1, backgroundColor: colors.border, marginVertical: SPACING.base }} />

      <StatRow delay={baseDelay + 60}>
        <Stat label="Avg readiness" value={`${form > 0 ? '+' : ''}${form}`} valueColor={formColor} />
        <Stat label="Top sport" value={stats.topSport?.label ?? '—'} compact />
        <Stat
          label="Fitness trend"
          value={String(stats.currentCTL)}
          // The arrow is the only glyph in the row and it is doing real work:
          // the CTL figure alone says where fitness *is*, not which way it is
          // going, which is the half of it the label promises.
          note={`${trendUp ? '↑' : '↓'} ${Math.abs(stats.ctlTrend)}`}
          noteColor={trendUp ? colors.accentText : colors.dangerText}
        />
      </StatRow>
    </View>
  )
}

function StatRow({ children, delay }: { children: ReactNode; delay: number }) {
  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(320)} style={{ flexDirection: 'row' }}>
      {children}
    </Animated.View>
  )
}

/**
 * One figure: the number, then what it is.
 *
 * Value over label rather than the other way round, and a wide type-size gap
 * between them, so the row scans as three numbers with captions rather than as
 * three sentences.
 */
function Stat({
  value,
  label,
  unit,
  note,
  noteColor,
  valueColor,
  compact = false,
}: {
  value: string
  label: string
  /** Rendered small and muted after the value, e.g. "AU". */
  unit?: string
  /** A second line under the value, e.g. the fitness trend arrow. */
  note?: string
  noteColor?: string
  valueColor?: string
  /**
   * Render the value at body size — for text values like a sport name, which at
   * 22pt wraps to three lines in a third of a phone.
   */
  compact?: boolean
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, minWidth: 0, paddingRight: SPACING.sm }}>
      {/* Fixed block height, so the three labels sit on one line whatever the
          column above them is — a 22pt figure, a wrapped sport name, or a
          figure with a trend arrow under it. */}
      <View style={{ minHeight: 44 }}>
        <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
          <Text
            numberOfLines={compact ? 2 : 1}
            style={{
              fontSize: compact ? TYPE.bodyLg : TYPE.heading,
              lineHeight: compact ? 19 : 27,
              fontWeight: WEIGHT.heavy,
              // `valueColor` is only passed for readiness. Without the fallback
              // the rest inherited React Native's default ink — black — which
              // was invisible on the dark theme.
              color: valueColor ?? colors.text,
              flexShrink: 1,
            }}
          >
            {value}
          </Text>
          {unit ? (
            <Text style={{ marginLeft: 3, fontSize: TYPE.caption, color: colors.textSubtle }}>
              {unit}
            </Text>
          ) : null}
        </View>

        {note ? (
          <Text
            style={{
              marginTop: 1,
              fontSize: TYPE.micro,
              fontWeight: WEIGHT.bold,
              color: noteColor,
            }}
          >
            {note}
          </Text>
        ) : null}
      </View>

      <Text
        numberOfLines={1}
        style={{
          marginTop: 4,
          fontSize: TYPE.caption,
          lineHeight: 14,
          letterSpacing: 0.7,
          textTransform: 'uppercase',
          fontWeight: WEIGHT.semibold,
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
    </View>
  )
}
