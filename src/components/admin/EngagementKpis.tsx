// Section 1 — the engagement KPI block.
//
// Two rows of four and three, on the Progress screen's borderless stat
// treatment. The split is not cosmetic: the top row is *how many people are
// using this*, which is the question the screen is opened to answer, and the
// second is *how is that changing* — signups in, retention holding, and how
// stale a typical account has gone. Reading the second row first tells you
// nothing, so it is second.
//
// Every "active" figure here is computed from session dates rather than from
// `lastActiveAt` — see the header of `utils/adminMetrics` for why that field
// cannot carry an engagement metric.
import { Text, View } from 'react-native'
import AdminSection, { Stat } from './AdminSection'
import type { EngagementKpis as Kpis, MedianGap } from '../../utils/adminMetrics'
import { MONTH_DAYS } from '../../utils/adminMetrics'
import { SPACING, TYPE, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** "2.4", "3", "0" — one decimal, and none when it would read as ".0". */
function formatAverage(value: number): string {
  if (value === 0) return '0'
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}

/**
 * The median gap, rendered so a floor never passes for a measurement.
 *
 * When the median falls outside the fetch window all this screen knows is that
 * it is at least as large as the oldest gap it can see, so it says "> 84 days"
 * rather than printing that floor as if it were the answer. See {@link MedianGap}.
 */
function formatGap(gap: MedianGap, windowDays: number): { value: string; hint?: string } {
  // Three states, and the order matters. `days === null` with `beyondWindow`
  // set is "there are accounts, none of them trained in the window" — a real
  // and quite likely answer on a young deployment, and not at all the same as
  // the empty database that the plain null means.
  if (gap.days === null) {
    return gap.beyondWindow
      ? { value: '—', hint: `No sessions in the last ${windowDays} days` }
      : { value: '—', hint: 'No accounts yet' }
  }
  // The median sits among accounts whose last session predates the fetch, so
  // every one of them is further back than the window — which makes this a
  // floor we can actually stand behind rather than the largest gap on record.
  if (gap.beyondWindow) {
    return { value: `> ${windowDays}d`, hint: 'Median account is dormant' }
  }
  return {
    value: `${gap.days}d`,
    hint: gap.days === 0 ? 'Half trained today' : 'Across every account',
  }
}

export default function EngagementKpiSection({
  kpis,
  windowDays,
}: {
  kpis: Kpis
  windowDays: number
}) {
  const { colors } = useTheme()

  const gap = formatGap(kpis.medianDaysSinceLastSession, windowDays)

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
          <Stat
            label="Avg sessions / active user"
            value={formatAverage(kpis.avgSessionsPerActiveUser)}
            hint={`Last ${MONTH_DAYS} days`}
          />
        </View>

        {/* A rule rather than a second card. The seven figures are one block of
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
          <Stat label="Median days since last session" value={gap.value} hint={gap.hint} />
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
