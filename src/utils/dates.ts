/**
 * Weekday initials, Sunday-first — index with `Date.getDay()`.
 *
 * Lives here rather than beside the Planner grid that first needed it: the
 * Admin screen's seven-day chart labels its axis with the same letters, and a
 * second copy is how two parts of one app end up disagreeing about whether the
 * week starts on Sunday.
 */
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

export function formatDate(date: Date | string): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return d.toISOString().slice(0, 10)
}

export function toISODate(date: Date): string {
  return formatDate(date)
}

/**
 * Local calendar date key (YYYY-MM-DD) from a Date's *local* components.
 *
 * Unlike {@link toISODate} (which is UTC-based), this places a workout on the
 * calendar day it actually happened in the user's timezone — use it for
 * day-accurate grouping (planner, progress heatmap) rather than UTC aggregates.
 */
export function localISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function addDays(date: Date | string, days: number): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

export function startOfWeek(date: Date | string): Date {
  const d = typeof date === 'string' ? new Date(date) : new Date(date)
  const day = d.getDay()
  const diff = (day === 0 ? -6 : 1) - day
  d.setDate(d.getDate() + diff)
  d.setHours(0, 0, 0, 0)
  return d
}

export function daysBetween(start: Date | string, end: Date | string): number {
  const startDate = typeof start === 'string' ? new Date(start) : start
  const endDate = typeof end === 'string' ? new Date(end) : end
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.round((endDate.getTime() - startDate.getTime()) / msPerDay)
}

/**
 * Whole days elapsed since an ISO timestamp, floored and never negative.
 * Used for account-age gates (CTL baseline blend, calibration UI). Returns 0
 * for an unparseable/missing input so callers degrade gracefully.
 */
export function daysSince(iso: string | undefined): number {
  if (!iso) return 0
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return 0
  const msPerDay = 1000 * 60 * 60 * 24
  return Math.max(0, Math.floor((Date.now() - then) / msPerDay))
}

/**
 * "Thursday" — the weekday a `YYYY-MM-DD` plan day falls on.
 *
 * Parsed at local **noon**, never at midnight. `new Date('2026-09-03')` is
 * parsed as UTC midnight, which is the previous day for anyone west of
 * Greenwich — so a plan for Thursday would be announced as "Wednesday" for
 * every user in the Americas. Noon is far enough from both boundaries that no
 * offset can move it off its own day.
 *
 * Returns the input unchanged if it is not a parseable day key, so a bad value
 * shows up as itself rather than as "Invalid Date".
 */
export function weekdayLabel(isoDay: string, style: 'long' | 'short' = 'long'): string {
  const d = new Date(`${isoDay}T12:00:00`)
  if (Number.isNaN(d.getTime())) return isoDay
  return d.toLocaleDateString(undefined, { weekday: style })
}
