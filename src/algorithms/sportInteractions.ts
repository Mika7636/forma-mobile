// Knowledge base of how strongly two sports interfere.

import type { SportInteractions } from '../types/user'

export function pairKey(sportA: string, sportB: string): string {
  return [sportA, sportB].sort().join('_')
}

export function getInteractionLevel(
  sportA: string,
  sportB: string,
  matrix: SportInteractions,
): number {
  if (sportA === sportB) return 0
  return matrix[pairKey(sportA, sportB)] ?? 0
}

export const MAX_INTERACTION_LEVEL = 3

export function overlapWeight(sport: string, priorSport: string, matrix: SportInteractions): number {
  if (sport === priorSport) return 1
  return getInteractionLevel(sport, priorSport, matrix) / MAX_INTERACTION_LEVEL
}
