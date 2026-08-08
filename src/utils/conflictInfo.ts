// Presentation helpers shared by every conflict surface — resolving the two
// sessions a conflict involves into a friendly "Combat (yesterday, RPE 8) →
// Running (today, RPE 7)" pairing, and reading a conflict's timestamp safely.
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'
import { SPORT_META } from './sportMeta'

export interface InvolvedSession {
  sportLabel: string
  icon: string
  /** Relative day label: "today" / "yesterday" / "Mon". */
  when: string
  rpe: number
}

export interface InvolvedPair {
  /** The earlier session that was clashed with (null for budget conflicts). */
  from?: InvolvedSession
  /** The session that triggered the conflict (the one just logged). */
  to?: InvolvedSession
}

/** "today" / "yesterday" / "tomorrow" / a weekday name, in local time. */
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

/**
 * Resolve the trigger + clashing sessions a conflict references out of a session
 * list. Either side may be missing (session outside the window, or a whole-week
 * budget conflict with no counterpart) — callers should render gracefully.
 */
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

/**
 * A conflict's detection time as a Date. Stored as a Firestore Timestamp; guard
 * for the brief window before the server value round-trips (falls back to now).
 */
export function detectedAtDate(conflict: Conflict): Date {
  const ts = conflict.detectedAt
  if (ts && typeof ts.toDate === 'function') return ts.toDate()
  return new Date()
}

/** Human sport list for a conflict, e.g. "Combat Sports + Running". */
export function conflictSportsLabel(conflict: Conflict): string {
  if (conflict.sports.length === 0) return 'Weekly volume'
  return conflict.sports.map((s) => SPORT_META[s as keyof typeof SPORT_META]?.label ?? s).join(' + ')
}
