import type { Session } from '../types/session'
import { toISODate } from '../utils/dates'

const ATL_WINDOW_DAYS = 7

export function buildDailyLoads(sessions: Session[], days: number): Record<string, number> {
  const dailyLoads: Record<string, number> = {}

  const today = new Date()
  for (let i = 0; i < days; i++) {
    const day = new Date(today)
    day.setDate(today.getDate() - i)
    dailyLoads[toISODate(day)] = 0
  }

  for (const session of sessions) {
    const day = toISODate(new Date(session.date))
    if (day in dailyLoads) {
      dailyLoads[day] += session.loadScore
    }
  }

  return dailyLoads
}

export function calculateCTL(dailyLoads: Record<string, number>): number {
  return averageOfMostRecentDays(dailyLoads, Object.keys(dailyLoads).length)
}

export function calculateATL(dailyLoads: Record<string, number>): number {
  return averageOfMostRecentDays(dailyLoads, ATL_WINDOW_DAYS)
}

function averageOfMostRecentDays(dailyLoads: Record<string, number>, days: number): number {
  const recentDates = Object.keys(dailyLoads).sort().slice(-days)
  if (recentDates.length === 0) return 0
  const total = recentDates.reduce((sum, date) => sum + dailyLoads[date], 0)
  return Math.round(total / recentDates.length)
}
