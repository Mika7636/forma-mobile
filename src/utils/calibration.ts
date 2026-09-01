// Cold-start gates. A brand-new user has too little history for the 42-day CTL
// average to be meaningful, so the dashboard shows an honest "building your
// baseline" state instead of a Form Score that is really an artefact of the
// averages ramping up. One place owns the thresholds so the dashboard, the
// conflict engine and the progress guard all agree on what "new" means.
//
// ## The baseline gate is two conditions, not one
//
// Neither half works alone, and each one's failure mode is the other's
// strength:
//
//   * **Span alone** (days from the first session to today) is what a naive
//     reading of "the averages need a fortnight" suggests, and it is trivially
//     gamed by a single backdated session. One session dated a week ago grants
//     seven days of "history" containing six days of nothing. Span measures how
//     long ago someone started, not how much FORMA knows.
//
//   * **Session count alone** ignores that ATL is a *7-day* average. Six
//     sessions crammed into one weekend is three days of data and a wildly
//     overstated fatigue term; the same six spread over a fortnight is a real
//     baseline. A count cannot tell those apart.
//
// So the account leaves the building state only when **both** hold: at least
// BASELINE_DAYS calendar days have elapsed since the earliest session (the slow
// average has had time to fill), and at least BASELINE_TRAINING_DAYS *distinct*
// calendar days carry a session (the window it filled with is not mostly
// empty). Span is the clock, density is the evidence, and a Form Score wants
// both.
//
// Both conditions read the session's own `date`, never `createdAt`. A session
// logged this evening for last Tuesday is training that happened on Tuesday,
// and the averages that consume it treat it that way; a gate that dated it to
// tonight would disagree with the maths it is guarding.
import type { Session } from '../types/session'

/**
 * How few sessions still counts as "we barely know this athlete", for the
 * *conflict engine*.
 *
 * Distinct from {@link BASELINE_DAYS} below, and deliberately so. This gate
 * softens warnings — one notch gentler sensitivity, no weekly-volume
 * complaints — because a handful of sessions is a poor basis for telling
 * someone they are overreaching. The baseline gate hides *numbers*, because a
 * fortnight is what the averages need. Different question, different threshold.
 */
export const CALIBRATION_SESSION_TARGET = 7
/** Progress charts stay locked until this many sessions exist. */
export const PROGRESS_UNLOCK_SESSIONS = 5

/**
 * The **span** half of the baseline gate: calendar days from the earliest
 * logged session to today, inclusive.
 *
 * CTL is a 42-day exponentially-weighted average and ATL a 7-day one. Form is
 * their difference. Inside the first week the ATL term carries almost the
 * entire signal while the CTL term is mostly the onboarding seed, so the
 * difference is not a measurement of anything — it is an artefact of the ramp.
 * Two weeks is the point at which the fast average has filled and the slow one
 * has enough in it for their difference to track something real.
 *
 * This condition is about *elapsed time*, which is what an exponential decay
 * actually consumes — and that is exactly why it cannot stand alone. See the
 * two-condition note at the top of this file, and
 * {@link BASELINE_TRAINING_DAYS} for the other half.
 */
export const BASELINE_DAYS = 14

/**
 * The **density** half of the baseline gate: distinct calendar days that carry
 * at least one session.
 *
 * Six, because ATL averages over seven days: fewer than six training days
 * anywhere in the window means the fatigue term is being driven by one or two
 * spikes, and a Form Score built on it swings on a single session. Counting
 * *days* rather than sessions is what stops a six-session weekend clearing
 * this — that is three days of data no matter how many entries it holds.
 *
 * Deliberately not scaled to {@link BASELINE_DAYS}: this is not "train often
 * enough", it is "there is enough here to average". An athlete training three
 * days a week clears it inside the fortnight; one training twice a week takes
 * three, and their numbers genuinely are less certain until then.
 */
export const BASELINE_TRAINING_DAYS = 6

