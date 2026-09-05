// The bridge between the app's live data and the recommendation engine.
//
// The engine in `algorithms/recommender` is pure and knows nothing about
// Firestore, stores or the clock. This is where it is handed the three things it
// asks for — sessions, profile, metrics — and where its answers are memoised so
// a dashboard re-render does not re-derive a week's plan on every frame.
//
// ## Why the 42-day window is the right input, not a compromise
//
// `sessions` comes from the sessions store, which holds the last 42 days. That
// is deliberately *not* the athlete's whole history, and for this consumer it is
// the correct feed: every window the engine reasons over is shorter than that —
// 28 days for the balance component, two weeks for the detraining check, one
// fatigue decay horizon for recovery debt. An athlete whose fourteen training
// days are spread across four months has almost nothing in any of those windows,
// and a plan built from them would be arithmetic rather than advice. The
// engine's own guard reaching the same conclusion is the system agreeing with
// itself, not a bug to route around.
//
// ## Why `now` is captured rather than read continuously
//
// The engine takes the moment as a parameter, so a plan is a pure function of
// one instant. Capturing it in state means the suggestions on screen do not
// silently shift day-boundary while somebody is reading them, and it gives
// `refresh` something real to do — see the note there.
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
  /**
   * The coming week, or `null` while the profile has not loaded.
   *
   * `null` is "we cannot ask yet" and is distinct from the engine's own
   * `insufficient_data`, which is "we asked and the answer is that we don't know
   * this athlete well enough". The card renders a skeleton for the first and a
   * teaching state for the second; collapsing them would show a new user an
   * explanation that was really a loading spinner.
   */
  plan: WeeklyPlan | null
  /** One entry per sport in the profile. Empty until the profile loads. */
  recovery: RecoveryStatus[]
  /** True while sessions or profile are still arriving. */
  loading: boolean
  /** Re-anchor the clock and recompute. */
  refresh: () => void
}

export function useRecommendations(): Recommendations {
  const { sessions, ctl, atl, loading } = useMetrics()
  const profile = useAuthStore((s) => s.profile)

  // The instant the current answers were computed for. Replacing it is what
  // `refresh` does.
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

  /**
   * Recompute against the current clock and the latest sessions.
   *
   * Worth being straight about what this can and cannot change. The engine is
   * deterministic — the same inputs always give the same plan — so this is not a
   * reroll, and tapping it twice in a row will return the identical week. What
   * it does is re-anchor `now`, which genuinely matters: the day offsets, the
   * recovery windows and the "days since" figures are all measured from that
   * instant, and a dashboard left open overnight is otherwise still planning
   * from yesterday. Sessions logged since flow in on their own through the live
   * listener; this picks up the clock, which nothing else does.
   */
  const refresh = useCallback(() => setNow(new Date()), [])

  return { plan, recovery, loading: loading || !profile, refresh }
}
