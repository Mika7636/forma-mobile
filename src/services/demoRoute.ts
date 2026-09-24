// Synthetic GPS routes for the demo account.

import { haversineDistance } from '../utils/geo'
import type { RoutePoint } from '../types/session'

const SAMPLE_SPACING_M = 25

const M_PER_DEG_LAT = 111_320

export interface RouteCentre {
  latitude: number
  longitude: number
}

export const DEFAULT_ROUTE_CENTRE: RouteCentre = { latitude: 51.5073, longitude: -0.1657 }

export interface GeneratedRoute {
  points: RoutePoint[]
  distanceM: number
  elapsedMs: number
  movingTimeMs: number
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

function hashSeed(key: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  return h >>> 0
}

function radiusAt(theta: number, phaseA: number, phaseB: number): number {
  return 1 + 0.26 * Math.sin(3 * theta + phaseA) + 0.11 * Math.cos(5 * theta + phaseB)
}

export function generateRoute(
  seedKey: string,
  centre: RouteCentre,
  distanceKm: number,
  durationMinutes: number,
  startedAt: Date,
): GeneratedRoute {
  const rand = mulberry32(hashSeed(seedKey))
  const phaseA = rand() * Math.PI * 2
  const phaseB = rand() * Math.PI * 2

  const targetM = Math.max(500, distanceKm * 1000)

  const lapTargetM = 2400 + rand() * 800
  const laps = Math.max(1, targetM / lapTargetM)
  const totalTheta = laps * Math.PI * 2

  const STEPS = Math.max(720, Math.ceil(totalTheta * 240))
  const unit: Array<{ x: number; y: number }> = []
  for (let i = 0; i <= STEPS; i++) {
    const theta = (i / STEPS) * totalTheta
    const r = radiusAt(theta, phaseA, phaseB)
    unit.push({ x: r * Math.cos(theta), y: r * Math.sin(theta) })
  }
  let unitLength = 0
  for (let i = 1; i < unit.length; i++) {
    unitLength += Math.hypot(unit[i].x - unit[i - 1].x, unit[i].y - unit[i - 1].y)
  }
  const scale = targetM / unitLength

  const cosLat = Math.cos((centre.latitude * Math.PI) / 180)
  const mPerDegLng = M_PER_DEG_LAT * (Math.abs(cosLat) < 0.05 ? 0.05 : cosLat)

  const coords: Array<{ lat: number; lng: number; alt: number; distM: number }> = []
  let carried = 0
  let travelled = 0
  for (let i = 0; i < unit.length; i++) {
    if (i > 0) {
      const stepM = Math.hypot(unit[i].x - unit[i - 1].x, unit[i].y - unit[i - 1].y) * scale
      carried += stepM
      travelled += stepM
    }
    if (i !== 0 && carried < SAMPLE_SPACING_M && i !== unit.length - 1) continue
    carried = 0

    const jitterLat = (rand() - 0.5) * 2.2
    const jitterLng = (rand() - 0.5) * 2.2
    const progress = travelled / targetM
    const alt = 18 + 9 * Math.sin(progress * laps * Math.PI * 4 + phaseA) + (rand() - 0.5) * 0.8

    coords.push({
      lat: centre.latitude + (unit[i].y * scale + jitterLat) / M_PER_DEG_LAT,
      lng: centre.longitude + (unit[i].x * scale + jitterLng) / mPerDegLng,
      alt,
      distM: travelled,
    })
  }

  const elapsedMs = Math.round(durationMinutes * 60_000)
  const stops = [
    { at: 0.34 + rand() * 0.08, ms: 25_000 + Math.round(rand() * 35_000) },
    { at: 0.71 + rand() * 0.08, ms: 20_000 + Math.round(rand() * 30_000) },
  ]
  const stoppedMs = stops.reduce((sum, s) => sum + s.ms, 0)
  const movingMs = Math.max(elapsedMs * 0.5, elapsedMs - stoppedMs)

  const paceFactor = (progress: number) => 1.06 - 0.12 * Math.sin(progress * Math.PI)
  let weighted = 0
  const weights: number[] = []
  for (let i = 1; i < coords.length; i++) {
    const segM = coords[i].distM - coords[i - 1].distM
    const w = segM * paceFactor(coords[i].distM / targetM)
    weights.push(w)
    weighted += w
  }

  const startMs = startedAt.getTime()
  const points: RoutePoint[] = []
  let t = startMs
  points.push({
    latitude: coords[0].lat,
    longitude: coords[0].lng,
    timestamp: t,
    altitude: Math.round(coords[0].alt * 10) / 10,
  })
  for (let i = 1; i < coords.length; i++) {
    t += (weights[i - 1] / weighted) * movingMs
    const progress = coords[i].distM / targetM
    const prevProgress = coords[i - 1].distM / targetM
    for (const stop of stops) {
      if (prevProgress < stop.at && progress >= stop.at) t += stop.ms
    }
    points.push({
      latitude: coords[i].lat,
      longitude: coords[i].lng,
      timestamp: Math.round(t),
      altitude: Math.round(coords[i].alt * 10) / 10,
    })
  }

  let distanceM = 0
  for (let i = 1; i < points.length; i++) {
    distanceM += haversineDistance(
      points[i - 1].latitude,
      points[i - 1].longitude,
      points[i].latitude,
      points[i].longitude,
    )
  }

  return {
    points,
    distanceM,
    elapsedMs: points[points.length - 1].timestamp - startMs,
    movingTimeMs: Math.round(movingMs),
  }
}
