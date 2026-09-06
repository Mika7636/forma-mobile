// Synthetic GPS routes for the demo account.
//
// The session-detail map is one of the few places FORMA looks like a finished
// consumer app rather than a coursework project, and an empty map frame is worse
// than no map at all — it reads as a feature that is broken rather than as data
// that is absent. So the seeded running sessions carry real breadcrumb trails.
//
// ## What "realistic" has to mean here
//
// Not "a line on a map". The route is consumed by four things that will each
// notice a lazy fake:
//
//   * `computeSplits` divides it into kilometres and reports a pace for each, so
//     the point spacing has to be fine enough that a kilometre boundary lands
//     somewhere sensible, and the timestamps have to advance at a runner's pace
//     rather than at a constant one.
//   * `computeElevationGain` sums the positive altitude deltas, so every fix
//     needs an altitude and the profile has to roll rather than staircase.
//   * The average-pace readout divides distance by *moving* time, so the trail
//     needs a couple of genuine stops in it or moving time equals elapsed time
//     and the two figures on the summary are suspiciously identical.
//   * `frameRoute` fits the camera to the bounding box, so a route that doubles
//     back on itself frames far better than an out-and-back straight line.
//
// Everything below exists to satisfy one of those four.
import { haversineDistance } from '../utils/geo'
import type { RoutePoint } from '../types/session'

/** Metres between consecutive fixes. */
const SAMPLE_SPACING_M = 25

/** Metres per degree of latitude. Close enough everywhere for a park loop. */
const M_PER_DEG_LAT = 111_320

/**
 * Where the demo runs happen.
 *
 * Overridable because a route drawn over the wrong continent is the one detail
 * a curious tester will point at. Hyde Park is the default only because it is
 * unambiguously runnable, is recognisable to most audiences, and sits at a
 * latitude where the metres-per-degree approximation below is comfortable.
 */
export interface RouteCentre {
  latitude: number
  longitude: number
}

export const DEFAULT_ROUTE_CENTRE: RouteCentre = { latitude: 51.5073, longitude: -0.1657 }

export interface GeneratedRoute {
  points: RoutePoint[]
  /** Metres actually covered by the generated trail — never the requested figure. */
  distanceM: number
  /** Elapsed wall-clock span of the trail, ms. */
  elapsedMs: number
  /** Elapsed minus the stops written into it, ms. The pace denominator. */
  movingTimeMs: number
}

/**
 * A deterministic pseudo-random source.
 *
 * Seeded rather than `Math.random` so re-running the seed script produces the
 * identical route for the identical session. That matters more than it sounds:
 * "Reset demo data" between two testers must hand the second tester the same app
 * the first one saw, and a route that reshuffled on every reset would make the
 * session detail screen subtly different every time somebody looked at it.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4_294_967_296
  }
}

/** A stable 32-bit seed from a session id, so each route is its own. */
function hashSeed(key: string): number {
  let h = 2_166_136_261
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i)
    h = Math.imul(h, 16_777_619)
  }
  return h >>> 0
}

/**
 * The loop's shape, in polar form.
 *
 * A circle would draw a route no runner has ever taken. The two harmonics turn
 * it into a lobed, park-shaped circuit that crosses back over its own bounding
 * box, which is what makes the framed map look like a route rather than like a
 * logo. The phase offsets come from the seed so two runs from the same start
 * point are not the same loop rotated.
 */
function radiusAt(theta: number, phaseA: number, phaseB: number): number {
  return 1 + 0.26 * Math.sin(3 * theta + phaseA) + 0.11 * Math.cos(5 * theta + phaseB)
}

/**
 * Build a closed running loop of approximately `distanceKm`, starting at
 * `startedAt` and taking `durationMinutes` of wall clock.
 *
 * The distance is matched by scaling the loop and then, if the target is longer
 * than one lap, running more than one lap — which is exactly what a 14 km run
 * around a park actually is, and it keeps the geometry inside a plausible area
 * instead of drawing a 14 km radius blob across a city.
 */
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

  // One lap is 2.4–3.2 km; the run is however many laps that takes. Fractional
  // laps are fine and are what stops every route ending exactly where it began.
  const lapTargetM = 2400 + rand() * 800
  const laps = Math.max(1, targetM / lapTargetM)
  const totalTheta = laps * Math.PI * 2

  // Walk the parametric curve at unit scale to measure it, then scale so the
  // measured length matches the distance the session claims. Measuring rather
  // than integrating analytically keeps this honest: the number the map draws is
  // the number the summary reports.
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

  // Resample the scaled curve at a fixed arc-length step, so fixes are evenly
  // spaced in *distance* — which is what a GPS receiver on a runner produces,
  // and what makes the per-kilometre splits land where they should.
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

    // Sub-metre jitter: a receiver's trail is never perfectly smooth, and a
    // pixel-perfect curve is the tell that gives a synthetic route away.
    const jitterLat = (rand() - 0.5) * 2.2
    const jitterLng = (rand() - 0.5) * 2.2
    const progress = travelled / targetM
    // A rolling profile with two rises per lap. Amplitude is modest because this
    // is a park, not a fell race — and because `computeElevationGain` sums every
    // positive delta, so an exaggerated profile reports an absurd total.
    const alt = 18 + 9 * Math.sin(progress * laps * Math.PI * 4 + phaseA) + (rand() - 0.5) * 0.8

    coords.push({
      lat: centre.latitude + (unit[i].y * scale + jitterLat) / M_PER_DEG_LAT,
      lng: centre.longitude + (unit[i].x * scale + jitterLng) / mPerDegLng,
      alt,
      distM: travelled,
    })
  }

  // ---- Timestamps ----
  //
  // Two stops, placed at fractions of the way round, because a real run has
  // them (a crossing, a lace) and because moving time is only a distinct figure
  // from elapsed time if something actually stopped. Everything else advances at
  // a pace that drifts a little across the run rather than at a metronome.
  const elapsedMs = Math.round(durationMinutes * 60_000)
  const stops = [
    { at: 0.34 + rand() * 0.08, ms: 25_000 + Math.round(rand() * 35_000) },
    { at: 0.71 + rand() * 0.08, ms: 20_000 + Math.round(rand() * 30_000) },
  ]
  const stoppedMs = stops.reduce((sum, s) => sum + s.ms, 0)
  const movingMs = Math.max(elapsedMs * 0.5, elapsedMs - stoppedMs)

  // Pace drift: slightly quicker in the middle third, which is what a negative
  // split looks like once it reaches the splits table.
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
    // Insert a stop by advancing the clock without advancing position — the
    // trail sits still for a moment, which is precisely what `foldMovingTime`
    // is looking for when it decides a period was stopped.
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

  // Report the distance the trail actually covers, measured the same way the app
  // measures it, rather than the figure that was asked for. They agree to within
  // a few metres; reporting the request would be reporting an intention.
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
