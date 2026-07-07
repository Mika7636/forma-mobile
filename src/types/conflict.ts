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
