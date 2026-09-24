// Real-time session history for the signed-in user.

import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useSessionsStore } from '../store/sessionsStore'
import type { Session } from '../types/session'

interface SessionHistory {
  sessions: Session[]
  trainingDays: number
  totalSessions: number
  loading: boolean
  error: Error | null
}

export function useSessionHistory(): SessionHistory {
  const uid = useAuthStore((s) => s.user?.uid)
  const subscribe = useSessionsStore((s) => s.subscribe)
  const sessions = useSessionsStore((s) => s.sessions)
  const trainingDays = useSessionsStore((s) => s.trainingDays)
  const totalSessions = useSessionsStore((s) => s.totalSessions)
  const loadedUid = useSessionsStore((s) => s.loadedUid)
  const error = useSessionsStore((s) => s.error)

  useEffect(() => {
    if (!uid) return
    return subscribe(uid)
  }, [uid, subscribe])

  if (!uid) return { sessions: [], trainingDays: 0, totalSessions: 0, loading: false, error: null }

  const settled = loadedUid === uid
  if (!settled) {
    return { sessions: [], trainingDays: 0, totalSessions: 0, loading: error == null, error }
  }

  return { sessions, trainingDays, totalSessions, loading: false, error }
}
