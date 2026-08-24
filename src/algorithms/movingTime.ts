/**
 * Moving time, per-kilometre splits, and elevation gain.
 *
 * ## Why moving time exists at all
 *
 * FORMA was reporting average pace as `elapsed / distance`. On a real run —
 * 3:37 elapsed, 3:05 actually moving — that produced **12:52 /km** for a run
 * that was paced at about 8:30 /km. Every second spent stopped at a crossing,
 * retying a lace, or waiting for a gap in traffic was being charged to the
 * athlete's pace, and the error grows with every stop.
 *
 * Strava splits the two figures for exactly this reason, and so do we now:
 * **Time** is the wall clock and is what training load is computed from (sRPE is
 * `duration × RPE`, and standing at a red light is still time spent training);
 * **Moving Time** is the denominator for pace, because pace is a statement about
 * how fast you were going when you were going.
 *
 * ## What counts as stopped
 *
 * A period counts as stopped when speed stays below {@link STOPPED_SPEED_MS} for
 * more than {@link STOP_GRACE_MS} consecutively. The grace window is what stops
 * this from being noise-driven: GPS speed dips below 0.5 m/s constantly — a
 * fix's speed estimate lags a stride, the fused provider reports 0 when it
 * simply doesn't know — and excluding every one of those would eat a minute out
 * of an hour's moving time and swing pace the other way.
 *
 * Note the whole stopped period is excluded, including its first ten seconds:
 * once a stop is established it was a stop from the beginning. {@link foldMovingTime}
 * credits those seconds provisionally and claws them back at the threshold.
 */
import { haversineDistance } from '../utils/geo'
import type { RoutePoint } from '../types/session'

/** At or above this (m/s ≈ 1.8 km/h) the athlete is moving. */
export const STOPPED_SPEED_MS = 0.5

/** A sub-threshold run longer than this is a stop, not a slow moment. */
export const STOP_GRACE_MS = 10_000

/**
 * Ceiling on the time a single fix may contribute.
 *
 * Fixes normally arrive about once a second. A much larger gap means the
 * receiver went quiet — a tunnel, a pocket, an indoor stretch — and we simply do
 * not know whether the athlete was moving through it. Crediting the whole gap
 * would let a five-minute blackout silently become five minutes of "moving",
 * which would then divide into the distance and invent a pace. Capping it
 * under-reports moving time across a blackout, which is the honest direction to
 * be wrong in: it makes pace look slightly slower, never faster.
 */
export const MAX_SAMPLE_GAP_MS = 15_000

/* ------------------------------------------------------------------ */
/* Moving time                                                         */
/* ------------------------------------------------------------------ */

/**
 * The running state. Lives in `liveTrackingStore` so it accumulates against
 * *every* fix, including the stationary ones the route deliberately throws away
 * — the route is a drawing, and a drawing with the standing-still parts removed
 * is exactly the wrong input for measuring how long you stood still.
 */
export interface MovingTimeState {
  /** Milliseconds credited as moving. */
  movingMs: number
  /** Length of the current below-threshold run, in ms. */
  stoppedRunMs: number
  /** Wall-clock ms of the previous sample; 0 when there isn't one. */
  lastSampleAt: number
}

export const EMPTY_MOVING_TIME: MovingTimeState = {
  movingMs: 0,
  stoppedRunMs: 0,
  lastSampleAt: 0,
}

/**
 * Fold one fix into the moving-time accumulator. Pure.
 *
 * @param sampleAt wall-clock ms this fix was received.
 * @param speedMs the athlete's speed at this fix, or null when unknown (in which
 *   case the sample is treated as movement — refusing to guess "stopped" from
 *   missing data is what keeps a provider that never reports speed from
 *   producing a zero moving time and an infinite pace).
 */
export function foldMovingTime(
  state: MovingTimeState,
  sampleAt: number,
  speedMs: number | null,
): MovingTimeState {
  // First sample of the session (or the first after a pause): there is no
  // interval to attribute yet, only an anchor.
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
    // Still inside the grace window. Credit it for now — most sub-threshold
    // moments are noise and never become a stop.
    return {
      movingMs: state.movingMs + dt,
      stoppedRunMs: runAfter,
      lastSampleAt: sampleAt,
    }
  }

  // This sample tips the run over the threshold. Everything provisionally
  // credited to it has to come back out; from here the run adds nothing.
  const clawback = runBefore <= STOP_GRACE_MS ? runBefore : 0
  return {
    movingMs: Math.max(0, state.movingMs - clawback),
    stoppedRunMs: runAfter,
    lastSampleAt: sampleAt,
  }
}

