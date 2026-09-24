// Daily load buckets, plus CTL (fitness) and ATL (fatigue) averages.

import type { Session } from '../types/session'
import { localISODate } from '../utils/dates'

const ATL_WINDOW_DAYS = 7

const CTL_BLEND_DAYS = 21

const ATL_BLEND_DAYS = 21

export function buildDailyLoads(
  sessions: Session[],
  days: number,
  now: Date = new Date(),
): Record<string, number> {
  const dailyLoads: Record<string, number> = {}

  const cursor = new Date(now)
  cursor.setHours(12, 0, 0, 0)
  for (let i = 0; i < days; i++) {
    const day = new Date(cursor)
    day.setDate(cursor.getDate() - i)
    dailyLoads[localISODate(day)] = 0
  }

  for (const session of sessions) {
    const day = localISODate(new Date(session.date))
    if (day in dailyLoads) {
      dailyLoads[day] += session.loadScore
    }
  }

  return dailyLoads
}

export function calculateCTL(
  dailyLoads: Record<string, number>,
  options?: { baselineCTL?: number; daysSinceRegistration?: number },
): number {
  const calculatedCTL = averageOfMostRecentDays(dailyLoads, Object.keys(dailyLoads).length)

  const { baselineCTL, daysSinceRegistration } = options ?? {}
  if (baselineCTL == null || daysSinceRegistration == null) {
    return calculatedCTL
  }

  const dataWeight = Math.min(daysSinceRegistration / CTL_BLEND_DAYS, 1)
  const remainingWeight = 1 - dataWeight
  return Math.round(baselineCTL * remainingWeight + calculatedCTL * dataWeight)
}

export function calculateATL(
  dailyLoads: Record<string, number>,
  options?: { baselineATL?: number; daysSinceRegistration?: number },
): number {
  const calculatedATL = averageOfMostRecentDays(dailyLoads, ATL_WINDOW_DAYS)

  const { baselineATL, daysSinceRegistration } = options ?? {}
  if (baselineATL == null || daysSinceRegistration == null) {
    return calculatedATL
  }

  const dataWeight = Math.min(daysSinceRegistration / ATL_BLEND_DAYS, 1)
  const remainingWeight = 1 - dataWeight
  return Math.round(baselineATL * remainingWeight + calculatedATL * dataWeight)
}

function averageOfMostRecentDays(dailyLoads: Record<string, number>, days: number): number {
  const recentDates = Object.keys(dailyLoads).sort().slice(-days)
  if (recentDates.length === 0) return 0
  const total = recentDates.reduce((sum, date) => sum + dailyLoads[date], 0)
  return Math.round(total / recentDates.length)
}
