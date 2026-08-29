import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

/** A chart card: title, subtitle, then the plot area at its real height. */
function ChartSkeleton({ height }: { height: number }) {
  return (
    <SkeletonCard>
      <Skeleton width="55%" height={16} />
      <Skeleton width="75%" height={10} style={{ marginTop: SPACING.sm }} />
      <Skeleton height={height} radius={RADIUS.md} style={{ marginTop: SPACING.base }} />
    </SkeletonCard>
  )
}

/**
 * First-load placeholder while `computeProgress` and the first Firestore snapshot
 * settle. Mirrors the real screen's stack — stats grid, hero chart, then shorter
 * charts — so unlocking to live data doesn't reflow the page.
 */
export default function ProgressSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* Stats grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <Skeleton width={26} height={26} />
            <Skeleton width="70%" height={22} style={{ marginTop: 10 }} />
            <Skeleton width="50%" height={10} style={{ marginTop: SPACING.sm }} />
          </SkeletonCard>
        ))}
      </View>

      <ChartSkeleton height={230} />
      <ChartSkeleton height={150} />
      <ChartSkeleton height={150} />
    </View>
  )
}
