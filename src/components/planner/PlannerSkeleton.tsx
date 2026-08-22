import { View } from 'react-native'
import { Skeleton } from '../ui/Skeleton'
import { SPACING } from '../../constants/theme'
import { WEEKDAY_INITIALS } from '../../hooks/useMonthPlan'

/**
 * Placeholder month grid, matching MonthGrid's real geometry (weekday header,
 * six rows of date circles) so the calendar doesn't jump when the two Firestore
 * listeners behind `useMonthPlan` deliver.
 *
 * Six rows rather than the month's real height: the placeholder can't know the
 * shape yet, and shrinking is less jarring than growing into content.
 */
const ROWS = 6
/** Same circle size MonthGrid uses, so nothing shifts on swap. */
const CIRCLE = 34

export default function PlannerSkeleton() {
  return (
    <View>
      <View style={{ flexDirection: 'row', marginBottom: SPACING.sm }}>
        {WEEKDAY_INITIALS.map((_, i) => (
          <View key={i} style={{ flex: 1, alignItems: 'center' }}>
            <Skeleton width={10} height={12} />
          </View>
        ))}
      </View>

      {Array.from({ length: ROWS }).map((_, row) => (
        <View key={row} style={{ flexDirection: 'row' }}>
          {WEEKDAY_INITIALS.map((_, col) => (
            <View
              key={col}
              style={{ flex: 1, alignItems: 'center', paddingTop: 6, paddingBottom: 4 }}
            >
              <Skeleton width={CIRCLE} height={CIRCLE} radius={CIRCLE / 2} />
              {/* Empty spacer standing in for the session-dot row. */}
              <View style={{ height: 6, marginTop: 4 }} />
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}
