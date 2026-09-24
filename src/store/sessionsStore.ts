// Owns the single real-time listener on the user's sessions.

import { collection, onSnapshot } from 'firebase/firestore'
import { create } from 'zustand'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { countTrainingDays } from '../utils/calibration'
import type { Session } from '../types/session'
import { useMetricsStore } from './metricsStore'

export const HISTORY_WINDOW_DAYS = 42
const WEEK_DAYS = 7

interface SessionsState {
  sessions: Session[]
  weekSessions: Session[]
  trainingDays: number
  totalSessions: number
  loading: boolean
  loadedUid: string | null
  error: Error | null
  subscribe: (uid: string) => () => void
  clear: () => void
}

function cutoffDate(daysAgo: number): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysAgo)
  return cutoff.getTime()
}

const emptyState = {
  sessions: [] as Session[],
  weekSessions: [] as Session[],
  trainingDays: 0,
  totalSessions: 0,
  loading: false,
  loadedUid: null as string | null,
  error: null as Error | null,
}

export const useSessionsStore = create<SessionsState>((set) => ({
  ...emptyState,

  subscribe: (uid) => {
    if (listener && listener.uid === uid) {
      listener.refs += 1
      return () => release(uid)
    }
    teardown()

    set({
      sessions: [],
      weekSessions: [],
      trainingDays: 0,
      totalSessions: 0,
      loading: true,
      loadedUid: null,
      error: null,
    })

    const unsubscribe = onSnapshot(
      collection(db, 'users', uid, 'sessions'),
      (snapshot) => {
        const cutoff = cutoffDate(HISTORY_WINDOW_DAYS)
        const weekCutoff = cutoffDate(WEEK_DAYS)

        const all = snapshot.docs.map((d) => toSession(d.id, d.data()))

        const sessions = all
          .filter((s) => new Date(s.date).getTime() >= cutoff)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        const weekSessions = sessions.filter(
          (s) => new Date(s.date).getTime() >= weekCutoff,
        )

        set({
          sessions,
          weekSessions,
          trainingDays: countTrainingDays(all),
          totalSessions: all.length,
          loading: false,
          loadedUid: uid,
          error: null,
        })
        useMetricsStore.getState().recalculate(sessions)
      },
      (error) => set({ error, loading: false }),
    )

    listener = { uid, refs: 1, unsubscribe }
    return () => release(uid)
  },

  clear: () => {
    teardown()
    set({ ...emptyState })
    useMetricsStore.getState().reset()
  },
}))

interface ActiveListener {
  uid: string
  refs: number
  unsubscribe: () => void
}

let listener: ActiveListener | null = null

function teardown() {
  listener?.unsubscribe()
  listener = null
}

function release(uid: string) {
  if (!listener || listener.uid !== uid) return
  listener.refs -= 1
  if (listener.refs > 0) return
  teardown()
  useSessionsStore.setState({ ...emptyState })
  useMetricsStore.getState().reset()
}
