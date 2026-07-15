// Real-time subscription to the signed-in user's *unresolved* training
// conflicts — FORMA's "coach in your pocket" warnings, surfaced as a dashboard
// banner. Ported from the web app.
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuthStore } from '../store/authStore'
import type { Conflict } from '../types/conflict'

function detectedAtMillis(conflict: Conflict): number {
  // Stored as a Firestore Timestamp; guard for the brief locally-created window
  // before the server value round-trips.
  const ts = conflict.detectedAt
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0
}

interface UseConflicts {
  /** Unresolved conflicts, newest first. */
  conflicts: Conflict[]
  loading: boolean
  /** Marks a conflict resolved; the live snapshot then drops it from the list. */
  dismissConflict: (id: string) => Promise<void>
}

export function useConflicts(): UseConflicts {
  const uid = useAuthStore((s) => s.user?.uid)
  const [trackedUid, setTrackedUid] = useState(uid)
  const [raw, setRaw] = useState<Conflict[]>([])
  const [loading, setLoading] = useState(!!uid)

  // Reset synchronously during render when the signed-in user changes, so a
  // switch to another account never briefly shows the previous user's warnings.
  if (uid !== trackedUid) {
    setTrackedUid(uid)
    setRaw([])
    setLoading(!!uid)
  }

  useEffect(() => {
    if (!uid) return

    // Ordering is done client-side so this needs only the single-field
    // `resolved` index — no composite Firestore index to provision.
    const q = query(collection(db, 'users', uid, 'conflicts'), where('resolved', '==', false))
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        setRaw(snapshot.docs.map((d) => ({ ...(d.data() as Conflict), conflictId: d.id })))
        setLoading(false)
      },
      () => setLoading(false),
    )
    return unsubscribe
  }, [uid])

  const conflicts = useMemo(
    () => [...raw].sort((a, b) => detectedAtMillis(b) - detectedAtMillis(a)),
    [raw],
  )

  async function dismissConflict(id: string) {
    if (!uid) return
    await updateDoc(doc(db, 'users', uid, 'conflicts', id), { resolved: true })
  }

  if (!uid) return { conflicts: [], loading: false, dismissConflict }

  return { conflicts, loading, dismissConflict }
}
