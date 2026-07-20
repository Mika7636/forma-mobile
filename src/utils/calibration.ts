// Cold-start "calibration" gates. A brand-new user has too little history for
// the 42-day CTL average to be meaningful, so the dashboard shows an honest
// "still learning your baseline" state instead of a false Overreaching warning.
// One place owns the thresholds so the dashboard, conflict engine, and progress
// guard all agree on what "new" means.
import { daysSince } from './dates'

/** A user is "calibrating" until they've logged this many sessions… */
export const CALIBRATION_SESSION_TARGET = 7
/** …or their account is at least this many days old. */
export const CALIBRATION_DAYS = 7
/** Progress charts stay locked until this many sessions exist. */
export const PROGRESS_UNLOCK_SESSIONS = 5

export interface CalibrationState {
  /** True while count < target OR the account is younger than CALIBRATION_DAYS. */
  isCalibrating: boolean
  sessionsLogged: number
  /** Sessions still needed to clear the count half of the gate (never negative). */
  sessionsRemaining: number
  daysSinceRegistration: number
}

/**
 * Note: `totalSessionCount` comes from the 42-day session window (the app keeps
 * no all-time count), so for genuinely new users it equals their lifetime total.
 */
export function getCalibrationState(
  totalSessionCount: number,
  createdAt?: string,
): CalibrationState {
  const daysSinceRegistration = daysSince(createdAt)
  const isCalibrating =
    totalSessionCount < CALIBRATION_SESSION_TARGET ||
    daysSinceRegistration < CALIBRATION_DAYS
  return {
    isCalibrating,
    sessionsLogged: totalSessionCount,
    sessionsRemaining: Math.max(0, CALIBRATION_SESSION_TARGET - totalSessionCount),
    daysSinceRegistration,
  }
}
