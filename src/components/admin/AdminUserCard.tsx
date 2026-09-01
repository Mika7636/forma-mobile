import { Text, View } from 'react-native'
import type { AdminUserRow } from '../../services/adminService'
import { SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/**
 * How long ago, in words — "2 days ago", or "never".
 *
 * Counted in whole *calendar* days rather than 24-hour blocks, so an athlete who
 * opened the app at 11pm last night reads as "yesterday" at 9am rather than as
 * "today". The unit steps up as the number would otherwise get unwieldy; past a
 * fortnight nobody is comparing weeks, which is what the absolute date below it
 * is for.
 */
export function relativeDay(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'never'

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000)

  // A server timestamp a few seconds ahead of the handset's clock is normal and
  // must not print "in 1 day".
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 7) return `${days} days ago`
  if (days < 30) {
    const weeks = Math.floor(days / 7)
    return weeks === 1 ? '1 week ago' : `${weeks} weeks ago`
  }
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30))
    return months === 1 ? '1 month ago' : `${months} months ago`
  }
  const years = Math.floor(days / 365)
  return years === 1 ? '1 year ago' : `${years} years ago`
}

/** The absolute date under the relative one — "1 Sep 2026". */
function absoluteDay(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

/**
 * One athlete in the admin list.
 *
 * A plain card and nothing else: no `Pressable`, no swipe actions, no overflow
 * menu. That is the whole design. This screen exists to *look* at other people's
 * accounts, and every affordance it grows is an affordance for touching them —
 * so it grows none, and a reader can tell at a glance that there is nothing here
 * to press. The absence is the feature.
 *
 * The date is doubled deliberately: the relative line is the one that gets read
 * ("has this account gone quiet?") and the absolute line is the one that gets
 * quoted, and picking one would lose the other.
 */
export default function AdminUserCard({ user }: { user: AdminUserRow }) {
  const { colors } = useTheme()

  const relative = relativeDay(user.lastActiveAt)
  const absolute = absoluteDay(user.lastActiveAt)
  const never = user.lastActiveAt == null

  return (
    <View
      // One row is one thing to a screen reader; three separate texts would be
      // read as three unrelated fragments.
      accessible
      accessibilityLabel={`${user.displayName}, ${user.email}, last active ${relative}`}
      style={[cardStyle(colors), { flexDirection: 'row', alignItems: 'center' }]}
    >
      <View style={{ flex: 1, minWidth: 0, paddingRight: SPACING.md }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}
        >
          {user.displayName}
        </Text>
        <Text
          numberOfLines={1}
          style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}
        >
          {user.email}
        </Text>
      </View>

      <View style={{ alignItems: 'flex-end' }}>
        <Text
          style={{
            fontSize: TYPE.small,
            fontWeight: WEIGHT.semibold,
            // "never" is a fact about an account, not a fault in it, so it is
            // dimmed rather than tinted — a warning colour here would flag every
            // athlete who simply hasn't reopened the app since the heartbeat
            // shipped, which on day one is all of them.
            color: never ? colors.textSubtle : colors.textBody,
          }}
        >
          {relative}
        </Text>
        {absolute ? (
          <Text style={{ marginTop: 2, fontSize: TYPE.caption, color: colors.textSubtle }}>
            {absolute}
          </Text>
        ) : null}
      </View>
    </View>
  )
}
