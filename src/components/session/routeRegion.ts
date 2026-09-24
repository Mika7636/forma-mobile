// How the summary map decides where to point its camera.

import type { LatLng } from 'react-native-maps'

export interface MapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

const SPAN_EPSILON = 2e-4

export const FALLBACK_DELTA = 0.003

export const MAX_DELTA = 0.5

export const MIN_ZOOM_LEVEL = 10

const PADDING_FACTOR = 1.25

export type RouteFraming =
  | { kind: 'none' }
  | { kind: 'point'; region: MapRegion }
  | { kind: 'route'; region: MapRegion; fit: true }

function clampDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return FALLBACK_DELTA
  return Math.min(Math.max(delta, FALLBACK_DELTA), MAX_DELTA)
}

export function frameRoute(points: LatLng[]): RouteFraming {
  if (points.length === 0) return { kind: 'none' }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  let usable = 0

  for (const p of points) {
    if (!Number.isFinite(p.latitude) || !Number.isFinite(p.longitude)) continue
    usable += 1
    if (p.latitude < minLat) minLat = p.latitude
    if (p.latitude > maxLat) maxLat = p.latitude
    if (p.longitude < minLng) minLng = p.longitude
    if (p.longitude > maxLng) maxLng = p.longitude
  }

  if (usable === 0) return { kind: 'none' }

  const centre = {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
  }

  const latSpan = maxLat - minLat
  const lngSpan = maxLng - minLng

  if (usable < 2 || Math.max(latSpan, lngSpan) < SPAN_EPSILON) {
    return {
      kind: 'point',
      region: {
        ...centre,
        latitudeDelta: FALLBACK_DELTA,
        longitudeDelta: FALLBACK_DELTA,
      },
    }
  }

  return {
    kind: 'route',
    region: {
      ...centre,
      latitudeDelta: clampDelta(latSpan * PADDING_FACTOR),
      longitudeDelta: clampDelta(lngSpan * PADDING_FACTOR),
    },
    fit: true,
  }
}
