// Loads the Admin screen's aggregates on mount, and on demand.

import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchAdminOverview, type AdminOverview } from '../services/adminService'

interface AdminOverviewState {
  data: AdminOverview | null
  loading: boolean
  error: Error | null
  refresh: () => Promise<void>
}

export function useAdminOverview(): AdminOverviewState {
  const [data, setData] = useState<AdminOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<Error | null>(null)

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
