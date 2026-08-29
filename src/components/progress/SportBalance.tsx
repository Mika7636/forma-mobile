import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatThousands } from '../../utils/formatting'
import { sportVisual } from '../../utils/sportMeta'
import { conflictSportsLabel } from '../../utils/conflictInfo'
import { severityStyle } from '../../constants/conflictColors'
import type { SportPoint } from '../../utils/progressMetrics'
import type { Conflict } from '../../types/conflict'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

/** Segments thinner than this are unreadable, so they are pooled into "Other". */
const MIN_SHARE = 4

interface SportBalanceProps {
  sports: SportPoint[]
  /** Conflicts detected inside the visible range, most recent first. */
  conflicts: Conflict[]
  /** Opens the shared conflict detail sheet. */
  onOpenConflict: (conflicts: Conflict[]) => void
  delay?: number
}

/**
 * Where the training actually went, by sport.
 *
 * This is the section FORMA has that a running app does not. Every other chart
 * on this screen answers "how much"; this one answers "how much of *what*", and
 * it is the input to the only advice the app gives that an athlete cannot get
 * from a watch — that two of their sports are competing for the same recovery.
 * So it gets a stacked bar they can read in one glance, a sentence that says the
 * thing out loud, and a direct route into the conflict that follows from it.
 */
export default function SportBalance({
  sports,
  conflicts,
  onOpenConflict,
  delay = 0,
}: SportBalanceProps) {
  const { colors } = useTheme()

  const total = sports.reduce((sum, s) => sum + s.load, 0)

  const insight = useMemo(() => buildInsight(sports), [sports])

  // The most serious conflict wins the slot: with two flagged pairings, the one
  // that could injure someone is the one worth the athlete's attention.
  const headline = useMemo(() => {
    if (conflicts.length === 0) return null
    return [...conflicts].sort((a, b) => severityRank(b) - severityRank(a))[0]
  }, [conflicts])

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(360)} style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Sport Balance
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        Where your training went
      </Text>

      {total === 0 ? (
        <Text style={{ marginTop: SPACING.base, fontSize: TYPE.small, color: colors.textSubtle }}>
          No training in this range yet.
        </Text>
      ) : (
        <>
          <StackedBar sports={sports} />

          <View style={{ marginTop: SPACING.base, gap: 10 }}>
            {sports.map((sport) => (
              <SportRow key={sport.sport} sport={sport} />
            ))}
          </View>

          {insight ? (
            <Text
              style={{
                marginTop: SPACING.base,
                fontSize: TYPE.small,
                lineHeight: 19,
                color: colors.textBody,
              }}
            >
              {insight}
            </Text>
          ) : null}

          {headline ? (
            <ConflictRow conflict={headline} onPress={() => onOpenConflict(conflicts)} />
          ) : null}
        </>
      )}
    </Animated.View>
  )
}

function severityRank(conflict: Conflict): number {
  return conflict.severity === 'danger' ? 1 : 0
}

/**
 * The one line of derived meaning under the bar.
 *
 * Names the sports that dominate rather than restating the chart, because the
 * useful fact is concentration: two sports at 71% is a very different training
 * week from five at 20% each, and the bar alone does not say which one you are
 * looking at.
 */
function buildInsight(sports: SportPoint[]): string | null {
  if (sports.length === 0) return null
  if (sports.length === 1) {
    return `All of your load came from ${sports[0].label}.`
  }
  const top = sports.slice(0, 2)
  const share = top.reduce((sum, s) => sum + s.share, 0)
  if (share >= 60) {
    return `${top[0].label} and ${top[1].label} account for ${share}% of your load.`
  }
  return `Your load is spread across ${sports.length} sports, led by ${top[0].label} at ${top[0].share}%.`
}

/** The horizontal stack — one segment per sport, in that sport's own colour. */
function StackedBar({ sports }: { sports: SportPoint[] }) {
  const { colors } = useTheme()

  // Sub-4% slivers become a single neutral tail rather than a row of 1px
  // stripes that read as rendering noise.
  const shown = sports.filter((s) => s.share >= MIN_SHARE)
  const remainder = 100 - shown.reduce((sum, s) => sum + s.share, 0)

  return (
    <View
      style={{
        flexDirection: 'row',
        height: 22,
        borderRadius: RADIUS.xs,
        overflow: 'hidden',
        marginTop: SPACING.base,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {shown.map((sport) => (
        <View
          key={sport.sport}
          style={{
            flex: sport.share,
            backgroundColor: sportVisual(sport.sport, colors).color,
          }}
        />
      ))}
      {remainder > 0.5 ? (
        <View style={{ flex: remainder, backgroundColor: colors.palette.slate }} />
      ) : null}
    </View>
  )
}

/** One labelled row: icon, sport, its share, and the raw load behind it. */
function SportRow({ sport }: { sport: SportPoint }) {
  const { colors } = useTheme()
  const color = sportVisual(sport.sport, colors).color

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <View
        style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: color, marginRight: 10 }}
      />
      <Text style={{ fontSize: TYPE.bodyLg, marginRight: 6 }}>{sport.icon}</Text>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: TYPE.body, fontWeight: WEIGHT.semibold, color: colors.text }}
      >
        {sport.label}
      </Text>
      <Text style={{ fontSize: TYPE.micro, color: colors.textSubtle, marginRight: 10 }}>
        {formatThousands(sport.load)} AU
      </Text>
      <Text
        style={{
          fontSize: TYPE.body,
          fontWeight: WEIGHT.heavy,
          color: colors.text,
          minWidth: 40,
          textAlign: 'right',
        }}
      >
        {sport.share}%
      </Text>
    </View>
  )
}

/**
 * The bridge from "these two sports dominate" to "and here is why that matters".
 *
 * Only rendered when the conflict engine actually flagged a pairing inside this
 * period, so it is never speculative — it is the coach's own finding, shown
 * where the athlete is already looking at the sports involved.
 */
function ConflictRow({ conflict, onPress }: { conflict: Conflict; onPress: () => void }) {
  const { colors } = useTheme()
  const style = severityStyle(conflict.severity, colors)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Conflict detected: ${conflictSportsLabel(conflict)}. Open details.`}
      style={{
        marginTop: SPACING.base,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: style.softBg,
        borderWidth: 1,
        borderColor: style.softBorder,
        borderRadius: RADIUS.md,
        paddingVertical: 10,
        paddingHorizontal: 12,
      }}
    >
      <Text style={{ fontSize: TYPE.bodyLg, marginRight: 8 }}>{style.icon}</Text>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: style.deep }}>
          {conflictSportsLabel(conflict)}
        </Text>
        <Text style={{ marginTop: 1, fontSize: TYPE.micro, color: colors.textBody }}>
          FORMA flagged this pairing in this period
        </Text>
      </View>
      <Text style={{ fontSize: TYPE.subtitle, color: style.deep, marginLeft: 8 }}>›</Text>
    </Pressable>
  )
}
