// Real-time subscription to the user's planned sessions.

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
  plannedConflicts: PlannedConflict[]
  byDay: Map<string, PlannedSession[]>
  conflictsByDay: Map<string, PlannedConflict[]>
  loading: boolean
}

export function usePlannedSessions(): UsePlannedSessions {
  const uid = useAuthStore((s) => s.user?.uid)
  const profile = useAuthStore((s) => s.profile)

  const [planned, setPlanned] = useState<PlannedSession[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

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

  const byDay = useMemo(() => {
    const map = new Map<string, PlannedSession[]>()
    for (const plan of planned) {
      if (!plan.date) continue
      const bucket = map.get(plan.date)
      if (bucket) bucket.push(plan)
      else map.set(plan.date, [plan])
    }
    for (const bucket of map.values()) bucket.sort((a, b) => b.intensity - a.intensity)
    return map
  }, [planned])

  const plannedConflicts = useMemo(
    () => (profile ? detectPlannedConflicts(planned, profile) : []),
    [planned, profile],
  )

  const conflictsByDay = useMemo(() => {
    const map = new Map<string, PlannedConflict[]>()
    for (const conflict of plannedConflicts) {
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
