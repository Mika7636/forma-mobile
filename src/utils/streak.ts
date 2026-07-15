import type { Session } from '../types/session'
import { localISODate } from './dates'

/**
 * Consecutive days of training, counting backwards from today.
 *
 * Days are keyed by *local* calendar date (see {@link localISODate}) so a late
 * evening workout counts for the day the athlete actually trained, not the UTC
 * day it rolled into.
 *
 * Today is optional: a streak stays alive until a full day is missed, so a
 * streak built through yesterday still reads (and displays) while today is
 * untrained. Training today simply extends it. The first gap ends the count.
 */
export function calculateStreak(sessions: Session[]): number {
  if (sessions.length === 0) return 0

  const trainedDays = new Set<string>()
  for (const session of sessions) {
    trainedDays.add(localISODate(new Date(session.date)))
  }

  const cursor = new Date()
  // Grace day: if today hasn't been trained yet, start counting from yesterday
  // so the streak only breaks once a whole day has been missed.
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
