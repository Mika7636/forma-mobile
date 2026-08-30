import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import TabIcon from '../ui/TabIcon'
import { PLOT_INSET } from './TrainingLoadChart'
import { severityStyle, worstSeverity } from '../../constants/conflictColors'
import { conflictSportsLabel, detectedAtDate } from '../../utils/conflictInfo'
import { localISODate } from '../../utils/dates'
import type { WeekBucket } from '../../utils/progressMetrics'
import type { Conflict } from '../../types/conflict'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'

const STRIP_H = 26
const MARKER = 9
const WEEK_MS = 7 * 86_400_000

interface ConflictTimelineProps {
  /** The load chart's twelve weeks — the strip borrows their time axis exactly. */
  weeks: WeekBucket[]
  /** Conflicts detected inside the twelve-week window. */
  conflicts: Conflict[]
  /** Opens the shared conflict detail sheet. */
  onOpenConflict: (conflicts: Conflict[]) => void
}

/**
 * When the cross-sport conflicts happened, on the same axis as the load chart.
 *
 * The conflict engine's findings used to appear as a single row hanging off the
 * bottom of Sport Balance — which said *that* two sports clashed but not
 * *when*, and so could not be read against the week that caused it. Sharing the
 * chart's twelve weeks fixes that for free: a marker under the tall bar in week
 * nine is the whole explanation, and no words are needed to make the connection.
 *
 * Rendered only when something was actually flagged in the period. An empty
 * strip would be a section about nothing, and a permanent "no conflicts" badge
 * would train the reader to ignore the row that matters.
 */
export default function ConflictTimeline({
  weeks,
  conflicts,
  onOpenConflict,
}: ConflictTimelineProps) {
  const { colors } = useTheme()

  // Which weeks contain a flagged conflict, and the most serious severity in
  // each — with two findings in one week, the one that could injure someone is
  // the one the marker should be coloured for.
  const marked = useMemo(() => {
    const byBucket = new Map<number, Conflict[]>()
    if (weeks.length === 0) return byBucket
    // Bucket edges as timestamps: a bucket runs from its own start until the
    // next one's, and the last runs to the end of its own span. Derived from
    // `startISO` rather than re-bucketing by date arithmetic, so this cannot
    // drift from whatever grain the chart is currently drawn at.
    const starts = weeks.map((w) => new Date(`${w.startISO}T00:00:00`).getTime())
    const ends = starts.map((t, i) => (i < starts.length - 1 ? starts[i + 1] : t + WEEK_MS))
    for (const conflict of conflicts) {
      const at = detectedAtDate(conflict).getTime()
      const index = starts.findIndex((start, i) => at >= start && at < ends[i])
      if (index === -1) continue
      const list = byBucket.get(index) ?? []
      list.push(conflict)
      byBucket.set(index, list)
    }
    return byBucket
  }, [weeks, conflicts])

  // The most recent finding gets the detail line: a conflict is advice about
  // what to do next, and last week's is the one that still applies.
  const latest = useMemo(() => {
    if (conflicts.length === 0) return null
    return [...conflicts].sort(
      (a, b) => detectedAtDate(b).getTime() - detectedAtDate(a).getTime(),
    )[0]
  }, [conflicts])

  if (!latest || marked.size === 0) return null

  const count = conflicts.length

  return (
    <View style={cardStyle(colors)}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text
          style={{ flex: 1, fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}
        >
          Cross-sport conflicts
        </Text>
        <View
          style={{
            backgroundColor: colors.tint.amber.bg,
            borderWidth: 1,
            borderColor: colors.tint.amber.border,
            borderRadius: RADIUS.pill,
            paddingHorizontal: 9,
            paddingVertical: 2,
          }}
        >
          <Text
            style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.heavy, color: colors.tint.amber.text }}
          >
            {count}
          </Text>
        </View>
      </View>

      <Strip weeks={weeks} marked={marked} />

      <ConflictRow conflict={latest} onPress={() => onOpenConflict(conflicts)} />
    </View>
  )
}

/**
 * The strip itself: one slot per chart bucket, a marker where something was
 * flagged.
 *
 * Flex slots rather than a measured SVG, because the only thing that has to line
 * up is the *proportion* — slot `i` of `n` sits under bar `i` of `n` as long as
 * both are evenly divided, and a flex row is evenly divided by construction.
 *
 * The one thing that is not free is the *span*: the chart reserves a gutter for
 * its y-axis, so a full-width strip would be stretched relative to it and every
 * marker would drift left of the bar it belongs to. Padding by the chart's own
 * exported inset puts the two on the same axis exactly.
 */
function Strip({ weeks, marked }: { weeks: WeekBucket[]; marked: Map<number, Conflict[]> }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: STRIP_H,
        marginTop: SPACING.base,
        paddingLeft: PLOT_INSET.left,
        paddingRight: PLOT_INSET.right,
        borderRadius: RADIUS.xs,
        backgroundColor: colors.surfaceAlt,
      }}
    >
      {weeks.map((week, i) => {
        const here = marked.get(i)
        const style = here ? severityStyle(worstSeverity(here), colors) : null
        return (
          <View
            key={week.key}
            accessibilityLabel={here ? `${here.length} flagged in ${week.label}` : undefined}
            style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
          >
            {style ? (
              <View
                style={{
                  width: MARKER,
                  height: MARKER,
                  borderRadius: 2,
                  backgroundColor: style.solid,
                  transform: [{ rotate: '45deg' }],
                }}
              />
            ) : (
              // A hairline tick for a quiet bucket, so the strip reads as a time
              // axis rather than as an empty bar waiting to fill up.
              <View style={{ width: 1, height: 6, backgroundColor: colors.border }} />
            )}
          </View>
        )
      })}
    </View>
  )
}

/** The most recent finding, as one tappable line into the detail sheet. */
function ConflictRow({ conflict, onPress }: { conflict: Conflict; onPress: () => void }) {
  const { colors } = useTheme()
  const style = severityStyle(conflict.severity, colors)
  const when = detectedAtDate(conflict)
  const today = localISODate(new Date())
  const label =
    localISODate(when) === today
      ? 'today'
      : when.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Most recent conflict: ${conflictSportsLabel(conflict)}, ${label}. Open details.`}
      style={{
        minHeight: MIN_TOUCH,
        marginTop: SPACING.md,
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
      <View style={{ marginRight: 10 }}>
        <TabIcon name="alert-triangle" size={17} color={style.solid} focused />
      </View>
      <Text
        numberOfLines={1}
        style={{ flex: 1, fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: style.deep }}
      >
        {conflictSportsLabel(conflict)}
      </Text>
      <Text style={{ fontSize: TYPE.micro, color: colors.textMuted, marginHorizontal: 8 }}>
        {label}
      </Text>
      <TabIcon name="chevron-right" size={16} color={colors.textMuted} />
    </Pressable>
  )
}
