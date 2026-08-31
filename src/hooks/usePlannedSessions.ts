// Real-time subscription to the signed-in user's planned sessions, plus the
// conflicts they imply.
//
// Shared by the Planner (which lays them out on a month grid) and the Dashboard
// (which shows today's, and is the reason this was pulled out of `useMonthPlan`
// rather than left inline there). Both screens need the same two things —
// plans by day, and clashes by day — and computing them twice from two listeners
// would let the two surfaces disagree about the same week.
//
// The listener is deliberately **unfiltered**. Plans are few (a week or two of
// intentions at a time), and the conflict pass needs the neighbours of every day
// it judges: a query windowed to "this month" would drop the 31st of last month
// and with it the reason the 1st is flagged.
import { useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { detectPlannedConflicts } from '../algorithms/conflictDetector'
import { toPlannedSession } from '../services/plannedSessionService'
import { useAuthStore } from '../store/authStore'
import type { PlannedConflict } from '../types/conflict'
import type { PlannedSession } from '../types/planned'

export interface UsePlannedSessions {
  planned: PlannedSession[]
  /** Every planned clash on the calendar. Recomputed, never stored. */
  plannedConflicts: PlannedConflict[]
  /** Plans keyed by local day (`YYYY-MM-DD`), hardest first within a day. */
  byDay: Map<string, PlannedSession[]>
  /** Clashes keyed by day — filed under **both** of the days they span. */
  conflictsByDay: Map<string, PlannedConflict[]>
  loading: boolean
}

export function usePlannedSessions(): UsePlannedSessions {
  const uid = useAuthStore((s) => s.user?.uid)
  const profile = useAuthStore((s) => s.profile)

  const [planned, setPlanned] = useState<PlannedSession[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

  // Reset synchronously during render on a user switch, so another account's
  // plans never flash on screen before the first snapshot lands.
  if (uid !== trackedUid) {
    setTrackedUid(uid)
    setPlanned([])
    setLoading(!!uid)
  }

  useEffect(() => {
    if (!uid) return
    return onSnapshot(
      collection(db, 'users', uid, 'plannedSessions'),
      (snapshot) => {
        setPlanned(snapshot.docs.map((d) => toPlannedSession(d.id, d.data())))
        setLoading(false)
      },
      () => setLoading(false),
    )
  }, [uid])

  // `date` is already a local day key, so unlike logged sessions there is
  // nothing to normalise before bucketing.
  const byDay = useMemo(() => {
    const map = new Map<string, PlannedSession[]>()
    for (const plan of planned) {
      if (!plan.date) continue
      const bucket = map.get(plan.date)
      if (bucket) bucket.push(plan)
      else map.set(plan.date, [plan])
    }
    // Hardest first: on a day holding two plans it is the hard one that drives
    // the advice, and it should be the one a truncated list shows.
    for (const bucket of map.values()) bucket.sort((a, b) => b.intensity - a.intensity)
    return map
  }, [planned])

  // FORMA's signature warning, run forward over the calendar instead of backward
  // over history — this is what a brand-new account sees on day one.
  const plannedConflicts = useMemo(
    () => (profile ? detectPlannedConflicts(planned, profile) : []),
    [planned, profile],
  )

  const conflictsByDay = useMemo(() => {
    const map = new Map<string, PlannedConflict[]>()
    for (const conflict of plannedConflicts) {
      // `new Set` because a same-day clash names one day twice, and filing it
      // twice would double every count that reads this map.
      for (const day of new Set(conflict.dates)) {
        const bucket = map.get(day)
        if (bucket) bucket.push(conflict)
        else map.set(day, [conflict])
      }
    }
    return map
  }, [plannedConflicts])

  if (!uid) {
    return {
      planned: [],
      plannedConflicts: [],
      byDay: new Map(),
      conflictsByDay: new Map(),
      loading: false,
    }
  }

  return { planned, plannedConflicts, byDay, conflictsByDay, loading }
}
