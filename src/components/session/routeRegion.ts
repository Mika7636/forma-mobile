// How the summary map decides where to point its camera.
//
// Split out of the map view because the decision is pure arithmetic on a list of
// coordinates, it has three genuinely different outcomes, and getting it wrong
// is not subtle: the failure mode is a map of the entire planet where a workout
// should be.
import type { LatLng } from 'react-native-maps'

export interface MapRegion {
  latitude: number
  longitude: number
  latitudeDelta: number
  longitudeDelta: number
}

/**
 * Below this much extent (in degrees, ~22 m) a route is not a shape — it is a
 * stationary athlete and a minute of GPS jitter.
 *
 * Framing that tightly is what `fitToCoordinates` will faithfully do if asked:
 * a 6 m bounding box becomes a 6 m viewport, i.e. maximum zoom on a grey square
 * with two overlapping dots in the middle. The fixed region below is the honest
 * picture of "you were here and you did not really move".
 */
const SPAN_EPSILON = 2e-4

/**
 * The fixed fallback span, ~300 m across. Wide enough to place the athlete on a
 * recognisable street, tight enough that the pin means something.
 */
export const FALLBACK_DELTA = 0.003

/**
 * Hard ceiling on how much world this screen may ever show, ~55 km.
 *
 * The bug being fixed here rendered a whole hemisphere, and it did so because
 * nothing said it couldn't. Even a genuinely enormous ride is better clipped
 * than shown as a continent, and any span above this is far likelier to be a
 * corrupt coordinate — a stray (0, 0) fix will produce one — than a real ride.
 */
export const MAX_DELTA = 0.5

/**
 * {@link MAX_DELTA} expressed as a Google Maps zoom level, because that is the
 * only form of this clamp Android actually honours.
 *
 * At zoom `z` the whole world spans `256 * 2^z` points, so a viewport `w` points
 * wide shows `360 * w / (256 * 2^z)` degrees of longitude. For a ~400pt phone
 * frame, half a degree lands at `z ≈ 10.1`; 10 gives a viewport a shade wider
 * than the clamp, which is the right way to round — it constrains the pathological
 * case without cropping a legitimately long ride any harder than asked.
 */
export const MIN_ZOOM_LEVEL = 10

/** 25% breathing room so the polyline never runs into the frame edge. */
const PADDING_FACTOR = 1.25

export type RouteFraming =
  /** Nothing to draw. The caller should render the indoor panel, not a map. */
  | { kind: 'none' }
  /**
   * One point, or a cluster too small to frame. Point the camera at it with the
   * fixed {@link FALLBACK_DELTA} span.
   */
  | { kind: 'point'; region: MapRegion }
  /**
   * A real shape. `region` is a safe starting frame (used as `initialRegion` so
   * the map is never wrong even for one frame) and `fit` says the caller should
   * follow up with `fitToCoordinates` for the exact framing.
   */
  | { kind: 'route'; region: MapRegion; fit: true }

function clampDelta(delta: number): number {
  if (!Number.isFinite(delta) || delta <= 0) return FALLBACK_DELTA
  return Math.min(Math.max(delta, FALLBACK_DELTA), MAX_DELTA)
}

/**
 * Work out how to frame a route.
 *
 * Always returns a region for the two drawable cases, and that region is what
 * gets handed to `initialRegion`. That matters more than it looks: a camera
 * *command* (`fitToCoordinates`, `animateToRegion`) is a message to a native
 * view that may not exist yet, may have zero size, and on Android is silently
 * dropped in both cases — which is exactly how the default world region ended
 * up on screen. `initialRegion` is applied when the native map is constructed
 * and cannot be missed, so the worst case degrades to "roughly the right place"
 * instead of "the Atlantic".
 */
export function frameRoute(points: LatLng[]): RouteFraming {
  if (points.length === 0) return { kind: 'none' }

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity
  let usable = 0

  for (const p of points) {
    // Non-finite coordinates are skipped explicitly rather than compared away.
    // Every comparison against NaN is false, so a bad point would otherwise slip
    // through the bounds silently and still be counted in `points.length` —
    // making a one-real-point route look like a two-point one and sending it
    // down the `fitToCoordinates` path with a NaN in the array.
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
