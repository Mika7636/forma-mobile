// Progress screen first-load placeholder.

import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

function StatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="55%" height={9} />
      <Skeleton width="75%" height={22} style={{ marginTop: 8 }} />
    </View>
  )
}

function MiniStatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="70%" height={9} />
      <Skeleton width="50%" height={16} style={{ marginTop: 5 }} />
    </View>
  )
}

export default function ProgressSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      <SkeletonCard>
        <Skeleton width="35%" height={16} />
        <View style={{ flexDirection: 'row', marginTop: SPACING.base }}>
          <MiniStatSkeleton />
          <MiniStatSkeleton />
          <MiniStatSkeleton />
        </View>
      </SkeletonCard>

      <View style={{ flexDirection: 'row', gap: SPACING.sm }}>
        <Skeleton width={78} height={33} radius={RADIUS.pill} />
        <Skeleton width={86} height={33} radius={RADIUS.pill} />
      </View>

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
