// The Dashboard's single data source.

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
  sessions: Session[]
  weekSessions: Session[]
  loading: boolean
  error: Error | null

  formScore: number
  formStatus: FormStatus
  ctl: number
  atl: number

  weeklyLoad: number
  previousWeeklyLoad: number
  weeklyHours: number
  weeklyCalories: number
  weeklyDistanceKm: number
  budgetHours: number
  sessionCount: number
  totalSessionCount: number
  trainingDays: number
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
