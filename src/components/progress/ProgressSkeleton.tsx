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

/** One borderless stat column: the figure, then its label. */
function StatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="60%" height={22} />
      <Skeleton width="80%" height={9} style={{ marginTop: 10 }} />
    </View>
  )
}

/**
 * First-load placeholder while `computeProgress` and the first Firestore snapshot
 * settle.
 *
 * Mirrors the real screen's stack in order — verdict, the two stat rows, the
 * load chart, sport balance, consistency, then the shorter charts — so unlocking
 * to live data doesn't reflow the page under the reader's thumb. The conflict
 * timeline has no placeholder on purpose: it is absent far more often than not,
 * and a block that usually resolves to nothing is a page that jumps.
 */
export default function ProgressSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* Verdict headline */}
      <SkeletonCard>
        <Skeleton width="60%" height={20} />
        <Skeleton width="90%" height={12} style={{ marginTop: SPACING.md }} />
      </SkeletonCard>

      {/* The two borderless stat rows, with their divider */}
      <View>
        <View style={{ flexDirection: 'row' }}>
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </View>
        <Skeleton height={1} style={{ marginVertical: SPACING.base }} />
        <View style={{ flexDirection: 'row' }}>
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </View>
      </View>

      {/* Training load: title, one-line legend, then the 200pt plot */}
      <SkeletonCard>
        <Skeleton width="45%" height={16} />
        <Skeleton width="70%" height={10} style={{ marginTop: SPACING.sm }} />
        <Skeleton width="55%" height={12} style={{ marginTop: SPACING.md }} />
        <Skeleton height={236} radius={RADIUS.md} style={{ marginTop: SPACING.base }} />
      </SkeletonCard>

      {/* Sport balance: the stacked bar plus a few sport rows */}
      <SkeletonCard>
        <Skeleton width="40%" height={16} />
        <Skeleton height={26} radius={RADIUS.sm} style={{ marginTop: SPACING.base }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="85%" height={12} style={{ marginTop: SPACING.md }} />
        ))}
      </SkeletonCard>

      {/* Training consistency: the big numeral beside the dot grid */}
      <SkeletonCard>
        <Skeleton width="45%" height={16} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: SPACING.base }}>
          <View style={{ width: 92 }}>
            <Skeleton width={54} height={44} />
            <Skeleton width={76} height={9} style={{ marginTop: SPACING.sm }} />
          </View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Skeleton width={168} height={51} radius={RADIUS.xs} />
          </View>
        </View>
      </SkeletonCard>

      <ChartSkeleton height={150} />
      <ChartSkeleton height={150} />
    </View>
  )
}
