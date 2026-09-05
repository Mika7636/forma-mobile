// Real-time session history for the signed-in user (last 42 days).
//
// The Firestore listener itself lives in the sessions store so the app keeps a
// single subscription no matter how many screens read from it; this hook binds
// its lifetime to the component and exposes the slice the UI wants.
import { useEffect } from 'react'
import { useAuthStore } from '../store/authStore'
import { useSessionsStore } from '../store/sessionsStore'
import type { Session } from '../types/session'

interface SessionHistory {
  /** Last 42 days of sessions, newest first. */
  sessions: Session[]
  /**
   * Distinct calendar days carrying a session across the athlete's **whole**
   * history — what the baseline gate counts.
   *
   * Separate from `sessions.length` and not derivable from it: `sessions` is
   * windowed to the CTL period, and the gate must see all of history. See
   * `sessionsStore`, which counts it before it windows.
   */
  trainingDays: number
  /** Sessions across all history, for the baseline card's caption. */
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

  // Signed out: nothing to load, nothing to show.
  if (!uid) return { sessions: [], trainingDays: 0, totalSessions: 0, loading: false, error: null }

  // Data counts as ours only once a snapshot for *this* uid has landed. That
  // covers the frame before the subscribe effect runs and the window after a
  // user switch, so we never flash the empty state or another account's data.
  const settled = loadedUid === uid
  if (!settled) {
    return { sessions: [], trainingDays: 0, totalSessions: 0, loading: error == null, error }
  }

  return { sessions, trainingDays, totalSessions, loading: false, error }
}
