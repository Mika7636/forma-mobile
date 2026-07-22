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
