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
  loading: boolean
  error: Error | null
}

export function useSessionHistory(): SessionHistory {
  const uid = useAuthStore((s) => s.user?.uid)
  const subscribe = useSessionsStore((s) => s.subscribe)
  const sessions = useSessionsStore((s) => s.sessions)
  const loadedUid = useSessionsStore((s) => s.loadedUid)
  const error = useSessionsStore((s) => s.error)

  useEffect(() => {
    if (!uid) return
    return subscribe(uid)
  }, [uid, subscribe])

  // Signed out: nothing to load, nothing to show.
  if (!uid) return { sessions: [], loading: false, error: null }

  // Data counts as ours only once a snapshot for *this* uid has landed. That
  // covers the frame before the subscribe effect runs and the window after a
  // user switch, so we never flash the empty state or another account's data.
  const settled = loadedUid === uid
  if (!settled) return { sessions: [], loading: error == null, error }

  return { sessions, loading: false, error }
}
