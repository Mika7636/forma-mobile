// Bridges the app's live data into the recommendation engine.

import { useCallback, useMemo, useState } from 'react'
import {
  computeRecoveryStatus,
  computeWeeklyPlan,
  type RecommenderInput,
  type RecoveryStatus,
  type WeeklyPlan,
} from '../algorithms/recommender'
import { useMetrics } from './useMetrics'
import { useAuthStore } from '../store/authStore'

export interface Recommendations {
  plan: WeeklyPlan | null
  recovery: RecoveryStatus[]
  loading: boolean
  refresh: () => void
}

export function useRecommendations(): Recommendations {
  const { sessions, ctl, atl, loading } = useMetrics()
  const profile = useAuthStore((s) => s.profile)

  const [now, setNow] = useState(() => new Date())

  const input = useMemo<RecommenderInput | null>(() => {
    if (!profile) return null
    return {
      sessions,
      profile: {
        sports: profile.sports ?? [],
        sportInteractions: profile.sportInteractions ?? {},
      },
      metrics: { ctl, atl },
      now,
    }
  }, [sessions, profile, ctl, atl, now])

  const plan = useMemo(() => (input ? computeWeeklyPlan(input) : null), [input])
  const recovery = useMemo(() => (input ? computeRecoveryStatus(input) : []), [input])

  const refresh = useCallback(() => setNow(new Date()), [])

  return { plan, recovery, loading: loading || !profile, refresh }
}
