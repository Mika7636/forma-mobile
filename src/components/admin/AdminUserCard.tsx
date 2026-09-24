// One athlete row on the Admin screen.

import { Text, View } from 'react-native'
import type { AdminUserRow } from '../../services/adminService'
import { SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export function relativeDay(iso: string | null): string {
  if (!iso) return 'never'
  const then = new Date(iso)
  if (Number.isNaN(then.getTime())) return 'never'

  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((startOfDay(new Date()) - startOfDay(then)) / 86_400_000)

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

function absoluteDay(iso: string | null): string | null {
  if (!iso) return null
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function AdminUserCard({ user }: { user: AdminUserRow }) {
  const { colors } = useTheme()

  const relative = relativeDay(user.lastActiveAt)
  const absolute = absoluteDay(user.lastActiveAt)
  const never = user.lastActiveAt == null

  return (
    <View
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
