// Geo maths for live GPS tracking (LiveTracker). Kept dependency-free and pure
// so it's cheap to call on every location update and easy to unit-test.

const EARTH_RADIUS_M = 6_371_000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

/**
 * Is this a real, plottable WGS-84 coordinate?
 *
 * The fused location provider can hand back `null`/`undefined`/`NaN` coordinates
 * (a fix that arrives before the provider has settled, a mocked location, a
 * hardware glitch). Those must never reach state: a NaN latitude poisons every
 * downstream number (distance → pace → calories → the saved session), and
 * handing one to react-native-maps' `Polyline`/`Region` throws inside the Google
 * Maps SDK, which is a **native** crash the JS layer cannot catch.
 *
 * `Number.isFinite` rejects NaN and ±Infinity; the range checks reject the
 * out-of-band sentinels some providers emit.
 */
export function isValidCoordinate(latitude: unknown, longitude: unknown): boolean {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  )
}

/**
 * Great-circle distance between two lat/lon points in **metres**, via the
 * haversine formula. Accurate to well within GPS noise at the short segment
 * distances we sum during a workout.
 *
 * Returns 0 for any invalid input rather than NaN — a single NaN added to the
 * running distance total would make it NaN for the rest of the workout, and
 * NaN survives every later `+`, `toFixed` and `Math.round`.
 */
export function haversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) return 0
  const dLat = toRadians(lat2 - lat1)
  const dLon = toRadians(lon2 - lon1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2
  // Clamp before the sqrt: floating-point error can push `a` a hair above 1 for
  // near-antipodal points, and Math.sqrt(negative) is NaN.
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)))
  const metres = EARTH_RADIUS_M * c
  return Number.isFinite(metres) ? metres : 0
}

/**
 * Reduce a route to at most `max` points, keeping the first and last and taking
 * an even stride through the middle.
 *
 * Used for *drawing*: a long run accumulates thousands of points, and every one
 * of them is re-serialised across the bridge each time the `Polyline` updates.
 * A few hundred points is visually identical at any zoom a phone screen can show.
 */
export function decimateRoute<T>(points: T[], max: number): T[] {
  if (max < 2 || points.length <= max) return points
  const stride = (points.length - 1) / (max - 1)
  const out: T[] = []
  for (let i = 0; i < max - 1; i++) {
    out.push(points[Math.floor(i * stride)])
  }
  out.push(points[points.length - 1])
  return out
}

/**
 * Running/swimming-style pace as time-per-km, e.g. "5:32 /km". Returns "--:-- /km"
 * until there's enough distance to compute a stable pace (avoids wild values in
 * the first few GPS-jittery metres).
 */
export function formatPace(durationSeconds: number, distanceKm: number): string {
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(distanceKm)) return '--:-- /km'
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
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(distanceKm)) return 0
  if (distanceKm <= 0 || durationSeconds <= 0) return 0
  return distanceKm / (durationSeconds / 3600)
}
