// Pure geo maths for live GPS tracking.

const EARTH_RADIUS_M = 6_371_000

function toRadians(deg: number): number {
  return (deg * Math.PI) / 180
}

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
  const c = 2 * Math.atan2(Math.sqrt(Math.max(0, a)), Math.sqrt(Math.max(0, 1 - a)))
  const metres = EARTH_RADIUS_M * c
  return Number.isFinite(metres) ? metres : 0
}

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

export function formatPaceValue(secPerKm: number | null | undefined): string {
  if (secPerKm == null || !Number.isFinite(secPerKm) || secPerKm <= 0) return '--:-- /km'
  let minutes = Math.floor(secPerKm / 60)
  let seconds = Math.round(secPerKm % 60)
  if (seconds === 60) {
    minutes += 1
    seconds = 0
  }
  return `${minutes}:${String(seconds).padStart(2, '0')} /km`
}

export function formatPace(durationSeconds: number, distanceKm: number): string {
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(distanceKm)) return '--:-- /km'
  if (distanceKm <= 0.01 || durationSeconds <= 0) return '--:-- /km'
  return formatPaceValue(durationSeconds / distanceKm)
}

export function calculateSpeed(durationSeconds: number, distanceKm: number): number {
  if (!Number.isFinite(durationSeconds) || !Number.isFinite(distanceKm)) return 0
  if (distanceKm <= 0 || durationSeconds <= 0) return 0
  return distanceKm / (durationSeconds / 3600)
}

export interface PaceSample {
  t: number
  m: number
}

export interface RollingPaceOptions {
  windowMs: number
  minDistanceM: number
  staleMs: number
  maxSecPerKm: number
}

export function trimPaceSamples(
  samples: PaceSample[],
  now: number,
  windowMs: number,
): PaceSample[] {
  const cutoff = now - windowMs
  let anchor = 0
  for (let i = 0; i < samples.length; i++) {
    if (samples[i].t <= cutoff) anchor = i
    else break
  }
  return anchor === 0 ? samples : samples.slice(anchor)
}

export function rollingPaceSecPerKm(
  samples: PaceSample[],
  now: number,
  { windowMs, minDistanceM, staleMs, maxSecPerKm }: RollingPaceOptions,
): number | null {
  if (samples.length < 2) return null
  const last = samples[samples.length - 1]
  if (now - last.t > staleMs) return null

  const trimmed = trimPaceSamples(samples, now, windowMs)
  const anchor = trimmed[0]
  const metres = last.m - anchor.m
  const seconds = (last.t - anchor.t) / 1000
  if (!Number.isFinite(metres) || !Number.isFinite(seconds)) return null
  if (metres < minDistanceM || seconds <= 0) return null

  const secPerKm = seconds / (metres / 1000)
  if (!Number.isFinite(secPerKm) || secPerKm <= 0 || secPerKm > maxSecPerKm) return null
  return secPerKm
}
