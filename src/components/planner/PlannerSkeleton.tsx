import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../constants/theme'

/**
 * Seven placeholder day cards, matching DayCard's real geometry (date column,
 * title, session chips) so the week doesn't jump when the two Firestore
 * listeners behind `useWeeklyPlan` deliver.
 *
 * The varying chip counts are intentional: a column of seven identical boxes
 * reads as a rendering bug, whereas an uneven stack reads as content arriving.
 */
const CHIPS_PER_DAY = [1, 0, 2, 1, 0, 1, 2]

export default function PlannerSkeleton() {
  return (
    <View style={{ gap: SPACING.md }}>
      {CHIPS_PER_DAY.map((chips, i) => (
        <SkeletonCard key={i}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
            <Skeleton width={38} height={38} radius={RADIUS.md} />
            <View style={{ flex: 1, gap: 6 }}>
              <Skeleton width="42%" height={14} />
              <Skeleton width="26%" height={10} />
            </View>
          </View>

          {chips > 0 ? (
            <View style={{ marginTop: SPACING.md, gap: SPACING.sm }}>
              {Array.from({ length: chips }).map((_, c) => (
                <Skeleton key={c} height={44} radius={RADIUS.md} />
              ))}
            </View>
          ) : null}
        </SkeletonCard>
      ))}
    </View>
  )
}
