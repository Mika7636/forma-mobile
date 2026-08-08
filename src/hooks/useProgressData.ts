// Data source behind the Progress screen. Live-subscribes to the signed-in
// user's sessions, then derives every chart dataset for the selected window
// (4 / 8 / 12 weeks) via `computeProgress`.
//
// Like the planner, the sessions listener is deliberately **unfiltered**: `date`
// is a Firestore `Timestamp` when written by this app but an ISO **string** when
// written by the web app, and a `where('date','>=',…)` range filter only matches
// documents whose field has the *same type* as the bound — so a windowed query
// would silently drop every session written by the other client. We read the
// collection, normalise both shapes through `toSession()`, and window in memory
// inside `computeProgress`, where the types are uniform. Firestore's local cache
// serves most of it since the sessions store makes the same call.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { computeProgress, type ProgressData } from '../utils/progressMetrics'
import type { Session } from '../types/session'

export interface UseProgressData {
  /** Computed chart datasets for the selected window. */
  data: ProgressData
  /** The user's full logged history (used by the screen's unlock guard). */
  totalSessions: number
  loading: boolean
  /** Pull-to-refresh handle; the listener is live so this is just an affordance. */
  refresh: () => Promise<void>
}

export function useProgressData(weeks: number): UseProgressData {
  const uid = useAuthStore((s) => s.user?.uid)
  const baselineCTL = useAuthStore((s) => s.profile?.baselineCTL)
  const createdAt = useAuthStore((s) => s.profile?.createdAt)

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

  // Reset synchronously during render on a user switch, so another account's
  // charts never flash on screen before the first snapshot lands.
  if (uid !== trackedUid) {
    setTrackedUid(uid)
    setSessions([])
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

  // Live listener → nothing to re-fetch; the delay just lets the spinner show.
  const refresh = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
    [],
  )

  const data = useMemo(
    () => computeProgress(sessions, weeks, new Date(), { baselineCTL, createdAt }),
    [sessions, weeks, baselineCTL, createdAt],
  )

  return { data, totalSessions: sessions.length, loading, refresh }
}
