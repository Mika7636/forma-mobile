import { Timestamp } from 'firebase/firestore'
import type { Conflict, PlannedConflict } from '../types/conflict'
import type { PlannedSession } from '../types/planned'
import type { Session, SportType } from '../types/session'
import type { ConflictSensitivity, User } from '../types/user'
import { SPORT_META } from '../utils/sportMeta'

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

/**
 * The RPE floors a session has to clear before a check fires, for one
 * sensitivity setting.
 *
 * Factored out because the planned-session detector below has to use *exactly*
 * these numbers. If the two engines answered differently, an athlete would plan
 * a week FORMA called clean, train it as planned, and then be warned about the
 * very sessions it had approved — which would read as the app changing its mind
 * rather than as a coach.
 */
function thresholds(sensitivity: ConflictSensitivity) {
  return {
    /** Sport-overlap check: how hard the *earlier* session has to have been. */
    sport: sensitivity === 'strict' ? 6 : 7,
    /** CNS check: how hard *both* sessions have to be. */
    cns: sensitivity === 'strict' ? 7 : 8,
  }
}

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
  const { sport: sportRpeThreshold, cns: cnsThreshold } = thresholds(sensitivity)

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

/* ------------------------------------------------------------------ */
/* Planned sessions                                                    */
/* ------------------------------------------------------------------ */

/**
 * How many calendar days apart two plans can be and still clash.
 *
 * The logged detector works in milliseconds and uses a 48-hour window. Plans are
 * day-granular, so the same window is "up to two days apart": same day (0),
 * back-to-back (1), or one rest day between (2).
 */
const PLANNED_WINDOW_DAYS = 2

/** Parse a `YYYY-MM-DD` plan day to local noon — never a UTC midnight, which
 *  lands on the previous day for anyone west of Greenwich. */
