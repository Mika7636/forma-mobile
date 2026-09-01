import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

/** One borderless stat column: its label, then the figure. */
function StatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="55%" height={9} />
      <Skeleton width="75%" height={22} style={{ marginTop: 8 }} />
    </View>
  )
}

/** One Fitness/Fatigue/Form column under the chart — smaller than a stat tile. */
function MiniStatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="70%" height={9} />
      <Skeleton width="50%" height={16} style={{ marginTop: 5 }} />
    </View>
  )
}

/**
 * First-load placeholder while `computeProgress` and the first Firestore snapshot
 * settle.
 *
 * Mirrors the real screen's stack in order — this week, the chart, consistency,
 * sport balance — so unlocking to live data doesn't reflow the page under the
 * reader's thumb. The conflict timeline has no placeholder on purpose: it is
 * absent far more often than not, and a block that usually resolves to nothing
 * is a page that jumps.
 */
export default function ProgressSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* This week */}
      <SkeletonCard>
        <Skeleton width="35%" height={16} />
        <View style={{ flexDirection: 'row', marginTop: SPACING.base }}>
          <MiniStatSkeleton />
          <MiniStatSkeleton />
          <MiniStatSkeleton />
        </View>
      </SkeletonCard>

      {/* The Daily / Weekly tabs, which sit outside the chart's card. */}
      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        <Skeleton width={78} height={33} radius={RADIUS.pill} />
        <Skeleton width={86} height={33} radius={RADIUS.pill} />
      </View>

      {/* The chart: one-line legend, the 236pt plot, the window caption, the
          verdict, then the Fitness/Fatigue/Form row the Weekly default shows. */}
      <SkeletonCard>
        <Skeleton width="55%" height={12} />
        <Skeleton height={236} radius={RADIUS.md} style={{ marginTop: SPACING.md }} />
        <Skeleton width="30%" height={12} style={{ marginTop: SPACING.md }} />
        <Skeleton width="80%" height={14} style={{ marginTop: SPACING.md }} />
        <View style={{ flexDirection: 'row', marginTop: SPACING.base }}>
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </View>
      </SkeletonCard>

      {/* Consistency: the big numeral beside the dot grid */}
      <SkeletonCard>
        <Skeleton width="35%" height={16} />
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

      {/* Sport balance: the stacked bar plus a few sport rows */}
      <SkeletonCard>
        <Skeleton width="40%" height={16} />
        <Skeleton height={26} radius={RADIUS.sm} style={{ marginTop: SPACING.base }} />
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} width="85%" height={12} style={{ marginTop: SPACING.md }} />
        ))}
      </SkeletonCard>
    </View>
  )
}
