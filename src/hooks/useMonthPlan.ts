// Real-time month calendar of training, behind the Planner.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot, query, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { usePlannedSessions } from './usePlannedSessions'
import { localISODate, WEEKDAY_INITIALS } from '../utils/dates'
import type { Conflict, PlannedConflict } from '../types/conflict'
import type { PlannedSession } from '../types/planned'
import type { Session } from '../types/session'

export interface CalendarDay {
  date: Date
  isoDate: string
  dayNumber: number
  inMonth: boolean
  isToday: boolean
  isFuture: boolean
  sessions: Session[]
  planned: PlannedSession[]
  conflicts: Conflict[]
  plannedConflicts: PlannedConflict[]
  dayLoad: number
  dayHours: number
  dayCalories: number
}

export interface MonthPlan {
  monthStart: Date
  monthName: string
  year: number
  weeks: CalendarDay[][]
  totalHours: number
  totalLoad: number
  totalCalories: number
  sessionCount: number
  plannedCount: number
  loading: boolean
  refresh: () => Promise<void>
}

export function useMonthPlan(monthOffset = 0): MonthPlan {
  const uid = useAuthStore((s) => s.user?.uid)

  const { byDay: plannedByDay, conflictsByDay: plannedConflictsByDay } = usePlannedSessions()

  const [sessions, setSessions] = useState<Session[]>([])
  const [conflicts, setConflicts] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

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

  const refresh = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
    [],
  )

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
    const monthStart = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1)
    const year = monthStart.getFullYear()
    const month = monthStart.getMonth()

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