/** How far along the baseline gate's two conditions an account is. */
export interface BaselineState {
  /**
   * True while **either** condition is unmet. Every CTL/ATL/Form readout must
   * be replaced with a progress state while it holds.
   */
  building: boolean
  /**
   * Span so far, clamped to {@link BASELINE_DAYS} — the "6" in "6 of 14 days".
   * Counted from the earliest session's own date, so one backdated session
   * moves it immediately; that is exactly why it is not the whole gate.
   */
  daysCovered: number
  /** {@link BASELINE_DAYS}, for callers that render the meter. */
  target: number
  daysRemaining: number
  /**
   * Distinct calendar days carrying at least one session, clamped to
   * {@link BASELINE_TRAINING_DAYS} — the "3" in "3 of 6 training days".
   */
  trainingDaysLogged: number
  /** {@link BASELINE_TRAINING_DAYS}, for callers that render the meter. */
  trainingDaysTarget: number
  trainingDaysRemaining: number
  sessionsLogged: number
}

/** One of the gate's two conditions, ready to render as a meter. */
export interface BaselineMeter {
  /** Progress so far, already clamped to {@link BaselineMeter.target}. */
  value: number
  target: number
  remaining: number
  /** 0–1, for a progress bar. */
  fraction: number
  /** Plural unit noun: `days` or `training days`. */
  noun: string
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
 * Where an account stands against the baseline gate's two conditions, and
 * whether that clears the bar for showing a Form Score.
 *
 * History is measured from the **first logged session**, not from registration.
 * An account created three weeks ago whose owner logged their first run this
 * morning has one day of training data, and the averages know it; dating the
 * window from sign-up would hand that user a Form Score built on a single
 * session. The day the first session lands counts as day one, so a user who logs
 * something today reads "1 of 14 days" rather than a demoralising zero.
 */
export function getBaselineState(sessions: Session[], now = new Date()): BaselineState {
  const today = dayIndex(now)

  // Distinct calendar days, from each session's own date. A `Set` rather than a
  // sort-and-scan because duplicates are the common case here: several sessions
  // on one day is what a training day often looks like, and it must still count
  // once.
  const trainingDays = new Set<number>()
  let earliest = Number.POSITIVE_INFINITY
  for (const s of sessions) {
    const day = dayIndex(s.date)
    if (day === null) continue
    trainingDays.add(day)
    if (day < earliest) earliest = day
  }

  // An unparseable set of dates is not a fortnight of history; treat it as none
  // rather than letting `Infinity` fall through as a covered window.
  const spanDays =
    Number.isFinite(earliest) && today !== null ? Math.max(0, today - earliest) + 1 : 0

  const daysCovered = Math.min(spanDays, BASELINE_DAYS)
  const trainingDaysLogged = Math.min(trainingDays.size, BASELINE_TRAINING_DAYS)

  return {
    // Both, not either: span without density is one backdated session buying a
    // fortnight of empty history, density without span is a heavy long weekend
    // the 42-day average has not begun to absorb.
    building: daysCovered < BASELINE_DAYS || trainingDaysLogged < BASELINE_TRAINING_DAYS,
    daysCovered,
    target: BASELINE_DAYS,
    daysRemaining: BASELINE_DAYS - daysCovered,
    trainingDaysLogged,
    trainingDaysTarget: BASELINE_TRAINING_DAYS,
    trainingDaysRemaining: BASELINE_TRAINING_DAYS - trainingDaysLogged,
    sessionsLogged: sessions.length,
  }
}

/**
 * The two conditions ranked, so every screen tells the same story.
 *
 * `headline` is whichever is proportionally *further behind* — the one actually
 * holding the Form Score back — and `secondary` is the other. Showing "7 of 14
 * days" to someone whose lone backdated session is the real blocker promises a
 * number in seven days that is not coming, which is the same broken promise the
 * old one-condition gate made.
 *
 * Span wins a tie because it is the meter the app has always shown, and a
 * headline that flips units on equal progress reads as a bug.
 */
export function baselineMeters(baseline: BaselineState): {
  headline: BaselineMeter
  secondary: BaselineMeter
} {
  const span: BaselineMeter = {
    value: baseline.daysCovered,
    target: baseline.target,
    remaining: baseline.daysRemaining,
    fraction: clamp01(baseline.daysCovered / baseline.target),
    noun: 'days',
  }
  const density: BaselineMeter = {
    value: baseline.trainingDaysLogged,
    target: baseline.trainingDaysTarget,
    remaining: baseline.trainingDaysRemaining,
    fraction: clamp01(baseline.trainingDaysLogged / baseline.trainingDaysTarget),
    noun: 'training days',
  }

  return density.fraction < span.fraction
    ? { headline: density, secondary: span }
    : { headline: span, secondary: density }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 1)) : 0
}
