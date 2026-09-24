// Real-time subscription to the user's unresolved conflicts.

import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuthStore } from '../store/authStore'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { conflictDedupeKey, type Conflict } from '../types/conflict'

function detectedAtMillis(conflict: Conflict): number {
  const ts = conflict.detectedAt
  return typeof ts?.toMillis === 'function' ? ts.toMillis() : 0
}

interface UseConflicts {
  conflicts: Conflict[]
  loading: boolean
  dismissConflict: (id: string) => Promise<void>
}

export function useConflicts(): UseConflicts {
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

  const conflicts = useMemo(() => {
    const sorted = [...raw].sort((a, b) => detectedAtMillis(b) - detectedAtMillis(a))
    const seen = new Set<string>()
    const unique: Conflict[] = []
    for (const conflict of sorted) {
      const key = conflictDedupeKey(conflict)
      if (seen.has(key)) continue
      seen.add(key)
      unique.push(conflict)
    }
    return unique
  }, [raw])

  async function dismissConflict(id: string) {
    if (!uid) return
    const target = raw.find((c) => c.conflictId === id)
    const targets = target
      ? raw.filter((c) => conflictDedupeKey(c) === conflictDedupeKey(target))
      : raw.filter((c) => c.conflictId === id)
    try {
      await Promise.all(
        targets.map((c) =>
          updateDoc(doc(db, 'users', uid, 'conflicts', c.conflictId), { resolved: true }),
        ),
      )
    } catch {
      toast.error('Could not dismiss', {
        description: isOffline()
          ? "You're offline — reconnect and try again."
          : 'Something went wrong. Please try again.',
      })
    }
  }

  if (!uid) return { conflicts: [], loading: false, dismissConflict }

  return { conflicts, loading, dismissConflict }
}
