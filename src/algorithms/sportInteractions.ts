// The knowledge base: what FORMA knows about how two sports interfere.
//
// This is the expert system's fact layer, and nothing more. It holds no policy
// about what to *do* with a level — that belongs to the inference engines that
// read it: `conflictDetector` turns levels into warnings about training already
// logged, and `recommender` turns them into recovery windows and scheduling
// constraints for training not yet done. Both read the same numbers, so the app
// cannot warn about a pairing it would also recommend.
//
// It lives in its own module rather than inside `conflictDetector` — where these
// two functions used to sit — because a knowledge base reached only through one
// of its consumers is a knowledge base with an accidental owner. The detector
// re-exports {@link getInteractionLevel} so existing callers are unaffected.
// Nothing here imports anything at runtime except the matrix itself, which keeps
// it (and everything built on it) loadable in a plain Node test process.
import type { SportInteractions } from '../types/user'

/**
 * Build the canonical matrix key for a sport pair. Keys are stored
 * alphabetically sorted ("combat_running", never "running_combat") so the
 * lookup is order-independent.
 */
export function pairKey(sportA: string, sportB: string): string {
  return [sportA, sportB].sort().join('_')
}

/**
 * Conflict weight (0–3) for a pair of sports from the user's interaction
 * matrix. 0 means the same sport or no recorded interference.
 */
export function getInteractionLevel(
  sportA: string,
  sportB: string,
  matrix: SportInteractions,
): number {
  if (sportA === sportB) return 0
  return matrix[pairKey(sportA, sportB)] ?? 0
}

/** The matrix's top level, and therefore the divisor that normalises it. */
export const MAX_INTERACTION_LEVEL = 3

/**
 * How much fatigue from a session in `priorSport` lands on `sport`, as 0–1.
 *
 * This is {@link getInteractionLevel} normalised, with one deliberate
 * difference: **a sport overlaps itself completely**, so the same-sport case is
 * 1 rather than the 0 the matrix reports.
 *
 * That is not a value invented to fill a gap in the matrix. The matrix answers
 * "do these two interfere with each other", and a sport does not *interfere*
 * with itself — repeating it is just training it, which is why the conflict
 * engine deliberately scores the same-sport pair 0 and leaves back-to-back hard
 * sessions to its separate nervous-system check. But the question a recovery
 * window asks is a different one: "how much of this session's fatigue is still
 * sitting on the muscles I am about to use again?" — and for the same sport the
 * honest answer is all of it. Reading 0 there would have the recommender declare
 * running fresh the morning after a maximal run, which is the worst advice in
 * the file.
 */
export function overlapWeight(sport: string, priorSport: string, matrix: SportInteractions): number {
  if (sport === priorSport) return 1
  return getInteractionLevel(sport, priorSport, matrix) / MAX_INTERACTION_LEVEL
}
