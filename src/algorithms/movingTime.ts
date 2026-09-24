// Moving time, per-kilometre splits and elevation gain from GPS samples.

import { haversineDistance } from '../utils/geo'
import type { RoutePoint } from '../types/session'

export const STOPPED_SPEED_MS = 0.5

export const STOP_GRACE_MS = 10_000

export const MAX_SAMPLE_GAP_MS = 15_000

export interface MovingTimeState {
  movingMs: number
  stoppedRunMs: number
  lastSampleAt: number
}

export const EMPTY_MOVING_TIME: MovingTimeState = {
  movingMs: 0,
  stoppedRunMs: 0,
  lastSampleAt: 0,
}

export function foldMovingTime(
  state: MovingTimeState,
  sampleAt: number,
  speedMs: number | null,
): MovingTimeState {
  if (!state.lastSampleAt || sampleAt <= state.lastSampleAt) {
    return { ...state, lastSampleAt: sampleAt }
  }

  const dt = Math.min(sampleAt - state.lastSampleAt, MAX_SAMPLE_GAP_MS)
  const moving = speedMs == null || !Number.isFinite(speedMs) || speedMs >= STOPPED_SPEED_MS

  if (moving) {
    return {
      movingMs: state.movingMs + dt,
      stoppedRunMs: 0,
      lastSampleAt: sampleAt,
    }
  }

  const runBefore = state.stoppedRunMs
  const runAfter = runBefore + dt

  if (runAfter <= STOP_GRACE_MS) {
    return {
      movingMs: state.movingMs + dt,
      stoppedRunMs: runAfter,
      lastSampleAt: sampleAt,
    }
  }

  const clawback = runBefore <= STOP_GRACE_MS ? runBefore : 0
  return {
    movingMs: Math.max(0, state.movingMs - clawback),
    stoppedRunMs: runAfter,
    lastSampleAt: sampleAt,
  }
}

export function settleMovingTime(
  state: MovingTimeState,
  elapsedMs: number,
  hasUsableGps: boolean,
): number {
  if (!hasUsableGps || state.movingMs <= 0) return Math.max(0, Math.round(elapsedMs))
  return Math.max(0, Math.min(Math.round(state.movingMs), Math.round(elapsedMs)))
}

export interface Split {
  km: number
  seconds: number
  paceSecPerKm: number
  metres: number
  partial: boolean
}

const METRES_PER_KM = 1000

export function computeSplits(route: RoutePoint[]): Split[] {
  if (!Array.isArray(route) || route.length < 2) return []

  const splits: Split[] = []
  let km = 1
  let distanceIntoKm = 0
  let kmStartedAt = route[0].timestamp

  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]
    const b = route[i]
    const segment = haversineDistance(a.latitude, a.longitude, b.latitude, b.longitude)
    if (!Number.isFinite(segment) || segment <= 0) continue
    const segmentMs = b.timestamp - a.timestamp
    if (!Number.isFinite(segmentMs) || segmentMs < 0) continue

    let remaining = segment
    let segmentStartMs = a.timestamp

    while (distanceIntoKm + remaining >= METRES_PER_KM) {
      const needed = METRES_PER_KM - distanceIntoKm
      const crossedAt = segmentStartMs + (segmentMs * needed) / segment

      const seconds = Math.max(0, (crossedAt - kmStartedAt) / 1000)
      splits.push({
        km,
        seconds,
        paceSecPerKm: seconds,
        metres: METRES_PER_KM,
        partial: false,
      })

      km += 1
      kmStartedAt = crossedAt
      remaining -= needed
      distanceIntoKm = 0
      segmentStartMs = crossedAt
    }

    distanceIntoKm += remaining
  }

  if (distanceIntoKm >= 100) {
    const last = route[route.length - 1]
    const seconds = Math.max(0, (last.timestamp - kmStartedAt) / 1000)
    splits.push({
      km,
      seconds,
      paceSecPerKm: (seconds / distanceIntoKm) * METRES_PER_KM,
      metres: Math.round(distanceIntoKm),
      partial: true,
    })
  }

  return splits
}

const ELEVATION_NOISE_M = 3

export function computeElevationGain(route: RoutePoint[]): number {
  if (!Array.isArray(route) || route.length < 2) return 0

  let gain = 0
  let reference: number | null = null

  for (const point of route) {
    const alt = point.altitude
    if (alt == null || !Number.isFinite(alt)) continue
    if (reference == null) {
      reference = alt
      continue
    }
    const delta = alt - reference
    if (delta >= ELEVATION_NOISE_M) {
      gain += delta
      reference = alt
    } else if (delta <= -ELEVATION_NOISE_M) {
      reference = alt
    }
  }

  return Math.round(gain)
}

export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export function formatSplitPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--'
  const total = Math.round(secPerKm)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
