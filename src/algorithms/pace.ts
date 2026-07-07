import type { SportType } from '../types/session'

/** Format a number of seconds as "m:ss" (e.g. 332 → "5:32"). */
function formatMinSec(totalSeconds: number): string {
  let minutes = Math.floor(totalSeconds / 60)
  let seconds = Math.round(totalSeconds % 60)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

/**
 * Pace / speed for distance sports, derived from duration + distance.
 *
 * - running:  time per km   → "5:32 / km"
 * - cycling:  average speed → "28.4 km/h"
 * - swimming: time per 100m → "1:48 / 100m"
 *
 * Returns null for any non-distance sport, or when distance/duration are
 * missing or non-positive.
 */
export function calculatePace(
  sport: SportType,
  durationMinutes: number,
  distanceKm?: number,
): string | null {
  if (distanceKm == null || distanceKm <= 0 || durationMinutes <= 0) return null

  switch (sport) {
    case 'running': {
      const secPerKm = (durationMinutes * 60) / distanceKm
      return `${formatMinSec(secPerKm)} / km`
    }
    case 'cycling': {
      const kmh = distanceKm / (durationMinutes / 60)
      return `${kmh.toFixed(1)} km/h`
    }
    case 'swimming': {
      // distanceKm × 10 = number of 100m segments (1 km = 10 × 100m).
      const secPer100m = (durationMinutes * 60) / (distanceKm * 10)
      return `${formatMinSec(secPer100m)} / 100m`
    }
    default:
      return null
  }
}