function planDate(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00`)
}

/** Whole calendar days between two plan days (always ≥ 0). */
function dayGap(a: string, b: string): number {
  return Math.round(Math.abs(planDate(a).getTime() - planDate(b).getTime()) / 86_400_000)
}

/** "Tue", "Wed" — how a plan's day is named in the one-line summary. */
function shortDay(isoDay: string): string {
  return planDate(isoDay).toLocaleDateString(undefined, { weekday: 'short' })
}

/** Advice for a sport-overlap clash between two plans, by matrix level. */
function plannedOverlapAdvice(level: number): string {
  return level >= 3
    ? 'They load the same muscles and the same nervous system, so the second one starts in a hole.'
    : 'They share enough fatigue that the second one will be flat.'
}

/**
 * Conflict detection over **planned** sessions — the same coaching FORMA gives
 * after the fact, given before the week is trained.
 *
 * ## Why this exists
 *
 * The logged detector can only speak once the damage is done, and it needs a
 * history to speak at all. An athlete who signed up ninety seconds ago has
 * neither, so the product's whole differentiator was invisible on day one. This
 * runs on the calendar instead of on the past: two plans, the user's matrix, and
 * their sensitivity setting are all it needs, so a hard Combat session pencilled
 * in for Tuesday and a hard run for Wednesday are flagged the moment the second
 * one is added — with nothing logged, ever.
 *
 * It shares {@link thresholds} and {@link getInteractionLevel} with the logged
 * engine, so the two cannot disagree about what counts as a clash.
 *
 * ## What it deliberately does *not* do
 *
 *  - **No calibration softening.** The logged detector goes one notch gentler
 *    for a new account, because a handful of real sessions is a poor basis for
 *    telling someone they are overreaching. A plan carries no such claim: it
 *    says "these two, this close, will fight each other", which is true on day
 *    one and is exactly what a new user is here to find out.
 *  - **No weekly-budget check.** That one is about volume actually absorbed;
 *    projecting it onto intentions would warn an athlete for being ambitious on
 *    paper, which is not a risk, and it isn't what the matrix describes.
 *  - **No persistence.** See {@link PlannedConflict} — these are recomputed from
 *    the plans, never stored.
 *  - **At most one conflict per pair.** The logged detector will happily raise
 *    both a sport-overlap *and* a CNS warning for the same two sessions,
 *    because those are two records of two real things and the history should
 *    keep both. Here they would be two lines of the week summary saying
 *    "Combat Tue → Running Wed" twice, about one pair the athlete fixes with one
 *    action. So the checks still both run and the more informative survivor is
 *    kept — sport overlap where it fires, since naming the interaction is the
 *    more useful advice and its wording already covers the fatigue case.
 *
 * Returned oldest-pair-first, ordered by the day the clash lands on.
 */
export function detectPlannedConflicts(
  planned: PlannedSession[],
  userProfile: User,
): PlannedConflict[] {
  const sensitivity = userProfile.conflictSensitivity ?? 'balanced'
  const { sport: sportRpeThreshold, cns: cnsThreshold } = thresholds(sensitivity)
  const matrix = userProfile.sportInteractions ?? {}

  // Chronological, so every pair below is (earlier, later) without re-checking.
  const ordered = [...planned].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
  const conflicts: PlannedConflict[] = []

  for (let i = 0; i < ordered.length; i++) {
    for (let j = i + 1; j < ordered.length; j++) {
      const earlier = ordered[i]
      const later = ordered[j]
      if (dayGap(earlier.date, later.date) > PLANNED_WINDOW_DAYS) break

      const pair = {
        plannedIds: [earlier.id, later.id] as [string, string],
        dates: [earlier.date, later.date] as [string, string],
        sports: Array.from(new Set([earlier.sport, later.sport])),
      }
      const when = `${sportLabel(earlier.sport)} ${shortDay(earlier.date)} → ${sportLabel(
        later.sport,
      )} ${shortDay(later.date)}`

      // Both checks run; the survivor is picked below. In preference order, so
      // the first entry that clears the sensitivity filter is the one kept.
      const candidates: PlannedConflict[] = []

      // Check 1 — sport interaction overlap, from the user's own matrix.
      const level = getInteractionLevel(earlier.sport, later.sport, matrix)
      if (level >= 2 && earlier.intensity >= sportRpeThreshold) {
        candidates.push({
          ...pair,
          id: `${earlier.id}|${later.id}|muscle_group`,
          conflictLevel: level === 3 ? 3 : 2,
          conflictType: 'muscle_group',
          severity: level === 3 ? 'danger' : 'warning',
          summary: when,
          message: `You've planned ${sportLabel(later.sport)} on ${shortDay(
            later.date,
          )} after a hard ${sportLabel(earlier.sport)} session on ${shortDay(
            earlier.date,
          )}. ${plannedOverlapAdvice(level)} Move one of them, or plan the second as an easy session.`,
        })
      }

      // Check 2 — two near-maximal efforts too close together. Also the only
      // check that can fire for two sessions of the *same* sport.
      if (earlier.intensity >= cnsThreshold && later.intensity >= cnsThreshold) {
        candidates.push({
          ...pair,
          id: `${earlier.id}|${later.id}|cns_fatigue`,
          conflictLevel: 3,
          conflictType: 'cns_fatigue',
          severity: 'danger',
          summary: when,
          message: `Two near-maximal sessions planned within ${
            dayGap(earlier.date, later.date) === 0 ? 'the same day' : '48 hours'
          } (RPE ${earlier.intensity} and RPE ${later.intensity}). Your nervous system needs longer than that to recover — give one of them an easier target.`,
        })
      }

      // The relaxed filter is applied *per pair, before* the survivor is chosen,
      // not once at the end. Choosing first would let a relaxed athlete lose a
      // danger-level CNS clash simply because a warning-level sport overlap
      // outranked it and was then filtered away — silence where the more serious
      // of the two warnings belonged.
      const eligible =
        sensitivity === 'relaxed'
          ? candidates.filter((c) => c.severity === 'danger')
          : candidates
      if (eligible.length > 0) conflicts.push(eligible[0])
    }
  }

  return conflicts
}
