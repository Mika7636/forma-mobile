// The sport-interaction matrix, said out loud.
//
// The matrix itself is a table of numbers keyed by sport pair, and it is the
// thing FORMA actually knows about an athlete before they have logged anything.
// Onboarding collects the sports; this turns the resulting slice of the matrix
// into sentences — "Running + Combat Sports: high fatigue overlap — avoid hard
// sessions on back-to-back days" — so a user who is ninety seconds old gets
// something specific to *them* rather than a promise about what the app will
// know in a fortnight.
//
// Pure and palette-free on purpose: this is the wording, not the styling. The
// severity a line is painted in comes from `level` at render time, so it goes on
// agreeing with the conflict engine's own thresholds.
import { getInteractionLevel } from '../algorithms/conflictDetector'
import type { SportType } from '../types/session'
import { SPORT_META } from './sportMeta'

/** One pair of the athlete's sports, with the advice its matrix level implies. */
export interface SportPairInsight {
  /** Stable key — the canonical alphabetical pair. */
  key: string
  a: SportType
  b: SportType
  /** 0–3, straight from the user's matrix. */
  level: number
  /** "Running + Combat Sports" */
  title: string
  /** "high fatigue overlap — avoid hard sessions on back-to-back days" */
  detail: string
  /**
   * Whether this pair is one the engine will warn about.
   *
   * Level ≥ 2 is exactly the threshold `detectConflicts` and
   * `detectPlannedConflicts` use, so a pair listed as a clash here is a pair
   * that will genuinely raise a conflict — and one listed as combining well
   * will genuinely stay quiet. Getting this boundary from anywhere other than
   * the detector's own rule would make the onboarding screen a promise the app
   * then breaks.
   */
  clashes: boolean
}

/** Advice text per matrix level, in the same voice the conflict messages use. */
const DETAIL: Record<number, string> = {
  3: 'high fatigue overlap — avoid hard sessions on back-to-back days',
  2: 'moderate overlap — leave an easy day between hard sessions',
  1: 'light overlap — fine back-to-back, just watch the weekly total',
  0: 'no recovery clash — these two combine well',
}

/**
 * Every pair among `sports`, with its advice, worst first.
 *
 * Ordering matters: the clashes are the reason to read the screen, and burying
 * a level-3 pair under three level-0 ones would be filing the headline last.
 * Ties keep the order the sports were picked in, which is the order the athlete
 * already has in their head.
 */
export function sportPairInsights(
  sports: SportType[],
  matrix: Record<string, number>,
): SportPairInsight[] {
  const out: SportPairInsight[] = []
  for (let i = 0; i < sports.length; i++) {
    for (let j = i + 1; j < sports.length; j++) {
      const a = sports[i]
      const b = sports[j]
      const level = getInteractionLevel(a, b, matrix)
      out.push({
        key: [a, b].sort().join('_'),
        a,
        b,
        level,
        title: `${SPORT_META[a]?.label ?? a} + ${SPORT_META[b]?.label ?? b}`,
        detail: DETAIL[level] ?? DETAIL[0],
        clashes: level >= 2,
      })
    }
  }
  // Stable sort: Array.prototype.sort is stable in every JS engine RN ships on,
  // so equal levels keep their insertion (i.e. selection) order.
  return out.sort((x, y) => y.level - x.level)
}
