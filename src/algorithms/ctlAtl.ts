import type { Session } from '../types/session'
import { toISODate } from '../utils/dates'

const ATL_WINDOW_DAYS = 7

/** Window over which a new user's seeded baseline CTL fades to pure data. */
const CTL_BLEND_DAYS = 21

/**
 * Window over which a new user's seeded baseline ATL fades to pure data. Same
 * length as the CTL blend so "fitness" and "fatigue" calibrate in step and the
 * derived Form Score doesn't lurch as one settles before the other.
 */
const ATL_BLEND_DAYS = 21

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

/**
 * Chronic Training Load — the 42-day daily-load average that stands in for
 * "fitness".
 *
 * Cold-start blend: for the first {@link CTL_BLEND_DAYS} of a user's account,
 * the raw average is misleadingly low (a few sessions divided by 42 zero-filled
 * days), which drags Form Score deeply negative. When a `baselineCTL` seed and
 * `daysSinceRegistration` are supplied, we blend the seed toward the real data:
 * Day 0 = 100% baseline, ~Day 10 = ~50/50, Day 21+ = pure data. With no options
 * the behaviour is unchanged (pure average).
 */
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

/**
 * Acute Training Load — the 7-day daily-load average that stands in for
 * "fatigue".
 *
 * Cold-start blend: a brand-new user who logs, say, seven sessions in their
 * first week gets a raw 7-day average that reads as a huge fatigue spike, even
 * though an intermediate athlete's body is used to that volume. Left unblended
 * this drags Form Score (CTL − ATL) deeply negative and fires a false
 * "Overreaching" signal. So, exactly like {@link calculateCTL}, when a
 * `baselineATL` seed and `daysSinceRegistration` are supplied we blend the seed
 * toward the real data: Day 0 = 100% baseline, ~Day 10 = ~50/50, Day 21+ = pure
 * data. With no options the behaviour is unchanged (pure average).
 */
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
