export type SportType =
  | 'running'
  | 'swimming'
  | 'combat'
  | 'football'
  | 'cycling'
  | 'gym'
  | 'strength'

/** Estimated heart-rate zone persisted on a session (subset of {@link HRZone}). */
export interface SessionHRZone {
  zone: number
  name: string
  /** e.g. "152 - 171 bpm" */
  hrRange: string
}

/** A single GPS sample captured during a live-tracked workout. */
export interface RoutePoint {
  latitude: number
  longitude: number
  timestamp: number
  /**
   * Metres above sea level, when the fix reported one.
   *
   * Optional because plenty of fixes don't carry it and every route saved before
   * this field existed has none. Consumers must treat a missing altitude as
   * "unknown", never as zero — see `computeElevationGain`.
   */
  altitude?: number
}

/** One kilometre of a live-tracked workout, derived from the route at save time. */
export interface SessionSplit {
  /** 1-based kilometre index. */
  km: number
  /** Seconds spent covering it. */
  seconds: number
  /** Seconds per km. Equal to `seconds` for a full km, extrapolated for a partial. */
  paceSecPerKm: number
  /** Metres covered. Below 1000 only for the trailing partial. */
  metres: number
  /** True for the trailing sub-kilometre remainder. */
  partial: boolean
}

/** How a session's data was collected. */
export type TrackingMode = 'quick' | 'live'

/**
 * How much of a live-tracked session the GPS actually covered.
 *
 * Recorded so a session with no distance can be read back correctly later: a
 * 45-minute run saved with `'none'` was tracked indoors, not tracked badly. The
 * training load (duration x RPE) is unaffected either way, which is why a
 * `'none'` session is still a complete session.
 */
export type GpsQuality = 'good' | 'partial' | 'none'

export interface Session {
  id: string
  userId: string
  sport: SportType
  date: string
  durationMinutes: number
  distanceKm?: number
  rpe: number
  loadScore: number
  notes?: string
  createdAt: string
  // Auto-derived estimates, attached at log time from the user's profile +
  // these inputs (see src/algorithms/*). Optional so older sessions still load.
  estimatedCalories?: number
  estimatedHRZone?: SessionHRZone
  /** Pace/speed string for distance sports, e.g. "5:32 / km"; null otherwise. */
  pace?: string | null
  /** Optional manually-entered average heart rate from a wearable. */
  avgBpm?: number
  // --- Live GPS tracking (optional; only set for trackingMode === 'live') ---
  /** How this session was captured. Absent on older sessions → treat as 'quick'. */
  trackingMode?: TrackingMode
  /** GPS breadcrumb trail; used to draw the route map. */
  routeCoordinates?: RoutePoint[]
  /** Auto-computed average pace string, e.g. "5:32 /km" (running/swimming). */
  averagePace?: string
  /** Auto-computed average speed in km/h (cycling). */
  averageSpeed?: number
  /** GPS coverage summary. Absent on sessions logged before it was recorded. */
  gpsQuality?: GpsQuality
  /**
   * Athlete-editable name, e.g. "Morning Run". Absent on older sessions and on
   * quick-logged ones, where the sport label stands in.
   */
  title?: string
  /**
   * Elapsed time minus any established stop, in ms. The denominator for average
   * pace — see `algorithms/movingTime.ts` for why it is not the same as
   * `durationMinutes`, which stays the wall clock and drives training load.
   */
  movingTimeMs?: number
  /** Per-kilometre splits, computed from the route at save time. */
  splits?: SessionSplit[]
  /** Metres climbed, from GPS altitude. 0 when no fix reported one. */
  elevationGain?: number
}
