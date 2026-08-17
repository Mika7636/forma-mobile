// Real-time subscription to the signed-in user's *unresolved* training
// conflicts — FORMA's "coach in your pocket" warnings, surfaced as a dashboard
// banner. Ported from the web app.
import { useEffect, useMemo, useState } from 'react'
import { collection, doc, onSnapshot, query, updateDoc, where } from 'firebase/firestore'
import { db } from '../config/firebase'
import { useAuthStore } from '../store/authStore'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { conflictDedupeKey, type Conflict } from '../types/conflict'

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

  // Newest first, then collapse duplicates so the same advice never stacks up as
  // two identical banners. Duplicates arise legitimately (two runs each clashing
  // with the same gym session share one message) and from any historical
  // double-write; keying on the advice (type + sports) rather than the doc id
  // means we keep the newest of each and drop the rest.
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
    // The banner shown is one representative of its dedupe group; resolve every
    // doc that shares its advice key, or a collapsed older duplicate would pop
    // straight back up as a banner the moment this one is marked resolved.
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
      // Called as `void dismissConflict(id)` from the dashboard banner, so an
      // escaping rejection would be unhandled. Tell the user instead: the
      // banner staying put is otherwise indistinguishable from a dead button.
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
