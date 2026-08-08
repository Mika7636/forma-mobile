// Real-time subscription to *all* of the signed-in user's conflicts — resolved
// and unresolved — for the Conflict History screen. Unlike useConflicts (which
// powers the dashboard banner and filters to unresolved + dedupes), this keeps
// every document so the history is complete; sorting and filtering are done by
// the screen.
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { resolveConflict } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { detectedAtDate } from '../utils/conflictInfo'
import type { Conflict } from '../types/conflict'

interface UseConflictHistory {
  /** Every conflict for the user, newest first. */
  conflicts: Conflict[]
  loading: boolean
  /** Mark one conflict resolved; the live snapshot moves it to "Dismissed". */
  dismiss: (id: string) => Promise<void>
}

export function useConflictHistory(): UseConflictHistory {
  const uid = useAuthStore((s) => s.user?.uid)
  const [trackedUid, setTrackedUid] = useState(uid)
  const [raw, setRaw] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(!!uid)

  if (uid !== trackedUid) {
    setTrackedUid(uid)
    setRaw([])
    setLoading(!!uid)
  }

  useEffect(() => {
    if (!uid) return
    // Whole collection, unfiltered — ordering is client-side so there's no
    // composite index to provision.
    const unsubscribe = onSnapshot(
      collection(db, 'users', uid, 'conflicts'),
      (snapshot) => {
        setRaw(snapshot.docs.map((d) => ({ ...(d.data() as Conflict), conflictId: d.id })))
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsubscribe
  }, [uid])

  const conflicts = useMemo(
    () => [...raw].sort((a, b) => detectedAtDate(b).getTime() - detectedAtDate(a).getTime()),
    [raw],
  )

  async function dismiss(id: string) {
    if (!uid) return
    await resolveConflict(uid, id)
  }

  if (!uid) return { conflicts: [], loading: false, dismiss }
  return { conflicts, loading, dismiss }
}
