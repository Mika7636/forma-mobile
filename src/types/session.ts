export type SportType =
  | 'running'
  | 'swimming'
  | 'combat'
  | 'football'
  | 'cycling'
  | 'gym'
  | 'strength'

/** Estimated heart-rate zone persisted on a session (subset of {@link HRZone}). */
export interface SessionHRZone {
  zone: number
  name: string
  /** e.g. "152 - 171 bpm" */
  hrRange: string
}

export interface Session {
  id: string
  userId: string
  sport: SportType
  date: string
  durationMinutes: number
  distanceKm?: number
  rpe: number
  loadScore: number
  notes?: string
  createdAt: string
  // Auto-derived estimates, attached at log time from the user's profile +
  // these inputs (see src/algorithms/*). Optional so older sessions still load.
  estimatedCalories?: number
  estimatedHRZone?: SessionHRZone
  /** Pace/speed string for distance sports, e.g. "5:32 / km"; null otherwise. */
  pace?: string | null
  /** Optional manually-entered average heart rate from a wearable. */
  avgBpm?: number
}
