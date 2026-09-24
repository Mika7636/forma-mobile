// Data source behind the Progress screen.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { computeProgress, type ProgressData, type SportFilter } from '../utils/progressMetrics'
import type { Session } from '../types/session'

export interface UseProgressData {
  data: ProgressData
  totalSessions: number
  loading: boolean
  refresh: () => Promise<void>
}

export function useProgressData(sport: SportFilter): UseProgressData {
  const uid = useAuthStore((s) => s.user?.uid)
  const baselineCTL = useAuthStore((s) => s.profile?.baselineCTL)
  const createdAt = useAuthStore((s) => s.profile?.createdAt)

  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(!!uid)
  const [trackedUid, setTrackedUid] = useState(uid)

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

  const refresh = useCallback(
    () => new Promise<void>((resolve) => setTimeout(resolve, 500)),
    [],
  )

  const data = useMemo(
    () => computeProgress(sessions, sport, new Date(), { baselineCTL, createdAt }),
    [sessions, sport, baselineCTL, createdAt],
  )

  return { data, totalSessions: sessions.length, loading, refresh }
}
