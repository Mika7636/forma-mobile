// Zustand metrics store. Derives FORMA's training-state numbers (CTL / ATL /
// Form + the current week's aggregates) from a session list. Ported from the
// web app; `recalculate` is driven by the sessions store so every snapshot from
// Firestore refreshes the dashboard with no manual wiring at the screen level.
import { create } from 'zustand'
import { buildDailyLoads, calculateATL, calculateCTL } from '../algorithms/ctlAtl'
import { calculateForm } from '../algorithms/formScore'
import { useAuthStore } from './authStore'
import { daysSince } from '../utils/dates'
import type { Session } from '../types/session'

/** Matches the session-history window; CTL is a 42-day chronic average. */
const DAILY_LOAD_WINDOW_DAYS = 42
const WEEKLY_WINDOW_DAYS = 7

interface MetricsState {
  /** Chronic training load — "fitness". */
  ctl: number
  /** Acute training load — "fatigue". */
  atl: number
  /** CTL − ATL. Positive = fresh, negative = fatigued. */
  form: number
  weeklyLoad: number
  weeklyHours: number
  weeklyCalories: number
  /** Load per ISO day over the CTL window, used by the chart + CTL/ATL maths. */
  dailyLoads: Record<string, number>
  /** False until the first recalculate() — lets the UI tell "empty" from "not yet loaded". */
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

    // Seed CTL from the onboarding baseline during the cold-start window so a
    // new user isn't shown a false "Overreaching" Form. Read straight from the
    // auth store (no import cycle: authStore never imports this store).
    const profile = useAuthStore.getState().profile
    const ctl = calculateCTL(dailyLoads, {
      baselineCTL: profile?.baselineCTL,
      daysSinceRegistration: profile ? daysSince(profile.createdAt) : undefined,
    })
    const atl = calculateATL(dailyLoads)
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
