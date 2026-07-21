// Real-time weekly training plan — the data source behind the Planner screen.
//
// Given a week offset (0 = this week, -1 = last week, +1 = next week) it
// resolves the Monday→Sunday ISO week around today, then buckets that week's
// sessions and unresolved conflicts into seven day objects the UI can render
// directly.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { addDays, localISODate, startOfWeek } from '../utils/dates'
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'

/** One calendar day of the planner week. */
export interface PlannerDay {
  /** Local midnight of this day. */
  date: Date
  /** Local calendar key, YYYY-MM-DD. */
  isoDate: string
  /** Short weekday name, e.g. "Mon". */
  dayName: string
  /** Day of month, e.g. 21. */
  dayNumber: number
  isToday: boolean
  isPast: boolean
  isFuture: boolean
  /** Sessions on this day, chronological. */
  sessions: Session[]
  /** Unresolved conflicts anchored to a session on this day. */
  conflicts: Conflict[]
  dayLoad: number
  dayHours: number
  dayCalories: number
}

export interface WeeklyPlan {
  /** Monday, local midnight. */
  weekStart: Date
  /** Sunday, local end-of-day. */
  weekEnd: Date
  days: PlannerDay[]
  totalHours: number
  totalLoad: number
  totalCalories: number
  sessionCount: number
  loading: boolean
  /** Pull-to-refresh handle (see the note on {@link useWeeklyPlan}). */
  refresh: () => Promise<void>
}

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

/** Monday (local midnight) of the ISO week `weekOffset` weeks from today. */
function mondayOf(weekOffset: number): Date {
  return startOfWeek(addDays(new Date(), weekOffset * 7))
}

/**
 * Subscribes to the signed-in user's sessions and unresolved conflicts and
 * slices out one ISO week.
 *
 * The sessions listener is deliberately **unfiltered**: `date` is a Firestore
 * `Timestamp` when written by this app but an ISO **string** when written by the
 * web app, and Firestore range filters only ever match documents whose field has
 * the same type as the bound — a `where('date','>=',<Timestamp>)` week query
 * would silently drop every web-logged session (and vice versa) with no error.
 * So we read the collection, normalise both shapes through `toSession()`, and
 * window in memory where the types are uniform. Same call the sessions store
 * makes, so Firestore's local cache serves most of it.
 */
export function useWeeklyPlan(weekOffset = 0): WeeklyPlan {
  const uid = useAuthStore((s) => s.user?.uid)

  const [sessions, setSessions] = useState<Session[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

  // Reset synchronously during render on a user switch, so another account's
  // week never flashes on screen before the first snapshot lands.
  if (uid !== trackedUid) {
    setTrackedUid(uid)
    setSessions([])
    setConflicts([])
    setLoading(!!uid)
  }

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      collection(db, 'users', uid, 'sessions'),
      (snapshot) => {
        setSessions(snapshot.docs.map((d) => toSession(d.id, d.data())))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  useEffect(() => {
    if (!uid) return
    // Single-field `resolved` filter only — no composite index needed.
    const q = query(collection(db, 'users', uid, 'conflicts'), where('resolved', '==', false))
    return onSnapshot(
      q,
      (snapshot) =>
        setConflicts(
          snapshot.docs.map((d) => ({ ...(d.data() as Conflict), conflictId: d.id })),
        ),
      () => undefined,
    )
  }, [uid])

  // Both collections are live listeners, so a pull-to-refresh has nothing to
  // re-fetch. It stays as an affordance (and a way to force a re-render after a
  // dropped connection recovers); the delay just lets the spinner be seen.
  const refresh = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
    [],
  )

  const plan = useMemo(() => {
    const weekStart = mondayOf(weekOffset)
    const weekEnd = addDays(weekStart, 6)
    weekEnd.setHours(23, 59, 59, 999)
    const todayKey = localISODate(new Date())

    // Bucket this week's sessions by local calendar day. Grouping on the *local*
    // date (not the UTC ISO date) keeps an evening workout on the day it
    // actually happened.
    const byDay = new Map<string, Session[]>()
    const dayOfSession = new Map<string, string>()
    for (const session of sessions) {
      const when = new Date(session.date)
      if (when < weekStart || when > weekEnd) continue
      const key = localISODate(when)
      dayOfSession.set(session.id, key)
      const bucket = byDay.get(key)
      if (bucket) bucket.push(session)
      else byDay.set(key, [session])
    }

    // A conflict lands on the day of the session that triggered it; whole-week
    // conflicts (budget_exceeded) have no counterpart session and still anchor
    // to their trigger.
    const conflictsByDay = new Map<string, Conflict[]>()
    for (const conflict of conflicts) {
      const key =
        dayOfSession.get(conflict.triggerSessionId) ??
        (conflict.conflictingSessionId
          ? dayOfSession.get(conflict.conflictingSessionId)
          : undefined)
      if (!key) continue
      const bucket = conflictsByDay.get(key)
      if (bucket) bucket.push(conflict)
      else conflictsByDay.set(key, [conflict])
    }

    const days: PlannerDay[] = Array.from({ length: 7 }, (_, i) => {
      const date = addDays(weekStart, i)
      date.setHours(0, 0, 0, 0)
      const isoDate = localISODate(date)
      const daySessions = (byDay.get(isoDate) ?? []).sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      )

      return {
        date,
        isoDate,
        dayName: DAY_NAMES[i],
        dayNumber: date.getDate(),
        isToday: isoDate === todayKey,
        isPast: isoDate < todayKey,
        isFuture: isoDate > todayKey,
        sessions: daySessions,
        conflicts: conflictsByDay.get(isoDate) ?? [],
        dayLoad: daySessions.reduce((sum, s) => sum + (s.loadScore ?? 0), 0),
        dayHours: daySessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60,
        dayCalories: daySessions.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0),
      }
    })

    return {
      weekStart,
      weekEnd,
      days,
      totalHours: days.reduce((sum, d) => sum + d.dayHours, 0),
      totalLoad: days.reduce((sum, d) => sum + d.dayLoad, 0),
      totalCalories: days.reduce((sum, d) => sum + d.dayCalories, 0),
      sessionCount: days.reduce((sum, d) => sum + d.sessions.length, 0),
    }
  }, [sessions, conflicts, weekOffset])

  return { ...plan, loading, refresh }
}
