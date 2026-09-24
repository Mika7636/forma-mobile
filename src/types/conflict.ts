// Conflict document shapes, and their identity keys.

import type { Timestamp } from 'firebase/firestore'

export interface Conflict {
  conflictId: string
  detectedAt: Timestamp
  resolved: boolean
  triggerSessionId: string
  conflictingSessionId: string | null
  sports: string[]
  conflictLevel: 1 | 2 | 3
  conflictType: 'muscle_group' | 'cns_fatigue' | 'budget_exceeded'
  message: string
  severity: 'warning' | 'danger'
}

/** Write identity: the exact (trigger, clashing, type) triple. */
export function conflictStorageKey(
  c: Pick<Conflict, 'triggerSessionId' | 'conflictingSessionId' | 'conflictType'>,
): string {
  return `${c.triggerSessionId}|${c.conflictingSessionId ?? ''}|${c.conflictType}`
}

/** Display identity: one row per (type, sports) pair, however many were written. */
export function conflictDedupeKey(c: Pick<Conflict, 'conflictType' | 'sports'>): string {
  return `${c.conflictType}|${[...c.sports].sort().join(',')}`
}

export interface PlannedConflict {
  id: string
  plannedIds: [string, string]
  dates: [string, string]
  sports: string[]
  conflictLevel: 1 | 2 | 3
  conflictType: 'muscle_group' | 'cns_fatigue'
  severity: 'warning' | 'danger'
  message: string
  summary: string
}
