// FORMA's home screen: one glance should answer "where does my training stand
// right now?" — form, load, budget, zones and recent activity.
//
// Everything here is live. The sessions store holds a Firestore snapshot
// listener, which feeds the metrics store, so a session logged on the Log tab
// (or on the web app, or another device) lands here with no refresh.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { StatusBar } from 'expo-status-bar'
import Animated, { FadeIn } from 'react-native-reanimated'
import * as Haptics from 'expo-haptics'
import CalibratingFormCard from '../components/dashboard/CalibratingFormCard'
import ConflictBanner from '../components/dashboard/ConflictBanner'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import DashboardSkeleton from '../components/dashboard/DashboardSkeleton'
import EmptyDashboardState from '../components/dashboard/EmptyDashboardState'
import FormScoreCard from '../components/dashboard/FormScoreCard'
import MetricGrid from '../components/dashboard/MetricGrid'
import RecentActivity from '../components/dashboard/RecentActivity'
import ZoneDistributionChart from '../components/dashboard/ZoneDistributionChart'
import SessionDetailModal from '../components/session/SessionDetailModal'
import { COLORS } from '../constants/theme'
import { getCalibrationState } from '../utils/calibration'
import { useConflicts } from '../hooks/useConflicts'
import { useMetrics } from '../hooks/useMetrics'
import { useAuthStore } from '../store/authStore'
import { useMetricsStore } from '../store/metricsStore'
import type { DashboardScreenProps } from '../navigation/types'
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'

function getGreeting(hour: number): string {
  if (hour < 12) return 'Good morning'
  if (hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export default function DashboardScreen({ navigation }: DashboardScreenProps) {
  const displayName = useAuthStore((s) => s.user?.displayName)
  const createdAt = useAuthStore((s) => s.profile?.createdAt)
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
    totalSessionCount,
    streak,
  } = useMetrics()
  const { conflicts, dismissConflict } = useConflicts()

  // While the user is still in their calibration window, the raw Form Score is
  // statistically noise — show the "Building Your Baseline" hero instead of a
  // potentially alarming red card. (Blended CTL keeps the number sane too.)
  const calibration = getCalibrationState(totalSessionCount, createdAt)

  const [refreshing, setRefreshing] = useState(false)
  const [showAllConflicts, setShowAllConflicts] = useState(false)
  const [detailConflict, setDetailConflict] = useState<Conflict | null>(null)
  // See RecentActivity: NativeWind's JSX wrapper drops a function-form `style`,
  // so press feedback is tracked explicitly and the style stays an object.
  const [logPressed, setLogPressed] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current)
    },
    [],
  )

  const showToast = useCallback((message: string) => {
    setToast(message)
    if (toastTimer.current) clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(null), 2200)
  }, [])

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    navigation.navigate('Log')
  }, [navigation])

  const handleSelectSession = useCallback((session: Session) => {
    setSelectedSession(session)
  }, [])

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    setRefreshing(true)
    // The snapshot listener means the session data is already current, so this
    // is a safety net rather than a fetch. What it does do genuinely: recompute
    // the time-windowed figures ("this week", streak, CTL/ATL), which drift as
    // the clock crosses a day boundary while the app sits open.
    useMetricsStore.getState().recalculate(sessions)
    // Hold the spinner briefly so the gesture reads as acknowledged instead of
    // snapping back instantly.
    await new Promise((resolve) => setTimeout(resolve, 400))
    setRefreshing(false)
  }, [sessions])

  const sessionsLabel = `${sessionCount} ${sessionCount === 1 ? 'session' : 'sessions'} this week`

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.fieldBg }} edges={['top']}>
      {/* The header sits on the light page background, not on the hero gradient,
          so dark status-bar content is what stays legible here. */}
      <StatusBar style="dark" />

      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={COLORS.teal}
            colors={[COLORS.teal]}
          />
        }
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 24, fontWeight: '800', color: COLORS.ink }}>
              {greeting}, {firstName}
            </Text>
            <Text style={{ marginTop: 3, fontSize: 13.5, color: COLORS.muted }}>
              {todayLabel}
            </Text>
            <Text style={{ marginTop: 1, fontSize: 13, fontWeight: '600', color: COLORS.teal }}>
              {sessionsLabel}
            </Text>
          </View>

          <Pressable
            onPress={goToLog}
            onPressIn={() => setLogPressed(true)}
            onPressOut={() => setLogPressed(false)}
            accessibilityRole="button"
            accessibilityLabel="Log a session"
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: logPressed ? COLORS.tealDark : COLORS.teal,
              alignItems: 'center',
              justifyContent: 'center',
              shadowColor: COLORS.teal,
              shadowOpacity: 0.4,
              shadowRadius: 10,
              shadowOffset: { width: 0, height: 5 },
              elevation: 6,
            }}
          >
            <Text style={{ fontSize: 26, fontWeight: '700', color: COLORS.white, marginTop: -3 }}>
              +
            </Text>
          </Pressable>
        </View>

        {/* Couldn't reach Firestore — say so rather than implying zero training. */}
        {error ? (
          <View
            style={{
              marginTop: 16,
              backgroundColor: '#FEF2F2',
              borderWidth: 1,
              borderColor: '#FECACA',
              borderRadius: 12,
              padding: 12,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '600', color: '#B91C1C' }}>
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

        {/* Body */}
        <View style={{ marginTop: 20 }}>
          {loading ? (
            <DashboardSkeleton />
          ) : sessions.length === 0 ? (
            <EmptyDashboardState onLogSession={goToLog} />
          ) : (
            <Animated.View entering={FadeIn.duration(280)} style={{ gap: 20 }}>
              {calibration.isCalibrating ? (
                <CalibratingFormCard
                  form={formScore}
                  ctl={ctl}
                  atl={atl}
                  sessionsLogged={calibration.sessionsLogged}
                />
              ) : (
                <FormScoreCard form={formScore} ctl={ctl} atl={atl} />
              )}

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
        onDeleted={() => showToast('Session deleted')}
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

      {toast ? (
        <Animated.View
          entering={FadeIn.duration(200)}
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 24,
            backgroundColor: COLORS.ink,
            borderRadius: 14,
            paddingVertical: 14,
            paddingHorizontal: 18,
            shadowColor: '#000',
            shadowOpacity: 0.2,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <Text
            style={{ color: COLORS.white, fontSize: 14, fontWeight: '700', textAlign: 'center' }}
          >
            {toast}
          </Text>
        </Animated.View>
      ) : null}
    </SafeAreaView>
  )
}
