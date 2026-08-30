import { Text, View } from 'react-native'
import { standingColor } from './TrainingLoadChart'
import type { WeekBucket } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { SPACING, TYPE, WEIGHT, cardStyle, type Palette } from '../../theme/tokens'

const DOT = 15
/** The dot's cell. Bigger than the dot so the current week's ring has room. */
const CELL = 23
const GAP = 5

interface TrainingConsistencyProps {
  /** The same twelve weeks the chart is drawn from. */
  weeks: WeekBucket[]
  streak: number
}

/**
 * The streak card — but counted in load, not attendance.
 *
 * ## Why this is not Strava's streak
 *
 * A streak counter asks "did you show up?", which is a question about
 * discipline. FORMA already knows what each week was worth *against this
 * athlete's own fitness*, so it can ask the better question: was it the right
 * amount? A week of three sensible sessions extends this; a week of one enormous
 * one does not, and neither does a week of six easy ones. That is a measure an
 * attendance app structurally cannot compute, because it has no model of what
 * this person can absorb.
 *
 * It is also the honest counterweight to the chart above it. The chart shows
 * twelve bars and invites the reader to admire the tallest; this says the
 * tallest bar was never the point.
 *
 * The dots are the *same twelve weeks* as the chart, in the same order and the
 * same colours — so the grid is a second reading of the plot the athlete has
 * just looked at, not a new dataset to decode.
 */
export default function TrainingConsistency({ weeks, streak }: TrainingConsistencyProps) {
  const { colors } = useTheme()

  return (
    <View style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Consistency
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        How often the amount was right
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.base }}>
        {/* The count, at hero scale. This is the one figure the card exists to
            carry, and at anything less than display size it reads as another
            stat rather than as an achievement. */}
        <View style={{ minWidth: 92 }}>
          <Text
            accessibilityLabel={`${streak} ${streak === 1 ? 'week' : 'weeks'} in range`}
            style={{
              fontSize: 52,
              lineHeight: 56,
              fontWeight: WEIGHT.heavy,
              color: streak > 0 ? colors.accentText : colors.textMuted,
            }}
          >
            {streak}
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: TYPE.caption,
              letterSpacing: 0.7,
              textTransform: 'uppercase',
              fontWeight: WEIGHT.semibold,
              color: colors.textMuted,
            }}
          >
            {streak === 1 ? 'week in range' : 'weeks in range'}
          </Text>
        </View>

        <View style={{ flex: 1, minWidth: 0, alignItems: 'flex-end' }}>
          <DotGrid weeks={weeks} />
          <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.caption, color: colors.textSubtle }}>
            Last {weeks.length} weeks
          </Text>
        </View>
      </View>

      <Text
        style={{
          marginTop: SPACING.base,
          fontSize: TYPE.micro,
          lineHeight: 18,
          color: colors.textBody,
        }}
      >
        Consistency beats intensity. Weeks inside your range build fitness that lasts.
      </Text>
    </View>
  )
}

/**
 * How one week is drawn.
 *
 * Filled accent for a week inside the range, warn for one above it, and a hollow
 * ring for one below — hollow rather than a third fill, because "below" is the
 * absence of the thing being counted and an empty dot says that without needing
 * a legend. The two fills come from the chart's own `standingColor`, so a dot
 * can never disagree with the bar it stands for.
 */
function dotStyle(week: WeekBucket, colors: Palette) {
  const standing = week.standingSoFar
  if (standing === 'inside' || standing === 'above') {
    return { fill: standingColor(standing, colors), hollow: false }
  }
  return { fill: 'transparent', hollow: true }
}

/** Twelve weeks, oldest → newest, wrapping to two rows on a narrow phone. */
function DotGrid({ weeks }: { weeks: WeekBucket[] }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'flex-end',
        gap: GAP,
        maxWidth: (CELL + GAP) * 6,
      }}
    >
      {weeks.map((week) => {
        const style = dotStyle(week, colors)
        return (
          <View
            key={week.key}
            accessibilityLabel={`Week of ${week.label}: ${week.standingSoFar ?? 'in progress'}`}
            style={{
              width: CELL,
              height: CELL,
              borderRadius: CELL / 2,
              alignItems: 'center',
              justifyContent: 'center',
              // The current week is *ringed*, not recoloured: it is the same
              // kind of thing as the weeks before it, just the one you are
              // standing in — so it keeps whatever fill it has earned so far
              // and gains a halo around it.
              borderWidth: week.partial ? 1.5 : 0,
              borderColor: colors.borderStrong,
            }}
          >
            <View
              style={{
                width: DOT,
                height: DOT,
                borderRadius: DOT / 2,
                backgroundColor: style.fill,
                borderWidth: style.hollow ? 1.5 : 0,
                borderColor: colors.borderStrong,
              }}
            />
          </View>
        )
      })}
    </View>
  )
}
