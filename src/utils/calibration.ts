// Cold-start gates. A brand-new user has too little history for the 42-day CTL
// average to be meaningful, so the dashboard shows an honest "building your
// baseline" state instead of a Form Score that is really an artefact of the
// averages ramping up. One place owns the thresholds so the dashboard, the
// conflict engine and the progress guard all agree on what "new" means.
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
 * Days of training history before CTL / ATL / Form are shown as numbers at all.
 *
 * ## Why fourteen, and why days rather than sessions
 *
 * CTL is a 42-day exponentially-weighted average and ATL a 7-day one. Form is
 * their difference. With three days of data the ATL term is carrying almost the
 * entire signal and the CTL term is mostly the onboarding seed, so the
 * difference is not a measurement of anything — it is an artefact of the ramp.
 * Two weeks is the point at which the fast average has filled and the slow one
 * has enough in it for their difference to track something real.
 *
 * The gate counts *days*, not sessions, because that is what the averages are
 * over. Six sessions crammed into a long weekend is three days of history and a
 * wildly overstated ATL; the same six spread across a fortnight is a baseline.
 * A session count cannot tell those apart, and a "+72" on the first is exactly
 * the kind of confident nonsense that costs an app its credibility.
 */
export const BASELINE_DAYS = 14

/** How far along the {@link BASELINE_DAYS} window an account is. */
export interface BaselineState {
  /**
   * True while there is less than {@link BASELINE_DAYS} of history. Every
   * CTL/ATL/Form readout must be replaced with a progress state while it holds.
   */
  building: boolean
  /** Days of history so far, clamped to the window — the "6" in "6 of 14 days". */
  daysCovered: number
  /** {@link BASELINE_DAYS}, for callers that render the meter. */
  target: number
  daysRemaining: number
  sessionsLogged: number
}

/**
 * Days of training history an account has, and whether that clears the bar for
 * showing a Form Score.
 *
 * History is measured from the **first logged session**, not from registration.
 * An account created three weeks ago whose owner logged their first run this
 * morning has one day of training data, and the averages know it; dating the
 * window from sign-up would hand that user a Form Score built on a single
 * session. The day the first session lands counts as day one, so a user who logs
 * something today reads "1 of 14 days" rather than a demoralising zero.
 */
export function getBaselineState(sessions: Session[], now = new Date()): BaselineState {
  if (sessions.length === 0) {
    return {
      building: true,
      daysCovered: 0,
      target: BASELINE_DAYS,
      daysRemaining: BASELINE_DAYS,
      sessionsLogged: 0,
    }
  }

  const earliest = sessions.reduce((min, s) => {
    const t = new Date(s.date).getTime()
    return Number.isNaN(t) ? min : Math.min(min, t)
  }, Number.POSITIVE_INFINITY)

  // An unparseable set of dates is not a fortnight of history; treat it as none
  // rather than letting `Infinity` fall through as a covered window.
  const spanDays = Number.isFinite(earliest)
    ? Math.floor((now.getTime() - earliest) / 86_400_000) + 1
    : 0

  const daysCovered = Math.max(0, Math.min(spanDays, BASELINE_DAYS))
  return {
    building: daysCovered < BASELINE_DAYS,
    daysCovered,
    target: BASELINE_DAYS,
    daysRemaining: Math.max(0, BASELINE_DAYS - daysCovered),
    sessionsLogged: sessions.length,
  }
}
