// The sport-interaction matrix, said out loud.

import { getInteractionLevel } from '../algorithms/conflictDetector'
import type { SportType } from '../types/session'
import { SPORT_META } from './sportMeta'

export interface SportPairInsight {
  key: string
  a: SportType
  b: SportType
  level: number
  title: string
  detail: string
  clashes: boolean
}

const DETAIL: Record<number, string> = {
  3: 'high fatigue overlap — avoid hard sessions on back-to-back days',
  2: 'moderate overlap — leave an easy day between hard sessions',
  1: 'light overlap — fine back-to-back, just watch the weekly total',
  0: 'no recovery clash — these two combine well',
}

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
  return out.sort((x, y) => y.level - x.level)
}
