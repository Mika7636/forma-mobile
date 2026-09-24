// Derives CTL, ATL, Form and this week's totals from sessions.

import { create } from 'zustand'
import { buildDailyLoads, calculateATL, calculateCTL } from '../algorithms/ctlAtl'
import { calculateForm } from '../algorithms/formScore'
import { useAuthStore } from './authStore'
import { daysSince } from '../utils/dates'
import type { Session } from '../types/session'

const DAILY_LOAD_WINDOW_DAYS = 42
const WEEKLY_WINDOW_DAYS = 7

interface MetricsState {
  ctl: number
  atl: number
  form: number
  weeklyLoad: number
  weeklyHours: number
  weeklyCalories: number
  dailyLoads: Record<string, number>
  computed: boolean
  recalculate: (sessions: Session[]) => void
  reset: () => void
}

const initialState = {
  ctl: 0,
  atl: 0,
  form: 0,
  weeklyLoad: 0,
  weeklyHours: 0,
  weeklyCalories: 0,
  dailyLoads: {} as Record<string, number>,
  computed: false,
}

export const useMetricsStore = create<MetricsState>((set) => ({
  ...initialState,

  recalculate: (sessions) => {
    const dailyLoads = buildDailyLoads(sessions, DAILY_LOAD_WINDOW_DAYS)

    const profile = useAuthStore.getState().profile
    const daysSinceRegistration = profile ? daysSince(profile.createdAt) : undefined
    const baselineCTL = profile?.baselineCTL
    const baselineATL = baselineCTL != null ? baselineCTL * 0.9 : undefined
    const ctl = calculateCTL(dailyLoads, { baselineCTL, daysSinceRegistration })
    const atl = calculateATL(dailyLoads, { baselineATL, daysSinceRegistration })
    const form = calculateForm(ctl, atl)

    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - WEEKLY_WINDOW_DAYS)
    const recent = sessions.filter((session) => new Date(session.date) >= cutoff)

    const weeklyLoad = recent.reduce((sum, s) => sum + s.loadScore, 0)
    const weeklyHours = recent.reduce((sum, s) => sum + s.durationMinutes, 0) / 60
    const weeklyCalories = recent.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)

    set({
      ctl,
      atl,
      form,
      weeklyLoad,
      weeklyHours,
      weeklyCalories,
      dailyLoads,
      computed: true,
    })
  },

  reset: () => set({ ...initialState }),
}))
