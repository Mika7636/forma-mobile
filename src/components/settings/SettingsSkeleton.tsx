import { View } from 'react-native'
import { Skeleton, SkeletonCard } from '../ui/Skeleton'
import { RADIUS, SPACING } from '../../theme/tokens'

/**
 * Placeholder for Settings while the profile is still resolving.
 *
 * Worth having even though RootNavigator normally guarantees a profile before
 * this screen mounts: every field here reads `profile?.x ?? <default>`, so a
 * momentarily-absent profile would otherwise render a complete, plausible-looking
 * settings screen full of default values — and a user who edited one would be
 * writing those defaults over their real data. A skeleton says "not yet".
 */
export default function SettingsSkeleton() {
  return (
    <View style={{ gap: SPACING.base }}>
      {/* Profile header: avatar + name + email */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: SPACING.md }}>
        <Skeleton width={64} height={64} radius={RADIUS.pill} />
        <View style={{ flex: 1, gap: SPACING.sm }}>
          <Skeleton width="55%" height={20} />
          <Skeleton width="75%" height={12} />
        </View>
      </View>

      {/* Training, Body Metrics, Conflict Detection, Notifications cards */}
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
