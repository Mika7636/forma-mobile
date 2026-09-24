// Admin: a read-only analytics window on the whole userbase.

import { useCallback, useState } from 'react'
import { FlatList, Linking, RefreshControl, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ActiveUsersChart from '../components/admin/ActiveUsersChart'
import ActivityHeatmapCard from '../components/admin/ActivityHeatmapCard'
import AdminSection from '../components/admin/AdminSection'
import AdminSkeleton from '../components/admin/AdminSkeleton'
import AdminUserCard from '../components/admin/AdminUserCard'
import ConflictMatrixCard from '../components/admin/ConflictMatrixCard'
import DailySessionsChart from '../components/admin/DailySessionsChart'
import EngagementKpiSection from '../components/admin/EngagementKpis'
import LoadBySportChart from '../components/admin/LoadBySportChart'
import SportDistributionChart from '../components/admin/SportDistributionChart'
import TopUsersCard from '../components/admin/TopUsersCard'
import EmptyState from '../components/ui/EmptyState'
import PrimaryButton from '../components/ui/PrimaryButton'
import TabIcon from '../components/ui/TabIcon'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import { useAdminOverview } from '../hooks/useAdminOverview'
import { useTabContentPadding } from '../hooks/useTabContentPadding'
import {
  AdminDeniedError,
  MissingIndexError,
  type AdminOverview,
  type AdminUserRow,
} from '../services/adminService'
import { useAuthStore } from '../store/authStore'
import { haptics } from '../utils/haptics'
import { formatThousands } from '../utils/formatting'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'

export default function AdminScreen() {
  const { colors } = useTheme()
  const tabPadding = useTabContentPadding()

  const isAdmin = useAuthStore((s) => s.profile?.isAdmin === true)

  const { data, loading, error, refresh } = useAdminOverview()
  const [refreshing, setRefreshing] = useState(false)

  const onRefresh = useCallback(async () => {
    haptics.medium()
    setRefreshing(true)
    await refresh()
    setRefreshing(false)
  }, [refresh])

  if (!isAdmin) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ThemedStatusBar />
        <View style={{ flex: 1, justifyContent: 'center', padding: SPACING.base }}>
          <EmptyState
            icon="shield"
            title="Not available"
            message="This screen is for FORMA administrators. Your account doesn't have access."
          />
        </View>
      </SafeAreaView>
    )
  }

  if (error && !data) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
        <ThemedStatusBar />
        <AdminHeader />
        <View style={{ flex: 1, justifyContent: 'center', padding: SPACING.base }}>
          <AdminError error={error} onRetry={refresh} />
        </View>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />
      <AdminHeader />

      <FlatList<AdminUserRow>
        data={loading ? [] : (data?.users ?? [])}
        keyExtractor={(user) => user.uid}
        renderItem={({ item }) => <AdminUserCard user={item} />}
        contentContainerStyle={{
          padding: SPACING.base,
          paddingTop: SPACING.sm,
          paddingBottom: tabPadding,
          gap: SPACING.md,
        }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
        ListHeaderComponent={
          <View style={{ gap: SPACING.base, marginBottom: SPACING.md }}>
            {error && data ? <StaleStrip error={error} onRetry={refresh} /> : null}

            {loading ? (
              <AdminSkeleton />
            ) : data ? (
              <>
                <EngagementKpiSection kpis={data.kpis} />

                <AdminSection
                  title="Activity"
                  subtitle="Distinct accounts training each week, and sessions logged each day."
                >
                  <ActiveUsersChart weeks={data.activeWeeks} />
                  <DailySessionsChart days={data.days} total={data.windowTotal} />
                </AdminSection>

                <AdminSection
                  title="What the userbase trains"
                  subtitle="Sessions and training load by sport. The two rank differently, which is the point."
                >
                  <SportDistributionChart
                    slices={data.sportSlices}
                    windowDays={data.windowDays}
                  />
                  <LoadBySportChart bars={data.sportLoad} windowDays={data.windowDays} />
                </AdminSection>

                <AdminSection
                  title="When and how it clashes"
                  subtitle="Training times across the userbase, and which sport pairings actually conflict."
                >
                  <ActivityHeatmapCard heatmap={data.heatmap} windowDays={data.windowDays} />
                  <ConflictMatrixCard
                    matrix={data.conflicts}
                    windowDays={data.windowDays}
                    profilesTruncated={data.profilesTruncated}
                  />
                </AdminSection>

                <AdminSection title="Athletes">
                  <TopUsersCard
                    users={data.topUsers}
                    profilesTruncated={data.profilesTruncated}
                  />
                </AdminSection>

                <WindowNote overview={data} />
                <UsersHeading overview={data} />
              </>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          loading ? null : (
            <EmptyState
              icon="activity"
              title="No users yet"
              message="Accounts appear here as soon as somebody registers."
              tone="quiet"
            />
          )
        }
      />
    </SafeAreaView>
  )
}

function AdminHeader() {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: SPACING.base,
        paddingTop: SPACING.sm,
        paddingBottom: SPACING.xs,
      }}
    >
      <Text style={{ fontSize: TYPE.display, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Admin
      </Text>

      <View
        style={{
          marginLeft: SPACING.md,
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: SPACING.sm + 1,
          paddingVertical: 3,
          borderRadius: RADIUS.pill,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surfaceAlt,
        }}
      >
        <TabIcon name="shield" size={11} color={colors.textMuted} />
        <Text
          style={{
            marginLeft: 4,
            fontSize: TYPE.caption,
            fontWeight: WEIGHT.semibold,
            color: colors.textMuted,
          }}
        >
          read-only
        </Text>
      </View>
    </View>
  )
}

