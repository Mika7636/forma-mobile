// The dashboard's single data source: joins the real-time session history with
// the derived training metrics and shapes them into exactly what the screen
// renders. Everything here recomputes automatically when a session is logged,
// because the sessions store's snapshot listener feeds the metrics store.
import { useMemo } from 'react'
import { getFormStatus, type FormStatus } from '../algorithms/formScore'
import { useAuthStore } from '../store/authStore'
import { useMetricsStore } from '../store/metricsStore'
import { useSessionHistory } from './useSessionHistory'
import { calculateStreak } from '../utils/streak'
import { isDistanceSport } from '../services/sessionService'
import type { Session } from '../types/session'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface DashboardMetrics {
  /** Last 42 days, newest first. */
  sessions: Session[]
  /** Last 7 days, newest first. */
  weekSessions: Session[]
  loading: boolean
  error: Error | null

  /** CTL − ATL, rounded for display. */
  formScore: number
  formStatus: FormStatus
  /** Chronic load — "fitness". */
  ctl: number
  /** Acute load — "fatigue". */
  atl: number

  weeklyLoad: number
  /** Total AU in the 7 days *before* this week, for the trend arrow. */
  previousWeeklyLoad: number
  weeklyHours: number
  weeklyCalories: number
  weeklyDistanceKm: number
  /** The user's weekly training-hours target from onboarding. */
  budgetHours: number
  /** Sessions in the current week (7 days). */
  sessionCount: number
  /** Sessions in the last 42 days — the conflict engine's calibration softener. */
  totalSessionCount: number
  /**
   * Distinct calendar days carrying a session across **all** history — the
   * baseline gate's meter. Not windowed, unlike everything above it, because a
   * gate counted inside a rolling 42-day window could never open. See
   * `utils/calibration`.
   */
  trainingDays: number
  /** Sessions across all history, for the baseline card's caption. */
  totalSessions: number
  streak: number
}

export function useMetrics(): DashboardMetrics {
  const { sessions, trainingDays, totalSessions, loading, error } = useSessionHistory()
  const budgetHours = useAuthStore((s) => s.profile?.weeklyBudgetHours ?? 0)

  const ctl = useMetricsStore((s) => s.ctl)
  const atl = useMetricsStore((s) => s.atl)
  const form = useMetricsStore((s) => s.form)
  const weeklyLoad = useMetricsStore((s) => s.weeklyLoad)
  const weeklyHours = useMetricsStore((s) => s.weeklyHours)
  const weeklyCalories = useMetricsStore((s) => s.weeklyCalories)

  const weekSessions = useMemo(() => {
    const cutoff = Date.now() - WEEK_MS
    return sessions.filter((s) => new Date(s.date).getTime() >= cutoff)
  }, [sessions])

  // Load logged in the 7 days before this week — the trend-arrow baseline.
  const previousWeeklyLoad = useMemo(() => {
    const weekAgo = Date.now() - WEEK_MS
    const twoWeeksAgo = Date.now() - 2 * WEEK_MS
    return sessions
      .filter((s) => {
        const t = new Date(s.date).getTime()
        return t >= twoWeeksAgo && t < weekAgo
      })
      .reduce((sum, s) => sum + s.loadScore, 0)
  }, [sessions])

  // Only running/swimming/cycling carry a meaningful distance.
  const weeklyDistanceKm = useMemo(
    () =>
      weekSessions
        .filter((s) => isDistanceSport(s.sport))
        .reduce((sum, s) => sum + (s.distanceKm ?? 0), 0),
    [weekSessions],
  )

  const streak = useMemo(() => calculateStreak(sessions), [sessions])
  const formScore = Math.round(form)

  return {
    sessions,
    weekSessions,
    loading,
    error,
    formScore,
    formStatus: getFormStatus(form, ctl),
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    weeklyLoad,
    previousWeeklyLoad,
    weeklyHours,
    weeklyCalories,
    weeklyDistanceKm,
    budgetHours,
    sessionCount: weekSessions.length,
    totalSessionCount: sessions.length,
    trainingDays,
    totalSessions,
    streak,
  }
}
