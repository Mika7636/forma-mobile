// Consecutive training days, counting back from today.

import type { Session } from '../types/session'
import { localISODate } from './dates'

export function calculateStreak(sessions: Session[]): number {
  if (sessions.length === 0) return 0

  const trainedDays = new Set<string>()
  for (const session of sessions) {
    trainedDays.add(localISODate(new Date(session.date)))
  }

  const cursor = new Date()
  if (!trainedDays.has(localISODate(cursor))) {
    cursor.setDate(cursor.getDate() - 1)
  }

  let streak = 0
  while (trainedDays.has(localISODate(cursor))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }

  return streak
}
