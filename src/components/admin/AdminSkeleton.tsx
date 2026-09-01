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
 * Mirrors the real page's stack in order — summary row, chart, user cards — at
 * the real boxes' sizes, so data landing doesn't reflow the page under the
 * reader's thumb. Same rule, and the same primitives, as `ProgressSkeleton`.
 */
export default function AdminSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      <SkeletonCard>
        <View style={{ flexDirection: 'row' }}>
          <StatSkeleton />
          <StatSkeleton />
          <StatSkeleton />
        </View>
      </SkeletonCard>

      {/* The chart card: title, subtitle, the 164pt plot, then the caption. */}
      <SkeletonCard>
        <Skeleton width="40%" height={16} />
        <Skeleton width="55%" height={10} style={{ marginTop: 6 }} />
        <Skeleton height={164} radius={RADIUS.md} style={{ marginTop: SPACING.base }} />
        <Skeleton width="45%" height={12} style={{ marginTop: SPACING.md }} />
      </SkeletonCard>

      <Skeleton width="30%" height={16} style={{ marginTop: SPACING.sm }} />

      {[0, 1, 2, 3].map((i) => (
        <UserSkeleton key={i} />
      ))}
    </View>
  )
}