function WindowNote({ overview }: { overview: AdminOverview }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        marginTop: SPACING.sm,
        paddingVertical: SPACING.md,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1,
        borderColor: colors.border,
      }}
    >
      <Text style={{ fontSize: TYPE.caption, lineHeight: 16, color: colors.textMuted }}>
        Charts above are computed from{' '}
        <Text style={{ fontWeight: WEIGHT.heavy, color: colors.textBody }}>
          {formatThousands(overview.sessionsAnalysed)}
        </Text>{' '}
        {overview.sessionsAnalysed === 1 ? 'session' : 'sessions'} logged in the last{' '}
        {overview.windowDays} days, read from each session&apos;s own date. Total users, new
        signups and the daily columns are counted on the server and are exact.
        {overview.sessionsTruncated
          ? ' That window hit its fetch cap, so the oldest weeks on the twelve-week line are incomplete; the last 30 days are whole.'
          : ''}
      </Text>
    </View>
  )
}

function UsersHeading({ overview }: { overview: AdminOverview }) {
  const { colors } = useTheme()

  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text style={{ fontSize: TYPE.title, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Users
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        {overview.truncated
          ?
            `Showing ${overview.users.length} of ${overview.kpis.totalUsers} accounts, most recently active first.`
          : 'Most recently active first.'}
      </Text>
    </View>
  )
}

function errorCopy(error: Error): { title: string; message: string; link: string | null } {
  if (error instanceof MissingIndexError) {
    return {
      title: 'A Firestore index is missing',
      message:
        "Sessions live under each user, so counting them across all accounts is a collection group query — and that needs its own index. Firestore won't answer until it exists.",
      link: error.consoleUrl,
    }
  }
  if (error instanceof AdminDeniedError) {
    return {
      title: 'Access denied',
      message:
        "Firestore refused these queries, which means this account isn't marked as an admin any more.",
      link: null,
    }
  }
  return {
    title: "Couldn't load admin data",
    message:
      'The queries behind this screen failed. If the device is offline these figures need a connection — they are counted on the server, not from the local cache.',
    link: null,
  }
}

function AdminError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { colors } = useTheme()

  const copy = errorCopy(error)

  return (
    <View style={cardStyle(colors)}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TabIcon name="alert-triangle" size={20} color={colors.warn} focused />
        <Text
          style={{
            marginLeft: SPACING.sm,
            flex: 1,
            fontSize: TYPE.subtitle,
            fontWeight: WEIGHT.heavy,
            color: colors.text,
          }}
        >
          {copy.title}
        </Text>
      </View>

      <Text
        style={{
          marginTop: SPACING.md,
          fontSize: TYPE.small,
          lineHeight: 19,
          color: colors.textBody,
        }}
      >
        {copy.message}
      </Text>

      {copy.link ? (
        <View
          style={{
            marginTop: SPACING.md,
            padding: SPACING.md,
            borderRadius: RADIUS.md,
            backgroundColor: colors.infoSoft,
            borderWidth: 1,
            borderColor: colors.infoBorder,
          }}
        >
          <Text
            style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.infoText }}
          >
            Create it in the Firebase console
          </Text>
          <Text
            onPress={() => {
              haptics.light()
              void Linking.openURL(copy.link as string)
            }}
            accessibilityRole="link"
            style={{
              marginTop: SPACING.sm,
              fontSize: TYPE.caption,
              lineHeight: 16,
              color: colors.accentText,
              textDecorationLine: 'underline',
            }}
          >
            {copy.link}
          </Text>
          <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.caption, color: colors.textMuted }}>
            Building takes a few minutes. Pull to refresh once it reports Enabled.
          </Text>
        </View>
      ) : null}

      <PrimaryButton label="Try again" onPress={onRetry} style={{ marginTop: SPACING.base }} />
    </View>
  )
}

function StaleStrip({ error, onRetry }: { error: Error; onRetry: () => void }) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: SPACING.sm + 2,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: colors.warnSoft,
        borderWidth: 1,
        borderColor: colors.warnBorder,
      }}
    >
      <TabIcon name="alert-triangle" size={16} color={colors.warn} focused />
      <Text
        style={{
          flex: 1,
          marginLeft: SPACING.sm,
          fontSize: TYPE.caption,
          lineHeight: 16,
          color: colors.textBody,
        }}
      >
        <Text style={{ fontWeight: WEIGHT.heavy, color: colors.warnText }}>
          {errorCopy(error).title}
        </Text>{' '}
        — these figures are from the last successful load.
      </Text>
      <Text
        onPress={onRetry}
        accessibilityRole="button"
        style={{
          marginLeft: SPACING.sm,
          fontSize: TYPE.caption,
          fontWeight: WEIGHT.heavy,
          color: colors.accentText,
        }}
      >
        Retry
      </Text>
    </View>
  )
}
