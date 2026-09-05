// Cold-start gates. A brand-new user has too little history for the Form Score
// to be meaningful, so the dashboard shows an honest "building your baseline"
// state instead of a number that is really an artefact of the averages ramping
// up. One place owns the thresholds so the dashboard, the conflict engine and
// the progress guard all agree on what "new" means.
//
// ## The baseline gate is one condition: 42 days
//
// Form is Fitness minus Fatigue, and Fitness is a 42-day exponentially-weighted
// average. Forty-two days is that average's time constant — the span it needs
// before what it reports is the athlete's accumulated training rather than the
// seed it started from and the ramp out of it. Ask for the number earlier and
// the answer is arithmetic about the ramp, dressed as a measurement.
//
// So the gate is exactly the thing the maths asks for and nothing else: 42
// calendar days between the earliest logged session and today. There is no
// second condition on how densely those days are filled. Someone who trains
// twice a week for six weeks has a converged fitness average and a real Form
// Score; someone who trains six times a week for ten days does not, however
// busy the log looks. Elapsed time is what an exponential decay consumes, so
// elapsed time is what the gate measures.
//
// The span reads each session's own `date`, never `createdAt`. A session logged
// this evening for last Tuesday is training that happened on Tuesday, and the
// averages that consume it treat it that way; a gate that dated it to tonight
// would disagree with the maths it is guarding. That is also the fast path out
// of this state — an athlete with months of history behind them can backdate
// their real sessions and the score unlocks immediately, because it genuinely
// has 42 days to average over.
import type { Session } from '../types/session'

/**
 * How few sessions still counts as "we barely know this athlete", for the
 * *conflict engine*.
 *
 * Distinct from {@link BASELINE_DAYS} below, and deliberately so. This gate
 * softens warnings — one notch gentler sensitivity, no weekly-volume
 * complaints — because a handful of sessions is a poor basis for telling
 * someone they are overreaching. The baseline gate hides *numbers*, because the
 * fitness average needs its full time constant. Different question, different
 * threshold; this one never feeds the baseline gate.
 */
export const CALIBRATION_SESSION_TARGET = 7
/** Progress charts stay locked until this many sessions exist. */
export const PROGRESS_UNLOCK_SESSIONS = 5

/**
 * The baseline gate: calendar days from the earliest logged session to today,
 * inclusive.
 *
 * Forty-two because CTL — the fitness term — is a 42-day exponentially-weighted
 * average, and 42 days is its time constant. Before then the average is still
 * converging on the athlete's actual load, so Form, which is that average minus
 * a 7-day fatigue one, moves mostly because the slow term is still climbing.
 * At 42 days it has converged, and the difference is a measurement of the
 * athlete rather than a picture of the ramp.
 */
export const BASELINE_DAYS = 42

/** How far along the baseline gate an account is. */
export interface BaselineState {
  /**
   * True while the span is short of {@link BASELINE_DAYS}. Every CTL/ATL/Form
   * readout must be replaced with a progress state while it holds.
   */
  building: boolean
  /**
   * Span so far, clamped to {@link BASELINE_DAYS} — the "6" in "6 of 42 days".
   * Counted from the earliest session's own date, so backdated history moves it
   * immediately.
   */
  daysCovered: number
  /** {@link BASELINE_DAYS}, for callers that render the meter. */
  target: number
  daysRemaining: number
  /** `daysCovered / target`, clamped to 0–1, for a progress bar. */
  fraction: number
  sessionsLogged: number
}

/**
 * A local calendar-day index for a date.
 *
 * Built from the date's *local* Y/M/D and re-anchored through `Date.UTC`, so
 * subtracting two indices gives whole calendar days however the clocks moved
 * between them. Dividing a millisecond difference by 86.4e6 does not: across a
 * DST boundary it is an hour out, which floors to the wrong day whenever the
 * window straddles late March or late October.
 *
 * Returns `null` for anything unparseable, so a bad row is skipped rather than
 * poisoning the span with `NaN`.
 */
function dayIndex(value: string | Date): number | null {
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/**
 * Where an account stands against the baseline gate, and whether that clears
 * the bar for showing a Form Score.
 *
 * History is measured from the **first logged session**, not from registration.
 * An account created three months ago whose owner logged their first run this
 * morning has one day of training data, and the averages know it; dating the
 * window from sign-up would hand that user a Form Score built on a single
 * session. The day the first session lands counts as day one, so a user who logs
 * something today reads "1 of 42 days" rather than a demoralising zero.
 */
export function getBaselineState(sessions: Session[], now = new Date()): BaselineState {
  const today = dayIndex(now)

  let earliest = Number.POSITIVE_INFINITY
  for (const s of sessions) {
    // The session's own `date`, so backdated training counts toward the day it
    // happened — the same day the averages credit it to.
    const day = dayIndex(s.date)
    if (day === null) continue
    if (day < earliest) earliest = day
  }

  // An unparseable set of dates is not six weeks of history; treat it as none
  // rather than letting `Infinity` fall through as a covered window.
  const spanDays =
    Number.isFinite(earliest) && today !== null ? Math.max(0, today - earliest) + 1 : 0

  const daysCovered = Math.min(spanDays, BASELINE_DAYS)

  return {
    building: daysCovered < BASELINE_DAYS,
    daysCovered,
    target: BASELINE_DAYS,
    daysRemaining: BASELINE_DAYS - daysCovered,
    fraction: clamp01(daysCovered / BASELINE_DAYS),
    sessionsLogged: sessions.length,
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 1)) : 0
}
