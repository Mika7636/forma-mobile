// Section 7 — the most active athletes.
//
// ## No email addresses here
//
// The user list further down the page already carries contact detail, and it is
// the right place for it: that list exists to look somebody up. This one exists
// to answer "who is actually using this", and a leaderboard is the part of an
// admin screen most likely to be read over a shoulder or put on a slide.
// Repeating an address in it would spread personal data across the page for no
// gain — the rank, the name and the two figures are the whole of what this
// answers.
//
// ## Why the rank number is set the way it is
//
// A plain ordinal in muted type rather than a medal, a badge or a tinted chip.
// The ranking is real but it is not an achievement — nobody opted into it — and
// dressing the top three up as winners would turn an operational figure into a
// scoreboard about people who cannot see it.
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
  /** The profile page was capped, so some names may be missing. */
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
        // A hairline between rows rather than around each: this is a table, and
        // ten bordered boxes would be ten objects where there is one list.
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

      {/* Sessions and load, right-aligned in a fixed column so ten rows of
          figures form one edge the eye can run down. */}
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
