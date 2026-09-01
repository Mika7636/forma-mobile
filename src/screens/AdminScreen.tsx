// Admin — a read-only window on the whole userbase.
//
// ## Read-only is a property of the code, not a promise in the copy
//
// There is no write path on this screen. It imports no mutation, renders no
// control that could start one, and its rows are plain `View`s with no press
// handler — see `AdminUserCard`. The "read-only" pill in the header is a label
// for something the file already guarantees, and the Firestore rules guarantee
// it a second time: an admin's grant is `allow read`, so even a future edit
// button would be denied by the backend.
//
// ## Three gates, and only one of them is real
//
//  1. `MainTabs` registers this tab only when `isAdmin` is true, so the route
//     does not exist for anyone else and no deep link can reach it.
//  2. This component checks again on mount, because gate 1 is navigator state
//     and gate 2 is the screen refusing to render regardless of how it got here.
//  3. `firestore.rules` denies every query below to a non-admin.
//
// Only (3) is security. (1) and (2) are the UI declining to show a page that
// would be nothing but an error — a user who forged `isAdmin` in local storage
// gets past both of them and lands on "This account does not have admin access",
// because the server is the one that decides.
import { useCallback, useState } from 'react'
import { FlatList, Linking, RefreshControl, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import AdminSkeleton from '../components/admin/AdminSkeleton'
import AdminUserCard from '../components/admin/AdminUserCard'
import DailySessionsChart from '../components/admin/DailySessionsChart'
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
import { sportVisual } from '../utils/sportMeta'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'

export default function AdminScreen() {
  const { colors } = useTheme()
  const tabPadding = useTabContentPadding()

  // Gate 2 — see the header note. Read from the Firestore profile, defaulted to
  // false by `toUser` when the field is absent.
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

  // An error with nothing to fall back on takes the whole page. An error with
  // stale data behind it does not — see `useAdminOverview`, which keeps the last
  // good result: blanking a working screen because a refresh failed on a train
  // is worse than the figures being a few minutes old, so that case renders the
  // data with a strip above it instead.
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
            {/* A failed refresh over data we still have. Quiet, and above
                everything, so the figures below it are visibly the old ones. */}
            {error && data ? <StaleStrip error={error} onRetry={refresh} /> : null}

            {loading ? (
              <AdminSkeleton />
            ) : data ? (
              <>
                <SummaryRow overview={data} />
                <DailySessionsChart days={data.days} total={data.windowTotal} />
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

/* ------------------------------------------------------------------ */
/* Header                                                              */
/* ------------------------------------------------------------------ */

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

      {/* The pill states the screen's one constraint where it will be read
          first. Outlined rather than filled: it is a fact about the page, not a
          status that changes, and a solid chip would compete with the figures
          below for the eye's first stop. */}
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

/* ------------------------------------------------------------------ */
/* Summary                                                             */
/* ------------------------------------------------------------------ */

/**
 * Three figures, in the Progress screen's summary style: small grey label on a
 * shared upper line, big values on one unbroken baseline, no boxes. The reader
 * wants all three at once — see the note in `ThisWeekBlock`, which is where this
 * treatment is defined and argued.
 */
function SummaryRow({ overview }: { overview: AdminOverview }) {
  const { colors } = useTheme()

  const top = overview.topSport
  const topLabel = top ? sportVisual(top.sport, colors).label : 'None yet'

  return (
    <View style={cardStyle(colors)}>
      <View style={{ flexDirection: 'row' }}>
        <Stat label="Total users" value={String(overview.totalUsers)} />
        <Stat label="Sessions this week" value={String(overview.sessionsThisWeek)} />
        <Stat
          label="Top sport"
          value={topLabel}
          // The sport name is a word, not a figure, and at the numerals' size a
          // long one ("Combat Sports") wraps into the row below or truncates to
          // nonsense. Dropping it a step keeps the row's baseline intact.
          small
          hint={top ? `${top.count} this week` : undefined}
        />
      </View>
    </View>
  )
}

function Stat({
  label,
  value,
  small = false,
  hint,
}: {
  label: string
  value: string
  small?: boolean
  hint?: string
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, minWidth: 0, paddingRight: SPACING.sm }}>
      <Text
        numberOfLines={2}
        style={{ fontSize: TYPE.small, color: colors.textMuted, marginBottom: 3 }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: small ? TYPE.subtitle : TYPE.heading,
          lineHeight: 27,
          fontWeight: WEIGHT.bold,
          color: colors.text,
        }}
      >
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={1} style={{ fontSize: TYPE.caption, color: colors.textSubtle }}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* User list heading                                                   */
/* ------------------------------------------------------------------ */

function UsersHeading({ overview }: { overview: AdminOverview }) {
  const { colors } = useTheme()

  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text style={{ fontSize: TYPE.title, fontWeight: WEIGHT.heavy, color: colors.text }}>
        Users
      </Text>
      <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
        {overview.truncated
          ? // Said plainly, including *which* hundred. The cap is applied by
            // Firestore before the sort, so this is not "the 100 most recently
            // active" and claiming otherwise would be a lie the reader can't
            // check. See the query note in `adminService`.
            `Showing ${overview.users.length} of ${overview.totalUsers} accounts, most recently active first.`
          : 'Most recently active first.'}
      </Text>
    </View>
  )
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/** What to say, and what — if anything — the reader can do about it. */
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

/**
 * The full-page failure.
 *
 * The missing-index case is called out by name rather than folded into a generic
 * "something went wrong", because it is the one failure here with a one-click
 * fix — and Firestore hands us the link to it in the error message. Burying that
 * under "try again" would leave an admin retrying a query that cannot succeed
 * until somebody creates an index they were never told about.
 */
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

/** A failed refresh with usable data still on screen. */
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
