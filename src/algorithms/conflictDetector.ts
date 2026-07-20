import { Timestamp } from 'firebase/firestore'
import type { Conflict } from '../types/conflict'
import type { Session, SportType } from '../types/session'
import type { ConflictSensitivity, User } from '../types/user'
import { SPORT_META } from '../utils/sportMeta'

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

// One notch gentler, used during the calibration period so a new user isn't
// buried in warnings before FORMA knows their baseline.
const SOFTER_SENSITIVITY: Record<ConflictSensitivity, ConflictSensitivity> = {
  strict: 'balanced',
  balanced: 'relaxed',
  relaxed: 'relaxed',
}

/**
 * Build the canonical matrix key for a sport pair. Keys are stored
 * alphabetically sorted ("combat_running", never "running_combat") so the
 * lookup is order-independent.
 */
function pairKey(sportA: string, sportB: string): string {
  return [sportA, sportB].sort().join('_')
}

/**
 * Conflict weight (0–3) for a pair of sports from the user's interaction
 * matrix. 0 means the same sport or no recorded interference.
 */
export function getInteractionLevel(
  sportA: string,
  sportB: string,
  matrix: Record<string, number>,
): number {
  if (sportA === sportB) return 0
  return matrix[pairKey(sportA, sportB)] ?? 0
}

function sportLabel(sport: string): string {
  return SPORT_META[sport as SportType]?.label ?? sport
}

// Educational, non-alarming phrasing for muscle-group overlap by level.
function overlapRisk(level: number): string {
  return level >= 3
    ? 'heavy overlap in the same muscle groups and high nervous-system load'
    : 'meaningful fatigue overlap in the muscles you just stressed'
}

/**
 * Core conflict-detection engine. Given a freshly logged session and the user's
 * recent training, returns every conflict it triggers. Pure aside from reading
 * the wall clock for `detectedAt`; persistence (real `conflictId`) is layered on
 * by the caller.
 *
 * Sensitivity tuning (user.conflictSensitivity):
 *  - "relaxed":  only "danger" conflicts are surfaced
 *  - "balanced": all conflicts (default)
 *  - "strict":   lower RPE thresholds so warnings fire earlier
 *
 * Calibration (options.calibrating, for users with < 7 sessions): sensitivity
 * is dropped one notch and volume/"budget_exceeded" conflicts are suppressed —
 * a new user's weekly budget is a guess, and their few sessions shouldn't read
 * as overreaching. Genuine dangers (sport overlap, back-to-back max sessions)
 * still fire.
 */
export function detectConflicts(
  newSession: Session,
  recentSessions: Session[],
  userProfile: User,
  currentWeeklyHours: number,
  options?: { calibrating?: boolean },
): Conflict[] {
  const conflicts: Conflict[] = []
  const calibrating = options?.calibrating ?? false
  const baseSensitivity = userProfile.conflictSensitivity ?? 'balanced'
  const sensitivity = calibrating ? SOFTER_SENSITIVITY[baseSensitivity] : baseSensitivity
  const sportRpeThreshold = sensitivity === 'strict' ? 6 : 7
  const cnsThreshold = sensitivity === 'strict' ? 7 : 8

  const newTime = new Date(newSession.date).getTime()
  const within48h = recentSessions.filter(
    (s) =>
      s.id !== newSession.id &&
      Math.abs(newTime - new Date(s.date).getTime()) <= FORTY_EIGHT_HOURS_MS,
  )

  // `detectedAt` is set now; the caller fills in the real `conflictId` after the
  // Firestore write (placeholder kept empty so the shape stays a full Conflict).
  const make = (
    fields: Omit<Conflict, 'conflictId' | 'detectedAt' | 'resolved'>,
  ): Conflict => ({
    conflictId: '',
    detectedAt: Timestamp.now(),
    resolved: false,
    ...fields,
  })

  // Check 1 — Sport interaction overlap.
  for (const prev of within48h) {
    const level = getInteractionLevel(
      newSession.sport,
      prev.sport,
      userProfile.sportInteractions ?? {},
    )
    if (level >= 2 && prev.rpe >= sportRpeThreshold) {
      conflicts.push(
        make({
          triggerSessionId: newSession.id,
          conflictingSessionId: prev.id,
          sports: Array.from(new Set([newSession.sport, prev.sport])),
          conflictLevel: level === 3 ? 3 : 2,
          conflictType: 'muscle_group',
          severity: level === 3 ? 'danger' : 'warning',
          message: `${sportLabel(newSession.sport)} after a hard ${sportLabel(
            prev.sport,
          )} session creates ${overlapRisk(
            level,
          )}. Consider a recovery session or rest day.`,
        }),
      )
    }
  }

  // Check 2 — CNS fatigue: two near-maximal sessions inside 48h.
  if (newSession.rpe >= cnsThreshold) {
    const hardPrev = within48h
      .filter((s) => s.rpe >= cnsThreshold)
      .sort((a, b) => b.rpe - a.rpe)[0]
    if (hardPrev) {
      conflicts.push(
        make({
          triggerSessionId: newSession.id,
          conflictingSessionId: hardPrev.id,
          sports: Array.from(new Set([newSession.sport, hardPrev.sport])),
          conflictLevel: 3,
          conflictType: 'cns_fatigue',
          severity: 'danger',
          message: `Two high-intensity sessions (RPE ${hardPrev.rpe} and RPE ${newSession.rpe}) within 48 hours. Your nervous system needs recovery time.`,
        }),
      )
    }
  }

  // Check 3 — Weekly training budget exceeded.
  if (currentWeeklyHours > userProfile.weeklyBudgetHours) {
    conflicts.push(
      make({
        triggerSessionId: newSession.id,
        conflictingSessionId: null,
        sports: [],
        conflictLevel: 1,
        conflictType: 'budget_exceeded',
        severity: 'warning',
        message: `Weekly training budget exceeded. You've trained ${currentWeeklyHours.toFixed(
          1,
        )}h of your ${userProfile.weeklyBudgetHours}h target. Consider an easier week.`,
      }),
    )
  }

  // During calibration, drop the volume/budget warning — the budget itself is
  // still just an onboarding estimate, and sparse early sessions shouldn't read
  // as overreaching. Sport-overlap and CNS conflicts remain.
  const surfaced = calibrating
    ? conflicts.filter((c) => c.conflictType !== 'budget_exceeded')
    : conflicts

  // Relaxed athletes only want to hear about the serious stuff.
  if (sensitivity === 'relaxed') {
    return surfaced.filter((c) => c.severity === 'danger')
  }
  return surfaced
}
