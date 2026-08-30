import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import type { ConsistencyData, ConsistencyWeek } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT, type Palette } from '../../theme/tokens'

const DOT = 15
/** The dot's cell. Bigger than the dot so the current week's ring has room. */
const CELL = 23
const GAP = 5

interface TrainingConsistencyProps {
  consistency: ConsistencyData
  delay?: number
}

/**
 * The streak block — but counted in load, not attendance.
 *
 * ## Why this is not a Strava streak
 *
 * A streak counter asks "did you show up?", which is a question about
 * discipline. FORMA already knows the amount each week was worth *against this
 * athlete's own fitness*, so it can ask the better question: was it the right
 * amount? A week of three sensible sessions extends this; a week of one
 * enormous one does not, and neither does a week of six easy ones. That is a
 * measure a step-and-attendance app structurally cannot compute, because it has
 * no model of what this person can absorb.
 *
 * It is also the honest counterweight to the load chart. The chart shows twelve
 * bars and invites the reader to look at the tallest; this says the tallest bar
 * was never the point.
 */
export default function TrainingConsistency({
  consistency,
  delay = 0,
}: TrainingConsistencyProps) {
  const { colors } = useTheme()

  const { streak, weeks } = consistency

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(360)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: RADIUS.card,
        padding: SPACING.base,
        borderWidth: 1,
        borderColor: colors.border,
        ...colors.shadowCard,
      }}
    >
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Training Consistency
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        How often the amount was right
      </Text>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.base }}>
        {/* The count, at hero scale. This is the one figure the section exists
            to carry, and at anything less than display size it reads as another
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
    </Animated.View>
  )
}

/**
 * How one week is drawn.
 *
 * Filled accent for a week inside the range, warn for one above it, and a hollow
 * ring for one below — hollow rather than a third fill, because "below" is the
 * absence of the thing being counted and an empty dot says that without needing
 * a legend.
 */
function dotStyle(week: ConsistencyWeek, colors: Palette) {
  if (week.standing === 'inside') {
    return { fill: colors.accent, border: colors.accent, hollow: false }
  }
  if (week.standing === 'above') {
    return { fill: colors.warn, border: colors.warn, hollow: false }
  }
  return { fill: 'transparent', border: colors.borderStrong, hollow: true }
}

/** Twelve weeks, oldest → newest, wrapping to two rows on a narrow phone. */
function DotGrid({ weeks }: { weeks: ConsistencyWeek[] }) {
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
            key={week.weekStartISO}
            accessibilityLabel={`Week of ${week.label}: ${week.standing ?? 'in progress'}`}
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
              borderWidth: week.current ? 1.5 : 0,
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
                borderColor: style.border,
              }}
            />
          </View>
        )
      })}
    </View>
  )
}
