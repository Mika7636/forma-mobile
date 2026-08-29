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
 * settle.
 *
 * Mirrors the real screen's stack in order — verdict, load chart, sport balance,
 * stats grid, then the shorter charts — so unlocking to live data doesn't reflow
 * the page under the reader's thumb.
 */
export default function ProgressSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* Verdict headline */}
      <SkeletonCard>
        <Skeleton width="60%" height={20} />
        <Skeleton width="90%" height={12} style={{ marginTop: SPACING.md }} />
      </SkeletonCard>

      {/* Training load, with room for its three-line legend */}
      <SkeletonCard>
        <Skeleton width="45%" height={16} />
        <Skeleton width="70%" height={10} style={{ marginTop: SPACING.sm }} />
        <Skeleton width="80%" height={44} style={{ marginTop: SPACING.md }} />
        <Skeleton height={200} radius={RADIUS.md} style={{ marginTop: SPACING.base }} />
      </SkeletonCard>

      {/* Sport balance: the stacked bar plus a few sport rows */}
      <SkeletonCard>
        <Skeleton width="40%" height={16} />
        <Skeleton height={22} radius={RADIUS.xs} style={{ marginTop: SPACING.base }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="85%" height={12} style={{ marginTop: SPACING.md }} />
        ))}
      </SkeletonCard>

      {/* Stats grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} style={{ flexBasis: '30%', flexGrow: 1 }}>
            <Skeleton width={26} height={26} />
            <Skeleton width="70%" height={22} style={{ marginTop: 10 }} />
            <Skeleton width="50%" height={10} style={{ marginTop: SPACING.sm }} />
          </SkeletonCard>
        ))}
      </View>

      <ChartSkeleton height={150} />
      <ChartSkeleton height={150} />
    </View>
  )
}
