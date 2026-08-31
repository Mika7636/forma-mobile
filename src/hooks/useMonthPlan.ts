// Real-time month calendar of training — the data source behind the Planner.
//
// Given a month offset (0 = this month, -1 = last month, +1 = next month) it
// builds the calendar grid for that month: whole Sunday→Saturday rows, padded
// at both ends with the neighbouring months' days so no row is ragged. Each
// cell carries what landed on it: sessions logged, sessions planned, and the
// conflicts raised by either — the plans and their clashes coming from
// `usePlannedSessions`, which the Dashboard shares.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { usePlannedSessions } from './usePlannedSessions'
import { localISODate } from '../utils/dates'
import type { Conflict, PlannedConflict } from '../types/conflict'
import type { PlannedSession } from '../types/planned'
import type { Session } from '../types/session'

/** One cell of the month grid. */
export interface CalendarDay {
  /** Local midnight of this day. */
  date: Date
  /** Local calendar key, YYYY-MM-DD. */
  isoDate: string
  /** Day of month, e.g. 21. */
  dayNumber: number
  /** False for the leading/trailing days borrowed from the adjacent months. */
  inMonth: boolean
  isToday: boolean
  isFuture: boolean
  /** Sessions on this day, chronological. */
  sessions: Session[]
  /** Sessions *planned* for this day — intentions, not training. */
  planned: PlannedSession[]
  /** Unresolved conflicts anchored to a session on this day. */
  conflicts: Conflict[]
  /**
   * Planned-session clashes touching this day.
   *
   * A planned conflict spans two days and is attached to **both**, so an athlete
   * scanning the grid sees the mark on the Tuesday they would move as readily as
   * on the Wednesday it lands on. The day sheet then explains the pair.
   */
  plannedConflicts: PlannedConflict[]
  dayLoad: number
  dayHours: number
  dayCalories: number
}

export interface MonthPlan {
  /** The 1st of the displayed month, local midnight. */
  monthStart: Date
  /** Full month name for the header, e.g. "August". */
  monthName: string
  year: number
  /** Calendar rows, Sunday-first — 4–6 of them depending on the month's shape. */
  weeks: CalendarDay[][]
  /** Totals across the displayed month only (padding days excluded). */
  totalHours: number
  totalLoad: number
  totalCalories: number
  sessionCount: number
  /** Plans on the displayed month (padding days excluded). */
  plannedCount: number
  loading: boolean
  /** Pull-to-refresh handle (see the note on {@link useMonthPlan}). */
  refresh: () => Promise<void>
}

/** Sunday-first column headers, matching the grid's day order. */
export const WEEKDAY_INITIALS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

/**
 * Subscribes to the signed-in user's sessions and unresolved conflicts and
 * lays one month out as a calendar grid.
 *
 * The sessions listener is deliberately **unfiltered**: `date` is a Firestore
 * `Timestamp` when written by this app but an ISO **string** when written by the
 * web app, and Firestore range filters only ever match documents whose field has
 * the same type as the bound — a `where('date','>=',<Timestamp>)` month query
 * would silently drop every web-logged session (and vice versa) with no error.
 * So we read the collection, normalise both shapes through `toSession()`, and
 * window in memory where the types are uniform. Same call the sessions store
 * makes, so Firestore's local cache serves most of it.
 */
export function useMonthPlan(monthOffset = 0): MonthPlan {
  const uid = useAuthStore((s) => s.user?.uid)

  // Plans and their clashes come from the shared hook, so the Planner and the
  // Dashboard can never disagree about the same week.
  // Consumers that want the calendar-wide list rather than the per-day one call
  // `usePlannedSessions` directly; a month grid only ever needs the buckets.
  const { byDay: plannedByDay, conflictsByDay: plannedConflictsByDay } = usePlannedSessions()

  const [sessions, setSessions] = useState<Session[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

  // Reset synchronously during render on a user switch, so another account's
  // calendar never flashes on screen before the first snapshot lands.
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

  // Bucket *every* session by local calendar day once, rather than per month.
  // Grouping on the local date (not the UTC ISO date) keeps an evening workout
  // on the day it actually happened, and doing it here means paging through
  // months is a pair of map lookups per cell instead of a re-scan.
  const byDay = useMemo(() => {
    const map = new Map<string, Session[]>()
    for (const session of sessions) {
      const key = localISODate(new Date(session.date))
      const bucket = map.get(key)
      if (bucket) bucket.push(session)
      else map.set(key, [session])
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
    }
    return map
  }, [sessions])

  // A conflict lands on the day of the session that triggered it; whole-week
  // conflicts (budget_exceeded) have no counterpart session and still anchor
  // to their trigger.
  const conflictsByDay = useMemo(() => {
    const dayOfSession = new Map<string, string>()
    for (const session of sessions) {
      dayOfSession.set(session.id, localISODate(new Date(session.date)))
    }
    const map = new Map<string, Conflict[]>()
    for (const conflict of conflicts) {
      const key =
        dayOfSession.get(conflict.triggerSessionId) ??
        (conflict.conflictingSessionId
          ? dayOfSession.get(conflict.conflictingSessionId)
          : undefined)
      if (!key) continue
      const bucket = map.get(key)
      if (bucket) bucket.push(conflict)
      else map.set(key, [conflict])
    }
    return map
  }, [sessions, conflicts])

  const grid = useMemo(() => {
    const now = new Date()
    // The (year, month, day) constructor normalises overflow in both
    // directions, so December → +1 and January → -1 need no special casing,
    // and every cell is a real local midnight (no DST drift from adding ms).
    const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()

    // Days of the previous month needed to fill the first row (Sunday-first),
    // and how many rows that month then spans.
    const leading = monthStart.getDay()
    const daysInMonth = new Date(year, month + 1, 0).getDate()
    const rows = Math.ceil((leading + daysInMonth) / 7)

    const todayKey = localISODate(now)

    const weeks: CalendarDay[][] = Array.from({ length: rows }, (_, row) =>
      Array.from({ length: 7 }, (_, col) => {
        const date = new Date(year, month, 1 - leading + row * 7 + col)
        const isoDate = localISODate(date)
        const daySessions = byDay.get(isoDate) ?? []

        return {
          date,
          isoDate,
          dayNumber: date.getDate(),
          inMonth: date.getMonth() === month && date.getFullYear() === year,
          isToday: isoDate === todayKey,
          isFuture: isoDate > todayKey,
          sessions: daySessions,
          planned: plannedByDay.get(isoDate) ?? [],
          conflicts: conflictsByDay.get(isoDate) ?? [],
          plannedConflicts: plannedConflictsByDay.get(isoDate) ?? [],
          dayLoad: daySessions.reduce((sum, s) => sum + (s.loadScore ?? 0), 0),
          dayHours: daySessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60,
          dayCalories: daySessions.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0),
        }
      }),
    )

    const monthDays = weeks.flat().filter((d) => d.inMonth)

    return {
      monthStart,
      monthName: monthStart.toLocaleDateString(undefined, { month: 'long' }),
      year,
      weeks,
      totalHours: monthDays.reduce((sum, d) => sum + d.dayHours, 0),
      totalLoad: monthDays.reduce((sum, d) => sum + d.dayLoad, 0),
      totalCalories: monthDays.reduce((sum, d) => sum + d.dayCalories, 0),
      sessionCount: monthDays.reduce((sum, d) => sum + d.sessions.length, 0),
      plannedCount: monthDays.reduce((sum, d) => sum + d.planned.length, 0),
    }
  }, [byDay, plannedByDay, conflictsByDay, plannedConflictsByDay, monthOffset])

  return { ...grid, loading, refresh }
}
