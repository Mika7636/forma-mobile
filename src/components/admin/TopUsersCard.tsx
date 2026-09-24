// Admin section 7: the most active athletes.

import { Text, View } from 'react-native'
import { ChartEmpty } from './AdminSection'
import type { TopUser } from '../../utils/adminMetrics'
import { MONTH_DAYS, TOP_USER_COUNT } from '../../utils/adminMetrics'
import { formatThousands } from '../../utils/formatting'
import { SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function TopUsersCard({
  users,
  profilesTruncated,
}: {
  users: TopUser[]
  profilesTruncated: boolean
}) {
  const { colors } = useTheme()

  return (
    <View style={cardStyle(colors)}>
      <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Most active athletes
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        Top {TOP_USER_COUNT} by sessions logged, last {MONTH_DAYS} days
      </Text>

      {users.length === 0 ? (
        <ChartEmpty
          message={`Nobody has logged a session in the last ${MONTH_DAYS} days.`}
          height={96}
        />
      ) : (
        <View style={{ marginTop: SPACING.base }}>
          {users.map((user, i) => (
            <Row key={user.uid} user={user} rank={i + 1} first={i === 0} />
          ))}
        </View>
      )}

      {profilesTruncated && users.length > 0 ? (
        <Text
          style={{
            marginTop: SPACING.md,
            fontSize: TYPE.caption,
            lineHeight: 16,
            color: colors.textSubtle,
          }}
        >
          Ranking covers every athlete who trained in the window. Names come from the capped
          profile page, so an athlete beyond it appears here without one.
        </Text>
      ) : null}
    </View>
  )
}

function Row({ user, rank, first }: { user: TopUser; rank: number; first: boolean }) {
  const { colors } = useTheme()

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={`${rank}. ${user.displayName}, ${user.sessions} sessions, ${Math.round(user.load)} AU`}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.md - 2,
        borderTopWidth: first ? 0 : 1,
        borderTopColor: colors.border,
      }}
    >
      <Text
        style={{
          width: 24,
          fontSize: TYPE.small,
          fontWeight: WEIGHT.semibold,
          color: colors.textSubtle,
        }}
      >
        {rank}
      </Text>

      <Text
        numberOfLines={1}
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: TYPE.bodyLg,
          fontWeight: WEIGHT.semibold,
          color: colors.text,
        }}
      >
        {user.displayName}
      </Text>

      <View style={{ alignItems: 'flex-end', marginLeft: SPACING.sm }}>
        <Text style={{ fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: colors.text }}>
          {user.sessions} {user.sessions === 1 ? 'session' : 'sessions'}
        </Text>
        <Text style={{ fontSize: TYPE.caption, color: colors.textMuted }}>
          {formatThousands(user.load)} AU
        </Text>
      </View>
    </View>
  )
}