/**
 * Settle the accumulator into a figure fit to persist.
 *
 * Two guards, both learned from what the raw accumulator does at the edges:
 *
 * - **Never above elapsed.** Clock skew or a duplicated fix could otherwise
 *   report more moving time than the session lasted, which is nonsense on its
 *   face and would make pace look faster than it was.
 * - **No GPS at all → moving time *is* elapsed.** An indoor session has no fixes
 *   to accumulate from, so `movingMs` sits at zero. Reporting "0:00 moving" for
 *   a 45-minute treadmill run would be worse than saying nothing; with no
 *   evidence of any stop, the honest answer is that all of it counted.
 */
export function settleMovingTime(
  state: MovingTimeState,
  elapsedMs: number,
  hasUsableGps: boolean,
): number {
  if (!hasUsableGps || state.movingMs <= 0) return Math.max(0, Math.round(elapsedMs))
  return Math.max(0, Math.min(Math.round(state.movingMs), Math.round(elapsedMs)))
}

/* ------------------------------------------------------------------ */
/* Splits                                                              */
/* ------------------------------------------------------------------ */

export interface Split {
  /** 1-based kilometre index. */
  km: number
  /** Seconds spent covering this kilometre. */
  seconds: number
  /** Seconds per km — equal to {@link seconds} for a full km, scaled for a partial. */
  paceSecPerKm: number
  /** Metres actually covered. Less than 1000 only for the trailing partial. */
  metres: number
  /** True for the trailing sub-kilometre remainder. */
  partial: boolean
}

const METRES_PER_KM = 1000

/**
 * Per-kilometre splits, walked out of the route.
 *
 * Derived from the route rather than accumulated live because a split is a
 * property of the finished workout, and the route already carries both halves of
 * what a split is: position and time. The kilometre boundary is *interpolated*
 * inside the segment that crosses it, so a split doesn't inherit the error of
 * wherever a GPS fix happened to land.
 *
 * The total here can sit a little under the session's recorded distance: the
 * route is thinned past 1,000 points, and sub-threshold segments move the
 * distance total without appending a point. Splits are a shape, not an audit —
 * the headline distance remains the store's fix-by-fix accumulation.
 */
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

    // A single segment can cross more than one boundary if the route is coarse,
    // so this is a loop rather than an if.
    while (distanceIntoKm + remaining >= METRES_PER_KM) {
      const needed = METRES_PER_KM - distanceIntoKm
      // Time is apportioned by distance within the segment — the best available
      // assumption, and exact whenever pace was steady across it. `segmentStartMs`
      // has already been advanced past any earlier boundary in this same segment.
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

  // Trailing remainder, only when it is substantial enough to mean anything.
  // A 40 m tail extrapolated to a full kilometre is pure noise on a chart.
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

/* ------------------------------------------------------------------ */
/* Elevation                                                           */
/* ------------------------------------------------------------------ */

/**
 * Ignore altitude changes smaller than this between consecutive points.
 *
 * Consumer GPS altitude is far noisier than its horizontal position — ±10 m is
 * ordinary, and it wanders continuously even on a phone lying still. Summing
 * every positive delta on a flat 10 km run yields hundreds of metres of climb
 * that never happened, so only sustained rises count.
 */
const ELEVATION_NOISE_M = 3

/**
 * Total metres climbed. Returns 0 when no point carries an altitude — which is
 * the honest answer for a device or a fix that didn't report one, and reads the
 * same as a flat run, which is the least misleading way to be uncertain.
 */
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
      // Descending: move the reference down so the next climb is measured from
      // the bottom of the dip rather than from the top of the last rise.
      reference = alt
    }
  }

  return Math.round(gain)
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/** `M:SS` under an hour, `H:MM:SS` over. Used for both time stats. */
export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** `mm:ss` with no unit, for a pace already known to be in seconds per km. */
export function formatSplitPace(secPerKm: number): string {
  if (!Number.isFinite(secPerKm) || secPerKm <= 0) return '--:--'
  const total = Math.round(secPerKm)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
