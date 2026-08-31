import type { Timestamp } from 'firebase/firestore'

/**
 * A detected training conflict — FORMA's signature "coach in your pocket"
 * warning. Created when a freshly logged session stacks poorly against recent
 * training (muscle-group overlap, CNS fatigue, or weekly-budget overrun) and
 * persisted under /users/{uid}/conflicts so it can surface on the dashboard.
 */
export interface Conflict {
  conflictId: string
  detectedAt: Timestamp
  resolved: boolean
  /** Session that triggered the check (the one just logged). */
  triggerSessionId: string
  /** The earlier session it clashes with, or null for whole-week conflicts. */
  conflictingSessionId: string | null
  sports: string[]
  conflictLevel: 1 | 2 | 3
  conflictType: 'muscle_group' | 'cns_fatigue' | 'budget_exceeded'
  message: string
  severity: 'warning' | 'danger'
}

/**
 * Storage identity — the exact (trigger, clashing, type) triple. Used at write
 * time so re-logging or a double-tapped save never persists the *same* conflict
 * document twice.
 */
export function conflictStorageKey(
  c: Pick<Conflict, 'triggerSessionId' | 'conflictingSessionId' | 'conflictType'>,
): string {
  return `${c.triggerSessionId}|${c.conflictingSessionId ?? ''}|${c.conflictType}`
}

/**
 * Display identity — the *advice* a conflict represents, independent of which
 * session triggered it. Two "Running after a hard Gym/Strength session"
 * warnings raised by two different runs read as the same message to the athlete,
 * so the dashboard collapses them to a single banner. Genuinely different
 * conflicts (a different sport pair, or CNS fatigue vs sport overlap) key
 * differently and still show separately.
 */
export function conflictDedupeKey(c: Pick<Conflict, 'conflictType' | 'sports'>): string {
  return `${c.conflictType}|${[...c.sports].sort().join(',')}`
}

/**
 * A clash between two **planned** sessions, raised by
 * {@link detectPlannedConflicts} while the athlete is still laying the week out.
 *
 * ## Why it isn't a {@link Conflict}
 *
 * A `Conflict` is a *record*: it is written to /users/{uid}/conflicts, carries a
 * server `detectedAt`, and can be resolved (dismissed) exactly once because it
 * describes training that has already happened and cannot be un-happened.
 *
 * A planned conflict is a *projection*. It exists only while the two plans that
 * cause it both sit on the calendar, and moving either one has to make it
 * disappear — so persisting it would mean maintaining a shadow copy of the
 * planner and reconciling it on every edit. It is recomputed from the plans on
 * every render instead, which is cheap (a week holds a handful of plans) and
 * cannot go stale.
 *
 * That difference is also why it is never dismissible: there is nothing to
 * dismiss, only a plan to change.
 */
export interface PlannedConflict {
  /** Stable identity for React keys — the pair plus the check that fired. */
  id: string
  /** The two plans involved, earlier first. */
  plannedIds: [string, string]
  /** Local calendar days (`YYYY-MM-DD`) the two plans sit on, earlier first. */
  dates: [string, string]
  sports: string[]
  conflictLevel: 1 | 2 | 3
  conflictType: 'muscle_group' | 'cns_fatigue'
  severity: 'warning' | 'danger'
  /** Full advice, shown in the day sheet. */
  message: string
  /** One line for the week summary, e.g. "Combat Sports Tue → Running Wed". */
  summary: string
}
