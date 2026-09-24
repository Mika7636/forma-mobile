// Pace or speed string for distance sports.

import type { SportType } from '../types/session'

function formatMinSec(totalSeconds: number): string {
  let minutes = Math.floor(totalSeconds / 60)
  let seconds = Math.round(totalSeconds % 60)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

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
      const secPer100m = (durationMinutes * 60) / (distanceKm * 10)
      return `${formatMinSec(secPer100m)} / 100m`
    }
    default:
      return null
  }
}
