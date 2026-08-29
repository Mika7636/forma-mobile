import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

/**
 * First-load placeholder. Mirrors the real dashboard's layout — hero, 2×3 grid,
 * zone bar, activity rows — so the transition to live data doesn't reflow.
 */
export default function DashboardSkeleton() {
  return (
    <View style={{ gap: SPACING.lg }}>
      {/* Form score hero */}
      <Skeleton height={200} radius={RADIUS.xl} />

      {/* Metric grid */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md }}>
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} style={{ flexBasis: '47%', flexGrow: 1 }}>
            <Skeleton width="60%" height={24} />
            <Skeleton width="85%" height={10} style={{ marginTop: SPACING.sm }} />
          </SkeletonCard>
        ))}
      </View>

      {/* Zone chart */}
      <SkeletonCard>
        <Skeleton width="55%" height={16} />
        <Skeleton height={20} radius={RADIUS.pill} style={{ marginTop: SPACING.base }} />
        <Skeleton width="70%" height={10} style={{ marginTop: 14 }} />
      </SkeletonCard>

      {/* Activity rows */}
      <View style={{ gap: SPACING.sm }}>
        <Skeleton width="40%" height={16} style={{ marginBottom: 2 }} />
        {Array.from({ length: 4 }).map((_, i) => (
          <SkeletonCard key={i} style={{ flexDirection: 'row', alignItems: 'center', padding: SPACING.md }}>
            <Skeleton width={42} height={42} radius={RADIUS.pill} />
            <View style={{ flex: 1, marginLeft: SPACING.md }}>
              <Skeleton width="45%" height={13} />
              <Skeleton width="70%" height={10} style={{ marginTop: 6 }} />
            </View>
            <Skeleton width={54} height={28} />
          </SkeletonCard>
        ))}
      </View>
    </View>
  )
}
