import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

/** One borderless stat column: its label, then the figure. */
function StatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="60%" height={9} />
      <Skeleton width="70%" height={22} style={{ marginTop: 8 }} />
    </View>
  )
}

/** A section's heading and its one line of window. */
function HeadingSkeleton() {
  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Skeleton width="42%" height={16} />
      <Skeleton width="72%" height={10} style={{ marginTop: 6 }} />
    </View>
  )
}

/** A chart card: title, subtitle, the plot, then the caption under it. */
function ChartSkeleton({ height }: { height: number }) {
  return (
    <SkeletonCard>
      <Skeleton width="40%" height={16} />
      <Skeleton width="55%" height={10} style={{ marginTop: 6 }} />
      <Skeleton height={height} radius={RADIUS.md} style={{ marginTop: SPACING.base }} />
      <Skeleton width="45%" height={12} style={{ marginTop: SPACING.md }} />
    </SkeletonCard>
  )
}

/** One user row: name, email, then the two-line last-active stack. */
function UserSkeleton() {
  return (
    <SkeletonCard>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="45%" height={14} />
          <Skeleton width="65%" height={10} />
        </View>
        <View style={{ alignItems: 'flex-end', gap: 6 }}>
          <Skeleton width={64} height={12} />
          <Skeleton width={78} height={9} />
        </View>
      </View>
    </SkeletonCard>
  )
}

/**
 * First-load placeholder for the Admin screen.
 *
 * Mirrors the real page's stack in order — the KPI block, then each labelled
 * section's charts, then the user cards — at the real boxes' sizes, so data
 * landing doesn't reflow the page under the reader's thumb. Same rule, and the
 * same primitives, as `ProgressSkeleton`.
 *
 * It stops after the third section rather than mirroring all seven. Below that
 * point nothing is on screen on any handset, and a skeleton for content the
 * reader has not scrolled to is a few hundred views animating out of sight —
 * the loading state's job is to hold the shape of the *first* screenful.
 */
export default function AdminSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* Section 1 — the KPI block: a row of four, a rule, then a row of three. */}
      <HeadingSkeleton />
      <SkeletonCard>
        <View style={{ flexDirection: 'row' }}>
          <StatSkeleton />
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
      </SkeletonCard>

      {/* Section 2 — the weekly line at 204pt, then the daily bars at 164pt. */}
      <HeadingSkeleton />
      <ChartSkeleton height={204} />
      <ChartSkeleton height={164} />

      {/* Section 3 — the donut, which is square and centred, and its legend. */}
      <HeadingSkeleton />
      <SkeletonCard>
        <Skeleton width="40%" height={16} />
        <Skeleton width="55%" height={10} style={{ marginTop: 6 }} />
        <View style={{ alignItems: 'center', marginTop: SPACING.base }}>
          <Skeleton width={168} height={168} radius={84} />
        </View>
        <View style={{ marginTop: SPACING.base, gap: SPACING.sm }}>
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} height={12} />
          ))}
        </View>
      </SkeletonCard>

      <Skeleton width="30%" height={16} style={{ marginTop: SPACING.sm }} />

      {[0, 1, 2, 3].map((i) => (
        <UserSkeleton key={i} />
      ))}
    </View>
  )
}
