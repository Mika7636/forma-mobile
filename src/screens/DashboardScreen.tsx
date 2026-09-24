// FORMA's home screen: where the athlete's training stands now.

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

  const baseline = getBaselineState({ trainingDays, sessionsLogged: totalSessions })

  const [refreshing, setRefreshing] = useState(false)
  const isMounted = useIsMounted()
  const [showAllConflicts, setShowAllConflicts] = useState(false)
  const [detailConflict, setDetailConflict] = useState<Conflict | null>(null)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)

  const firstName = displayName?.split(' ')[0] ?? 'Athlete'
  const now = new Date()
  const greeting = getGreeting(now.getHours())
  const todayLabel = now.toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  })

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
    useMetricsStore.getState().recalculate(sessions)
    await new Promise((resolve) => setTimeout(resolve, 400))
    if (!isMounted.current) return
    setRefreshing(false)
  }, [sessions, isMounted])

  const sessionsLabel =
    sessionCount === 0
      ? 'Nothing logged this week yet'
      : `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'} this week`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
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

        {visibleConflicts.length > 0 ? (
          <View style={{ marginTop: 16, gap: 8 }}>
            {visibleConflicts.map((conflict, index) => (
              <ConflictBanner
                key={conflict.conflictId}
                conflict={conflict}
                extraCount={index === 0 && !showAllConflicts ? sortedConflicts.length - 1 : 0}
                onDismiss={dismissConflict}
                onShowMore={() => setShowAllConflicts(true)}
                onPress={setDetailConflict}
              />
            ))}
          </View>
        ) : null}

        {verification.showBanner ? (
          <VerifyEmailBanner
            sending={verification.sending}
            cooldown={verification.cooldown}
            onResend={() => void verification.resend()}
            onDismiss={verification.dismiss}
          />
        ) : null}

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
            <Animated.View entering={FadeIn.duration(280)} style={{ gap: SPACING.lg - 4 }}>
              {baseline.building ? (
                <CalibratingFormCard baseline={baseline} onLogSession={goToLog} />
              ) : (
                <FormScoreCard form={formScore} ctl={ctl} atl={atl} />
              )}

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
