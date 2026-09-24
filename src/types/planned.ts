// The planned-session document shape.

import type { SportType } from './session'

export interface PlannedSession {
  id: string
  userId: string
  sport: SportType
  date: string
  durationMinutes: number
  intensity: number
  createdAt: string
}

export interface PlannedSessionInput {
  sport: SportType
  date: string
  durationMinutes: number
  intensity: number
}
