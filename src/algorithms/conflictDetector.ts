// Detects training conflicts between logged sessions, and between planned ones.

import { Timestamp } from 'firebase/firestore'
import { getInteractionLevel } from './sportInteractions'
import type { Conflict, PlannedConflict } from '../types/conflict'
import type { PlannedSession } from '../types/planned'
import type { Session, SportType } from '../types/session'
import type { ConflictSensitivity, User } from '../types/user'
import { SPORT_META } from '../utils/sportMeta'

const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

function thresholds(sensitivity: ConflictSensitivity) {
  return {
    sport: sensitivity === 'strict' ? 6 : 7,
    cns: sensitivity === 'strict' ? 7 : 8,
  }
}

export function sportOverlapThreshold(sensitivity: ConflictSensitivity): number {
  return thresholds(sensitivity).sport
}

const SOFTER_SENSITIVITY: Record<ConflictSensitivity, ConflictSensitivity> = {
  strict: 'balanced',
  balanced: 'relaxed',
  relaxed: 'relaxed',
}

export { getInteractionLevel } from './sportInteractions'

function sportLabel(sport: string): string {
  return SPORT_META[sport as SportType]?.label ?? sport
}

function overlapRisk(level: number): string {
  return level >= 3
    ? 'heavy overlap in the same muscle groups and high nervous-system load'
    : 'meaningful fatigue overlap in the muscles you just stressed'
}

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

  const make = (
    fields: Omit<Conflict, 'conflictId' | 'detectedAt' | 'resolved'>,
  ): Conflict => ({
    conflictId: '',
    detectedAt: Timestamp.now(),
    resolved: false,
    ...fields,
  })

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

  const surfaced = calibrating
    ? conflicts.filter((c) => c.conflictType !== 'budget_exceeded')
    : conflicts

  if (sensitivity === 'relaxed') {
    return surfaced.filter((c) => c.severity === 'danger')
  }
  return surfaced
}

const PLANNED_WINDOW_DAYS = 2

function planDate(isoDay: string): Date {
  return new Date(`${isoDay}T12:00:00`)
}

function dayGap(a: string, b: string): number {
  return Math.round(Math.abs(planDate(a).getTime() - planDate(b).getTime()) / 86_400_000)
}

function shortDay(isoDay: string): string {
  return planDate(isoDay).toLocaleDateString(undefined, { weekday: 'short' })
}

function plannedOverlapAdvice(level: number): string {
  return level >= 3
    ? 'They load the same muscles and the same nervous system, so the second one starts in a hole.'
    : 'They share enough fatigue that the second one will be flat.'
}

export function detectPlannedConflicts(
  planned: PlannedSession[],
  userProfile: User,
): PlannedConflict[] {
  const sensitivity = userProfile.conflictSensitivity ?? 'balanced'
  const { sport: sportRpeThreshold, cns: cnsThreshold } = thresholds(sensitivity)
  const matrix = userProfile.sportInteractions ?? {}

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

      const candidates: PlannedConflict[] = []

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

      const eligible =
        sensitivity === 'relaxed'
          ? candidates.filter((c) => c.severity === 'danger')
          : candidates
      if (eligible.length > 0) conflicts.push(eligible[0])
    }
  }

  return conflicts
}
