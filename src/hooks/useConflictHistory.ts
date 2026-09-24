// Real-time subscription to all of the user's conflicts.

import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { resolveConflict } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { detectedAtDate } from '../utils/conflictInfo'
import type { Conflict } from '../types/conflict'

interface UseConflictHistory {
  conflicts: Conflict[]
  loading: boolean
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
    try {
      await resolveConflict(uid, id)
    } catch {
      toast.error('Could not dismiss', {
        description: isOffline()
          ? "You're offline — reconnect and try again."
          : 'Something went wrong. Please try again.',
      })
    }
  }

  if (!uid) return { conflicts: [], loading: false, dismiss }
  return { conflicts, loading, dismiss }
}
