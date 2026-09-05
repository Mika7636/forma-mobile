// Cold-start gates. A brand-new user has too little history for the Form Score
// to be meaningful, so the dashboard shows an honest "building your baseline"
// state instead of a number that is really an artefact of the averages ramping
// up. One place owns the thresholds so the dashboard, the conflict engine and
// the progress guard all agree on what "new" means.
//
// ## The gate counts training days, not elapsed days
//
// It used to measure the calendar span from the earliest logged session to
// today, and that was wrong in a way that showed up plainly on real accounts: an
// athlete with twelve sessions spread across August and September read "36 of 42
// days" and was six days from a Form Score. Thirty of those thirty-six days had
// no training on them at all. The meter was counting the passage of time as
// progress, and time is not what the app was waiting for.
//
// So {@link BASELINE_DAYS} is still 42, but it now counts **distinct calendar
// days carrying at least one session**. Two sessions on one day are one day.
// Rest days are not progress, because a day with no training tells FORMA nothing
// new about the athlete — and a gate that accrued on empty days would open on an
// account that had barely trained, publishing a Form Score built on twelve
// sessions as though it had six weeks of evidence behind it. Only days the
// athlete actually trained move this meter, which is the thing the meter claims
// to be measuring.
//
// Every day is counted from the session's own `date`, never `createdAt`. A
// session logged this evening for last Tuesday is training that happened on
// Tuesday, and the averages that consume it treat it that way; a gate that dated
// it to tonight would disagree with the maths it is guarding. That is also the
// fast path out of this state — an athlete who has been training for months can
// backdate their real sessions and unlock the score immediately, because those
// are real training days that really happened.
//
// ## The one contract callers must honour
//
// {@link getBaselineState} counts over the athlete's **entire** history, so it
// must be fed figures derived from all of it. This matters more than it looks:
// `sessionsStore` windows its array to the last 42 calendar days for the CTL
// maths, and counting distinct days inside a rolling 42-day window would cap the
// gate at "trained every single day for six straight weeks" and quietly park
// everyone else below the line for ever. The store therefore counts training
// days over the unfiltered snapshot — see `countTrainingDays`, which it calls
// before it windows anything — and hands the total down.
import type { Session } from '../types/session'

/**
 * How few sessions still counts as "we barely know this athlete", for the
 * *conflict engine*.
 *
 * Distinct from {@link BASELINE_DAYS} below, and deliberately so. This gate
 * softens warnings — one notch gentler sensitivity, no weekly-volume
 * complaints — because a handful of sessions is a poor basis for telling
 * someone they are overreaching. The baseline gate hides *numbers*, because the
 * fitness average needs real training behind it. Different question, different
 * threshold; this one never feeds the baseline gate.
 */
export const CALIBRATION_SESSION_TARGET = 7
/** Progress charts stay locked until this many sessions exist. */
export const PROGRESS_UNLOCK_SESSIONS = 5

/**
 * The baseline gate: distinct calendar days on which at least one session was
 * logged, across the athlete's whole history.
 *
 * Forty-two because CTL — the fitness term — is a 42-day exponentially-weighted
 * average. That is the amount of training the slow average is built to describe,
 * and until it has been given that much the difference between it and the 7-day
 * fatigue average says more about the ramp than about the athlete.
 *
 * Counting *training* days rather than *elapsed* days is what makes the number
 * mean what it says. See the note at the top of this file for the bug that
 * distinction fixes.
 */
export const BASELINE_DAYS = 42

/** What the gate needs to know, counted over the athlete's full history. */
export interface BaselineInput {
  /**
   * Distinct calendar days carrying at least one session, over **all** history
   * — not over a rolling window. See the contract note at the top of this file.
   */
  trainingDays: number
  /** Total sessions logged, for the card's caption. */
  sessionsLogged: number
}

/** How far along the baseline gate an account is. */
export interface BaselineState {
  /**
   * True while fewer than {@link BASELINE_DAYS} training days exist. Every
   * CTL/ATL/Form readout must be replaced with a progress state while it holds.
   */
  building: boolean
  /**
   * Training days so far, clamped to {@link BASELINE_DAYS} — the "12" in "12 of
   * 42 training days". Backdated sessions move it immediately, because they are
   * days the athlete really trained.
   */
  daysCovered: number
  /** {@link BASELINE_DAYS}, for callers that render the meter. */
  target: number
  /** Training days still needed. Floored at 0. */
  daysRemaining: number
  /** `daysCovered / target`, clamped to 0–1, for a progress bar. */
  fraction: number
  sessionsLogged: number
}

/**
 * A local calendar-day index for a date.
 *
 * Built from the date's *local* Y/M/D and re-anchored through `Date.UTC`, so two
 * sessions on the same local day always produce the same index however the
 * clocks moved. Bucketing on the raw timestamp divided by 86.4e6 does not: that
 * is a UTC day boundary, so an evening session west of Greenwich lands on
 * tomorrow and one calendar day of training is counted as two.
 *
 * Returns `null` for anything unparseable, so a bad row is skipped rather than
 * adding a `NaN` day to the set.
 */
function dayIndex(value: string | Date): number | null {
  // The type check is not redundant with the NaN check below it. `new Date(null)`
  // is the *epoch*, not an invalid date — so a null `date` slipping through from
  // Firestore would pass `getTime()` and silently add 1 Jan 1970 to the set as a
  // real training day. `toSession` should never produce one, but this function's
  // contract is "skip a bad row", and only rejecting the type actually keeps it.
  if (!(value instanceof Date) && typeof value !== 'string') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

/**
 * Distinct local calendar days on which at least one of `sessions` was logged.
 *
 * A `Set` rather than a sort-and-scan because duplicates are the common case
 * here: several sessions on one day is what a training day often looks like, and
 * it has to count once. Unparseable dates are skipped rather than counted.
 *
 * Exported because the sessions store calls it on the **unfiltered** snapshot,
 * before it windows the array down to the CTL period — see the contract note at
 * the top of this file for why that ordering is load-bearing.
 */
export function countTrainingDays(sessions: Session[]): number {
  const days = new Set<number>()
  for (const s of sessions) {
    // The session's own `date`, so backdated training counts toward the day it
    // happened — the same day the averages credit it to.
    const day = dayIndex(s.date)
    if (day === null) continue
    days.add(day)
  }
  return days.size
}

/**
 * Where an account stands against the baseline gate, and whether that clears the
 * bar for showing a Form Score.
 *
 * Measured in days the athlete trained, so an account that logs its first
 * session today reads "1 of 42 training days" rather than a demoralising zero,
 * and one that has not trained since August stays exactly where it was rather
 * than drifting toward a score it has not earned.
 */
export function getBaselineState({ trainingDays, sessionsLogged }: BaselineInput): BaselineState {
  const daysCovered = Math.max(0, Math.min(trainingDays, BASELINE_DAYS))

  return {
    building: daysCovered < BASELINE_DAYS,
    daysCovered,
    target: BASELINE_DAYS,
    daysRemaining: Math.max(0, BASELINE_DAYS - daysCovered),
    fraction: clamp01(daysCovered / BASELINE_DAYS),
    sessionsLogged,
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 1)) : 0
}
