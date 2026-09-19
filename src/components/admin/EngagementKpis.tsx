// Section 1 — the engagement KPI block.
//
// Two rows of three, on the Progress screen's borderless stat treatment. The
// split is not cosmetic: the top row is *how many people are using this*, which
// is the question the screen is opened to answer, and the second is *how that
// is changing* — how much the actives train, signups in, retention holding.
// Reading the second row first tells you nothing, so it is second.
//
// Three to a row and not four: a fourth tile takes each one below the width its
// label needs, and "Sessions per active user" truncates on a 720p phone.
//
// Every "active" figure here is computed from session dates rather than from
// `lastActiveAt` — see the header of `utils/adminMetrics` for why that field
// cannot carry an engagement metric.
import { Text, View } from 'react-native'
import AdminSection, { Stat } from './AdminSection'
import type { EngagementKpis as Kpis } from '../../utils/adminMetrics'
import { MONTH_DAYS } from '../../utils/adminMetrics'
import { SPACING, TYPE, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** "2.4", "3", "0" — one decimal, and none when it would read as ".0". */
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

        {/* A rule rather than a second card. The six figures are one block of
            the same kind of thing, and splitting them across two surfaces would
            imply a difference in kind that isn't there. */}
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
            // The denominator, always. A retention of 100% over two users and
            // one over two hundred are the same number and completely different
            // facts, and the figure alone cannot tell them apart.
            hint={
              kpis.retention === null
                ? 'Nobody active last month'
                : `${kpis.retentionBase} active last month`
            }
          />
        </View>
      </View>

      {/* What retention actually measures, once, under the block that shows it.
          "Retention" means a dozen different things across a dozen dashboards,
          and an unlabelled percentage is the kind of number that gets quoted at
          somebody who assumed the other definition. */}
      <Text style={{ fontSize: TYPE.caption, lineHeight: 16, color: colors.textSubtle }}>
        Retention is the share of accounts active in the previous {MONTH_DAYS} days that logged
        another session in the {MONTH_DAYS} days since.
      </Text>
    </AdminSection>
  )
}

/** "38% of users" — the share a headcount represents, or nothing at zero. */
function shareHint(count: number, total: number): string | undefined {
  if (total <= 0) return undefined
  return `${Math.round((count / total) * 100)}% of users`
}
