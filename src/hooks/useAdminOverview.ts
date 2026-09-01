import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAdminOverview, type AdminOverview } from '../services/adminService'

interface AdminOverviewState {
  data: AdminOverview | null
  /** True only while the *first* load is in flight — what the skeleton gates on. */
  loading: boolean
  error: Error | null
  /** Re-fetch. Resolves when the request settles, so pull-to-refresh can await it. */
  refresh: () => Promise<void>
}

/**
 * Loads the Admin screen's aggregates once on mount, and again on demand.
 *
 * A one-shot fetch rather than a Firestore listener, which is a deliberate
 * departure from every other data hook in the app. The rest of FORMA subscribes
 * because it shows *your* data, which is small, changes while you watch it, and
 * is worth the open socket. This shows counts over every athlete's sessions —
 * `count()` aggregations have no listener form at all, and a live view of a
 * number that moves when a stranger finishes a run is not information anybody
 * needs. Pull-to-refresh is the right control here.
 */
export function useAdminOverview(): AdminOverviewState {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

  // Nothing may land after unmount, and — more to the point — a slow first load
  // must not overwrite the fresher result of a refresh the user pulled while
  // waiting for it.
  const mounted = useRef(true)
  const requestId = useRef(0)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  const load = useCallback(async () => {
    const id = ++requestId.current
    try {
      const overview = await fetchAdminOverview()
      if (!mounted.current || id !== requestId.current) return
      setData(overview)
      setError(null)
    } catch (err) {
      if (!mounted.current || id !== requestId.current) return
      // The previous data is deliberately kept. A refresh that fails on a train
      // should show the stale figures with an error beside them, not blank a
      // screen that was working a second ago.
      setError(err instanceof Error ? err : new Error(String(err)))
    } finally {
      if (mounted.current && id === requestId.current) setLoading(false)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  return { data, loading, error, refresh: load }
}
