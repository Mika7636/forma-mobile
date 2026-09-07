import type { Session } from '../types/session'
import { localISODate } from '../utils/dates'

const ATL_WINDOW_DAYS = 7

/** Window over which a new user's seeded baseline CTL fades to pure data. */
const CTL_BLEND_DAYS = 21

/**
 * Window over which a new user's seeded baseline ATL fades to pure data. Same
 * length as the CTL blend so "fitness" and "fatigue" calibrate in step and the
 * derived Form Score doesn't lurch as one settles before the other.
 */
const ATL_BLEND_DAYS = 21

/**
 * Total load per calendar day, over the last `days` days.
 *
 * ## Days are LOCAL days, and that is the whole point
 *
 * This used to bucket by `toISODate`, which is `toISOString().slice(0, 10)` —
 * a **UTC** day. Every other module that groups training by day uses
 * `localISODate`: the baseline gate (`countTrainingDays`), the streak
 * (`calculateStreak`), and the entire Progress screen (`totalsByDay`). So the
 * fitness and fatigue averages were the only figures in the app measuring days
 * on a different calendar from everything else.
 *
 * That is not a rounding difference, it is a merge. At UTC+7 a session logged at
 * 05:35 on Monday is 22:35 UTC on **Sunday**, so Monday's session and Sunday's
 * land in the same bucket: one day carrying double load, and the day beside it
 * empty. ATL is a seven-day mean, so a single doubled day moves fatigue by a
 * seventh of that session's load — enough, on the demo account, to take Form
 * from +5 to **-43** and flip the hero from "Balanced" to "Overreaching / high
 * injury risk". The reverse happens west of Greenwich, where an evening session
 * rolls forward onto tomorrow.
 *
 * The bug is symmetric and silent: nothing throws, no load is lost, and the
 * totals still add up — the load is simply attributed to the wrong day, and only
 * the short window notices. The same distinction is already spelled out in
 * `utils/calibration.ts`'s `dayIndex`, which was fixed for the gate and never
 * propagated here.
 *
 * ## Why the cursor sits at local noon
 *
 * Stepping back a day from midnight can land on the same calendar date twice, or
 * skip one, across a daylight-saving transition — which would leave the map with
 * fewer than `days` keys and quietly change the divisor of every average below
 * it. Noon is far enough from both boundaries that no offset can move it off its
 * own day. The same trick, for the same reason, as `planDate` in
 * `conflictDetector`.
 */
export function buildDailyLoads(
  sessions: Session[],
  days: number,
  /**
   * The day the window ends on. Defaults to now.
   *
   * A parameter rather than a read of the wall clock, for the same reason the
   * recommender takes one: it makes "what is this athlete's fitness" a pure
   * function of a moment, so it can be checked against a known instant instead
   * of against whenever the check happened to run. The demo seeder's verifier
   * needs exactly that — it has to be able to ask what the *phone* will show,
   * and it was previously reduced to reimplementing this function to do it,
   * which is how the two drifted onto different calendars in the first place.
   */
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
