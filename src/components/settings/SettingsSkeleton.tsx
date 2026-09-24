// Settings placeholder while the profile is still resolving.

import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

export default function SettingsSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
        <Skeleton width={64} height={64} radius={RADIUS.pill} />
        <View style={{ flex: 1, gap: SPACING.sm }}>
          <Skeleton width="55%" height={20} />
          <Skeleton width="75%" height={12} />
        </View>
      </View>

      {[3, 2, 2, 4].map((rows, i) => (
        <SkeletonCard key={i}>
          <Skeleton width="40%" height={14} />
          <View style={{ marginTop: SPACING.base, gap: SPACING.md }}>
            {Array.from({ length: rows }).map((_, r) => (
              <Skeleton key={r} width={r % 2 === 0 ? '100%' : '80%'} height={38} radius={RADIUS.md} />
            ))}
          </View>
        </SkeletonCard>
      ))}
    </View>
  )
}
