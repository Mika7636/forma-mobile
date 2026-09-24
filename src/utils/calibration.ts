// Cold-start gates: how much history unlocks each feature.

import type { Session } from '../types/session'

export const CALIBRATION_SESSION_TARGET = 7
export const PROGRESS_UNLOCK_SESSIONS = 5

export const BASELINE_DAYS = 42

export interface BaselineInput {
  trainingDays: number
  sessionsLogged: number
}

export interface BaselineState {
  building: boolean
  daysCovered: number
  target: number
  daysRemaining: number
  fraction: number
  sessionsLogged: number
}

function dayIndex(value: string | Date): number | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86_400_000)
}

export function countTrainingDays(sessions: Session[]): number {
  const days = new Set<number>()
  for (const s of sessions) {
    const day = dayIndex(s.date)
    if (day === null) continue
    days.add(day)
  }
  return days.size
}

export function getBaselineState({ trainingDays, sessionsLogged }: BaselineInput): BaselineState {
  const daysCovered = Math.max(0, Math.min(trainingDays, BASELINE_DAYS))

  return {
    building: daysCovered < BASELINE_DAYS,
    daysCovered,
    target: BASELINE_DAYS,
    daysRemaining: Math.max(0, BASELINE_DAYS - daysCovered),
    fraction: clamp01(daysCovered / BASELINE_DAYS),
    sessionsLogged,
  }
}

function clamp01(n: number): number {
  return Number.isFinite(n) ? Math.max(0, Math.min(n, 1)) : 0
}
