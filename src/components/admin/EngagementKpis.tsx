// Admin section 1: the engagement KPI block.

import { Text, View } from 'react-native'
import AdminSection, { Stat } from './AdminSection'
import type { EngagementKpis as Kpis } from '../../utils/adminMetrics'
import { MONTH_DAYS } from '../../utils/adminMetrics'
import { SPACING, TYPE, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

function formatAverage(value: number): string {
  if (value === 0) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

export default function EngagementKpiSection({ kpis }: { kpis: Kpis }) {
  const { colors } = useTheme()

  return (
    <AdminSection
      title="Engagement"
      subtitle={`Active means at least one session logged. "This month" is the last ${MONTH_DAYS} days.`}
    >
      <View style={cardStyle(colors)}>
        <View style={{ flexDirection: 'row' }}>
          <Stat label="Total users" value={String(kpis.totalUsers)} />
          <Stat
            label="Active this week"
            value={String(kpis.activeThisWeek)}
            hint={shareHint(kpis.activeThisWeek, kpis.totalUsers)}
          />
          <Stat
            label="Active this month"
            value={String(kpis.activeThisMonth)}
            hint={shareHint(kpis.activeThisMonth, kpis.totalUsers)}
          />
        </View>

        <View
          style={{
            height: 1,
            backgroundColor: colors.border,
            marginVertical: SPACING.base,
          }}
        />

        <View style={{ flexDirection: 'row' }}>
          <Stat
            label="Sessions per active user"
            value={formatAverage(kpis.avgSessionsPerActiveUser)}
            hint={`Average, last ${MONTH_DAYS} days`}
          />
          <Stat
            label="New signups this month"
            value={String(kpis.newSignups)}
            hint={`Last ${MONTH_DAYS} days`}
          />
          <Stat
            label="Retention"
            value={kpis.retention === null ? '—' : `${Math.round(kpis.retention * 100)}%`}
            hint={
              kpis.retention === null
                ? 'Nobody active last month'
                : `${kpis.retentionBase} active last month`
            }
          />
        </View>
      </View>

      <Text style={{ fontSize: TYPE.caption, lineHeight: 16, color: colors.textSubtle }}>
        Retention is the share of accounts active in the previous {MONTH_DAYS} days that logged
        another session in the {MONTH_DAYS} days since.
      </Text>
    </AdminSection>
  )
}

function shareHint(count: number, total: number): string | undefined {
  if (total <= 0) return undefined
  return `${Math.round((count / total) * 100)}% of users`
}
