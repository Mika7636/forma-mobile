// Geo maths for live GPS tracking (LiveTracker). Kept dependency-free and pure
// so it's cheap to call on every location update and easy to unit-test.

const EARTH_RADIUS_M = 6_371_000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Great-circle distance between two lat/lon points in **metres**, via the
 * haversine formula. Accurate to well within GPS noise at the short segment
 * distances we sum during a workout.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
  return EARTH_RADIUS_M * c
}

/**
 * Running/swimming-style pace as time-per-km, e.g. "5:32 /km". Returns "--:-- /km"
 * until there's enough distance to compute a stable pace (avoids wild values in
 * the first few GPS-jittery metres).
 */
export function formatPace(durationSeconds: number, distanceKm: number): string {
  if (distanceKm <= 0.01 || durationSeconds <= 0) return '--:-- /km'
  const secPerKm = durationSeconds / distanceKm
  let minutes = Math.floor(secPerKm / 60)
  let seconds = Math.round(secPerKm % 60)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`
}

/** Average speed in km/h (for cycling). Returns 0 with no distance/time. */
export function calculateSpeed(durationSeconds: number, distanceKm: number): number {
  if (distanceKm <= 0 || durationSeconds <= 0) return 0
  return distanceKm / (durationSeconds / 3600)
}
