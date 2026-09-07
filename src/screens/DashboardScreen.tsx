// FORMA's home screen: one glance should answer "where does my training stand
// right now?" — form, load, budget, zones and recent activity.
//
// Everything here is live. The sessions store holds a Firestore snapshot
// listener, which feeds the metrics store, so a session logged on the Log tab
// (or on the web app, or another device) lands here with no refresh.
import { useCallback, useMemo, useState } from 'react'
import { RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import Animated, { FadeIn } from 'react-native-reanimated'
import CalibratingFormCard from '../components/dashboard/CalibratingFormCard'
import ConflictBanner from '../components/dashboard/ConflictBanner'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton'
import EmptyDashboardState from '../components/dashboard/EmptyDashboardState'
import FormScoreCard from '../components/dashboard/FormScoreCard'
import MetricGrid from '../components/dashboard/MetricGrid'
import NextWeekPlanCard from '../components/dashboard/NextWeekPlanCard'
import RecentActivity from '../components/dashboard/RecentActivity'
import VerifyEmailBanner from '../components/dashboard/VerifyEmailBanner'
import ZoneDistributionChart from '../components/dashboard/ZoneDistributionChart'
import SessionDetailModal from '../components/session/SessionDetailModal'
import PressableScale from '../components/ui/PressableScale'
import { getBaselineState } from '../utils/calibration'
import { haptics } from '../utils/haptics'
import { localISODate } from '../utils/dates'
import { useConflicts } from '../hooks/useConflicts'
import { useEmailVerification } from '../hooks/useEmailVerification'
import { usePlannedSessions } from '../hooks/usePlannedSessions'
import { useIsMounted } from '../hooks/useSafeTimeout'
import { useMetrics } from '../hooks/useMetrics'
import { useRecommendations } from '../hooks/useRecommendations'
import { addPlannedSession } from '../services/plannedSessionService'
import { isOffline } from '../store/networkStore'
import { useAuthStore } from '../store/authStore'
import { useMetricsStore } from '../store/metricsStore'
import { toast } from '../store/toastStore'
import type { DashboardScreenProps } from '../navigation/types'
import type { SuggestedSession } from '../algorithms/recommender'
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'
import { RADIUS, SPACING, TYPE } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const { colors } = useTheme()
  // Reserve room for the tab bar, which is drawn over the end of this list.
  const tabPadding = useTabContentPadding()

  const displayName = useAuthStore((s) => s.user?.displayName)
  const uid = useAuthStore((s) => s.user?.uid)
  const {
    sessions,
    weekSessions,
    loading,
    error,
    formScore,
    ctl,
    atl,
    weeklyLoad,
    previousWeeklyLoad,
    weeklyHours,
    weeklyCalories,
    weeklyDistanceKm,
    budgetHours,
    sessionCount,
    trainingDays,
    totalSessions,
    streak,
  } = useMetrics()
  const { conflicts, dismissConflict } = useConflicts()
  const {
    plan: weekPlan,
    recovery,
    refresh: refreshSuggestions,
  } = useRecommendations()
  const { byDay: plannedByDay, conflictsByDay: plannedConflictsByDay } = usePlannedSessions()
  const verification = useEmailVerification()

  /**
   * Under 42 days of actual *training*, the Form Score is an artefact of the
   * CTL/ATL ramp rather than a measurement, so the hero shows how far along the
   * baseline is instead of publishing a number the app can't stand behind.
   *
   * Fed from the un-windowed counts rather than from `sessions`, which is cut to
   * the last 42 calendar days — see `utils/calibration` for why that difference
   * decides whether the gate can ever open.
   */
  const baseline = getBaselineState({ trainingDays, sessionsLogged: totalSessions })

  const [refreshing, setRefreshing] = useState(false)
  const isMounted = useIsMounted()
  const [showAllConflicts, setShowAllConflicts] = useState(false)
  const [detailConflict, setDetailConflict] = useState<Conflict | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  const firstName = displayName?.split(' ')[0] ?? 'Athlete'
  // Recomputed per render rather than memoised on mount: the screen re-renders
  // as data streams in, and a greeting cached at 11:59 shouldn't say "morning"
  // for the rest of the session.
  const now = new Date()
  const greeting = getGreeting(now.getHours())
  const todayLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

  // Most severe first (danger before warning); the hook already hands them over
  // newest-first, and Array.sort is stable, so that ordering survives within a
  // severity band.
  const sortedConflicts = useMemo(
    () =>
      [...conflicts].sort(
        (a, b) => (b.severity === 'danger' ? 1 : 0) - (a.severity === 'danger' ? 1 : 0),
      ),
    [conflicts],
  )
  const visibleConflicts = showAllConflicts ? sortedConflicts : sortedConflicts.slice(0, 1)

  const goToLog = useCallback(() => {
    navigation.navigate('Log')
  }, [navigation])

  const goToPlanner = useCallback(() => {
    navigation.navigate('Planner')
  }, [navigation])

  /**
   * Turn one suggestion into a plan on the calendar.
   *
   * The suggestion already carries a date, a duration and a target RPE that
   * multiply back to its share of the week's budget, so nothing is recomputed
   * here — the values written are the values the card showed. Resolves false on
   * failure so the row can re-enable its button.
   *
   * Routing to the Planner on success is the point: a plan the athlete cannot
   * see is indistinguishable from a tap that did nothing, and the Planner is
   * where it can be moved, hardened or deleted.
   */
  const handlePlanIt = useCallback(
    async (suggestion: SuggestedSession): Promise<boolean> => {
      if (!uid) return false
      try {
        await addPlannedSession(uid, {
          sport: suggestion.sport,
          date: suggestion.date,
          durationMinutes: suggestion.durationMinutes,
          intensity: suggestion.rpe,
        })
        haptics.success()
        toast.success('Added to your plan')
        goToPlanner()
        return true
      } catch {
        toast.error('Could not save the plan', {
          description: isOffline()
            ? "You're offline — reconnect and try again."
            : 'Something went wrong. Please try again.',
        })
        return false
      }
    },
    [uid, goToPlanner],
  )

  // What the "available now" panel shows a zero-session account: the plan for
  // today, and any clash the engine has already found in the next two days. Both
  // are real output on an account with no history — that is the point of them.
  const todayIso = localISODate(now)
  const tomorrowIso = localISODate(new Date(now.getTime() + 86_400_000))
  const todayPlanned = useMemo(
    () => plannedByDay.get(todayIso) ?? [],
    [plannedByDay, todayIso],
  )
  const upcomingPlannedConflicts = useMemo(() => {
    const seen = new Set<string>()
    return [
      ...(plannedConflictsByDay.get(todayIso) ?? []),
      ...(plannedConflictsByDay.get(tomorrowIso) ?? []),
    ].filter((c) => (seen.has(c.id) ? false : (seen.add(c.id), true)))
  }, [plannedConflictsByDay, todayIso, tomorrowIso])

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session)
  }, [])

  const handleRefresh = useCallback(async () => {
    haptics.medium()
    setRefreshing(true)
    // The snapshot listener means the session data is already current, so this
    // is a safety net rather than a fetch. What it does do genuinely: recompute
    // the time-windowed figures ("this week", streak, CTL/ATL), which drift as
    // the clock crosses a day boundary while the app sits open.
    useMetricsStore.getState().recalculate(sessions)
    // Hold the spinner briefly so the gesture reads as acknowledged instead of
    // snapping back instantly.
    await new Promise((resolve) => setTimeout(resolve, 400))
    // Switching tabs mid-pull unmounts this before the delay is up.
    if (!isMounted.current) return
    setRefreshing(false)
  }, [sessions, isMounted])

  // Never "0 sessions this week": a zero is a fact about the app's storage, not
  // about the athlete, and on a first run it is the first thing they read.
  const sessionsLabel =
    sessionCount === 0
      ? 'Nothing logged this week yet'
      : `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'} this week`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      {/* The header sits on the light page background, not on the hero gradient,
          so dark status-bar content is what stays legible here. */}
      <ThemedStatusBar />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: tabPadding }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.accent}
            colors={[colors.accent]}
          />
        }
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: TYPE.heading, fontWeight: '800', color: colors.text }}>
              {greeting}, {firstName}
            </Text>
            <Text style={{ marginTop: 3, fontSize: TYPE.body, color: colors.textMuted }}>
              {todayLabel}
            </Text>
            <Text style={{ marginTop: 2, fontSize: TYPE.small, fontWeight: '600', color: colors.accentText }}>
              {sessionsLabel}
            </Text>
          </View>

          <PressableScale
            onPress={goToLog}
            haptic="medium"
            accessibilityRole="button"
            accessibilityLabel="Log a session"
            style={{
              width: 46,
              height: 46,
              borderRadius: RADIUS.pill,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: colors.accent,
              shadowOpacity: 0.4,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 5 },
              elevation: 6,
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: '700', color: colors.onAccent, marginTop: -3 }}>
              +
            </Text>
          </PressableScale>
        </View>

        {/* Couldn't reach Firestore — say so rather than implying zero training. */}
        {error ? (
          <View
            style={{
              marginTop: SPACING.base,
              backgroundColor: colors.dangerSoft,
              borderWidth: 1,
              borderColor: colors.dangerBorder,
              borderRadius: RADIUS.md,
              padding: SPACING.md,
            }}
          >
            <Text style={{ fontSize: TYPE.small, fontWeight: '600', color: colors.dangerText }}>
              Couldn&apos;t load your latest sessions. Pull down to retry.
            </Text>
          </View>
        ) : null}

        {/* Conflict banners — FORMA's signature injury-risk warnings. */}
        {visibleConflicts.length > 0 ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            {visibleConflicts.map((conflict, index) => (
              <ConflictBanner
                key={conflict.conflictId}
                conflict={conflict}
                // Only the top banner advertises the hidden ones.
                extraCount={index === 0 && !showAllConflicts ? sortedConflicts.length - 1 : 0}
                onDismiss={dismissConflict}
                onShowMore={() => setShowAllConflicts(true)}
                onPress={setDetailConflict}
              />
            ))}
          </View>
        ) : null}

        {/* Account hygiene, deliberately *below* the conflict banners: an
            unverified address is a housekeeping note and a flagged clash is an
            injury risk, and if both are on screen the risk is the one that
            should be read first. Suppressed entirely in demo mode — see
            `useEmailVerification`. */}
        {verification.showBanner ? (
          <VerifyEmailBanner
            sending={verification.sending}
            cooldown={verification.cooldown}
            onResend={() => void verification.resend()}
            onDismiss={verification.dismiss}
          />
        ) : null}

        {/* Body */}
        <View style={{ marginTop: 20 }}>
          {loading ? (
            <DashboardSkeleton />
          ) : sessions.length === 0 ? (
            <EmptyDashboardState
              todayPlanned={todayPlanned}
              plannedConflicts={upcomingPlannedConflicts}
              onLogSession={goToLog}
              onPlanWeek={goToPlanner}
            />
          ) : (
            // 20pt between the hero and the grid under it. The hero is a
            // saturated object and the stat cards are white ones; at the 16pt
            // the rest of the page uses they crowd, and the grid reads as part
            // of the card above it rather than as the next section.
            <Animated.View entering={FadeIn.duration(280)} style={{ gap: SPACING.lg - 4 }}>
              {baseline.building ? (
                <CalibratingFormCard baseline={baseline} onLogSession={goToLog} />
              ) : (
                <FormScoreCard form={formScore} ctl={ctl} atl={atl} />
              )}

              {/* Directly under the hero, because it is the only thing on this
                  screen that says what to do *next*. Everything below it —
                  grid, zones, recent activity — reports what has already
                  happened. `null` while the profile is still loading; the card
                  handles its own insufficient-data state. */}
              {weekPlan ? (
                <NextWeekPlanCard
                  plan={weekPlan}
                  recovery={recovery}
                  onPlanIt={handlePlanIt}
                  onRefresh={refreshSuggestions}
                  onLogSession={goToLog}
                />
              ) : null}

              <MetricGrid
                weeklyLoad={weeklyLoad}
                previousWeeklyLoad={previousWeeklyLoad}
                weeklyHours={weeklyHours}
                budgetHours={budgetHours}
                sessionCount={sessionCount}
                weeklyCalories={weeklyCalories}
                weeklyDistanceKm={weeklyDistanceKm}
                streak={streak}
              />

              <ZoneDistributionChart weekSessions={weekSessions} />

              <RecentActivity
                sessions={sessions}
                onSelect={handleSelectSession}
                baseDelay={300}
              />
            </Animated.View>
          )}
        </View>
      </ScrollView>

      <SessionDetailModal
        visible={selectedSession != null}
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onDeleted={() => toast.success('Session deleted')}
      />

      <ConflictDetailSheet
        conflicts={detailConflict ? [detailConflict] : null}
        sessions={sessions}
        onClose={() => setDetailConflict(null)}
        onDismiss={(id) => {
          void dismissConflict(id)
          setDetailConflict(null)
        }}
      />
    </SafeAreaView>
  )
}
