// Presentation helpers shared by every conflict surface.

import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'
import { SPORT_META } from './sportMeta'

export interface InvolvedSession {
  sportLabel: string
  icon: string
  when: string
  rpe: number
}

export interface InvolvedPair {
  from?: InvolvedSession
  to?: InvolvedSession
}

function relativeDay(date: Date, now = new Date()): string {
  const d0 = new Date(date)
  d0.setHours(0, 0, 0, 0)
  const n0 = new Date(now)
  n0.setHours(0, 0, 0, 0)
  const diff = Math.round((n0.getTime() - d0.getTime()) / 86_400_000)
  if (diff === 0) return 'today'
  if (diff === 1) return 'yesterday'
  if (diff === -1) return 'tomorrow'
  return date.toLocaleDateString(undefined, { weekday: 'short' })
}

function describe(session: Session, now?: Date): InvolvedSession {
  const meta = SPORT_META[session.sport]
  return {
    sportLabel: meta?.label ?? session.sport,
    icon: meta?.icon ?? '🏅',
    when: relativeDay(new Date(session.date), now),
    rpe: session.rpe,
  }
}

export function involvedSessions(
  conflict: Conflict,
  sessions: Session[],
  now?: Date,
): InvolvedPair {
  const byId = new Map(sessions.map((s) => [s.id, s]))
  const trigger = byId.get(conflict.triggerSessionId)
  const clash = conflict.conflictingSessionId
    ? byId.get(conflict.conflictingSessionId)
    : undefined
  return {
    from: clash ? describe(clash, now) : undefined,
    to: trigger ? describe(trigger, now) : undefined,
  }
}

export function detectedAtDate(conflict: Conflict): Date {
  const ts = conflict.detectedAt
  if (ts && typeof ts.toDate === 'function') return ts.toDate()
  return new Date()
}

export function conflictSportsLabel(conflict: Conflict): string {
  if (conflict.sports.length === 0) return 'Weekly volume'
  return conflict.sports.map((s) => SPORT_META[s as keyof typeof SPORT_META]?.label ?? s).join(' + ')
}
