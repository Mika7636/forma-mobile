// Admin screen first-load placeholder.

import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

function StatSkeleton() {
  return (
    <View style={{ flex: 1, paddingRight: SPACING.sm }}>
      <Skeleton width="60%" height={9} />
      <Skeleton width="70%" height={22} style={{ marginTop: 8 }} />
    </View>
  )
}

function HeadingSkeleton() {
  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Skeleton width="42%" height={16} />
      <Skeleton width="72%" height={10} style={{ marginTop: 6 }} />
    </View>
  )
}

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

export default function AdminSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
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

      <HeadingSkeleton />
      <ChartSkeleton height={204} />
      <ChartSkeleton height={164} />

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
