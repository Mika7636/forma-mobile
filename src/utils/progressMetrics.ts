// Progress analytics engine. Derives every dataset the Progress screen renders —
// the bucketed training-load series and its sustainable band, the per-sport
// breakdown, the consistency heatmap, summary stats, and the daily
// Fitness/Fatigue/Form series behind the Advanced section — from a raw session
// list. Pure and deterministic; call it inside a `useMemo`.
//
// ## What changed, and what deliberately did not
//
// The screen used to be built around a 4/8/12-week window and a three-line
// CTL/ATL/Form chart. It now buckets by day/week/month and leads with load
// against a band. **The CTL/ATL/Form maths below is untouched** — same windows,
// same cold-start blend, same per-day series. Conflict detection reads the same
// model, so changing it here would change what the coach warns about; this file
// only changed how the numbers are grouped and described.
import type { Session, SportType } from '../types/session'
import { SPORT_META } from './sportMeta'
import { addDays, startOfWeek, localISODate, daysBetween } from './dates'

/** CTL (Fitness) is a 42-day rolling average of daily load; ATL (Fatigue) 7-day. */
const CTL_WINDOW = 42
const ATL_WINDOW = 7

/**
 * Window over which a new user's seeded baseline fades to pure data. Mirrors the
 * CTL_BLEND_DAYS / ATL_BLEND_DAYS constants in {@link ../algorithms/ctlAtl} so
 * the per-day series and the dashboard's single value calibrate identically.
 */
const BLEND_DAYS = 21

/* ------------------------------------------------------------------ */
/* Granularity                                                         */
/* ------------------------------------------------------------------ */

/**
 * How the load chart buckets time.
 *
 * These replaced a 4/8/12-week selector. The old options asked the athlete to
 * pick a window length, which is a question about the chart rather than about
 * their training; these ask what *grain* they want to look at, and the window
 * follows from it.
 */
export type Granularity = 'daily' | 'weekly' | 'monthly'

/** Buckets shown per granularity: a fortnight, a quarter, a year. */
export const BUCKET_COUNT: Record<Granularity, number> = {
  daily: 14,
  weekly: 12,
  monthly: 12,
}

/**
 * Nominal days in one bucket, used only to scale the sustainable band.
 *
 * A month is 30.44 days on average, so February's bar is measured against a
 * band about 8% too generous and a 31-day month's about 2% too tight. Both are
 * far inside the noise of the band's own 0.8–1.3 width, and a band that stepped
 * up and down with month length would read as a data series rather than as the
 * fixed reference it is meant to be.
 */
const BUCKET_DAYS: Record<Granularity, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30.44,
}

/**
 * The sustainable band, as multiples of the load the athlete's current fitness
 * implies for a bucket.
 *
 * CTL *is* an average daily load, so "what this athlete currently absorbs" for a
 * bucket is CTL × the bucket's days. Below ~0.8× of that, fitness drifts down;
 * above ~1.3×, the ramp is faster than adaptation and is where the injury
 * literature starts to get nervous. Deliberately wide: this is a coaching hint,
 * not a target, and a narrow band would have athletes chasing the middle of it.
 */
const BAND_LOW = 0.8
const BAND_HIGH = 1.3

/** Baseline seeds and account age used to blend the cold-start CTL/ATL series. */
export interface ProgressBaseline {
  /** Onboarding fitness seed (User.baselineCTL). */
  baselineCTL?: number
  /** ISO registration timestamp (User.createdAt), for the blend's day counter. */
  createdAt?: string
}

/** One day of the Fitness/Fatigue/Form series (also feeds the heatmap). */
export interface DailyPoint {
  dateISO: string
  /** Short label for tooltips, e.g. "Mon, Jun 23". */
  fullDate: string
  load: number
  sessions: number
  ctl: number
  atl: number
  form: number
}

/** Where a bucket's load sits relative to the sustainable band. */
export type BucketStanding = 'above' | 'inside' | 'below'

/** One bar of the training-load chart: a day, a week, or a month. */
export interface LoadBucket {
  /** Stable React key / identity. */
  key: string
  startISO: string
  /** Axis tick, e.g. "23" (daily), "Jun 23" (weekly), "Aug" (monthly). */
  tick: string
  /** Tooltip heading, e.g. "Mon, Jun 23", "Jun 23 – 29", "August 2026". */
  label: string
  load: number
  sessions: number
  calories: number
  /**
   * `null` while the bucket is still running.
   *
   * A week that is two days old has not "gone below the range" — it simply has
   * not happened yet. Classifying it would paint the current bar grey every
   * Monday and drag the headline verdict down with it, so an unfinished bucket
   * is drawn but not judged, and is excluded from the verdict entirely.
   */
  standing: BucketStanding | null
  /** True while this bucket still has days left to run. */
  partial: boolean
}

/** The load range the athlete's current fitness implies for one bucket. */
export interface LoadBand {
  low: number
  high: number
  /** The CTL the band was derived from — the last day of the series. */
  ctl: number
}

export type VerdictTone = BucketStanding | 'unknown'

/** The plain-English read on the period, shown above the chart. */
export interface LoadVerdict {
  tone: VerdictTone
  /** e.g. "You're building safely". */
  headline: string
  /** One line of explanation underneath. */
  detail: string
}

/**
 * Aggregated load for a single sport over the range.
 *
 * Carries no colour: this is a pure data module with no palette in scope, and a
 * hue baked in here would be frozen at whichever theme was active when the
 * metrics were computed. The chart resolves it with `sportVisual(sport, colors)`
 * at render time instead.
 */
export interface SportPoint {
  sport: SportType
  label: string
  icon: string
  load: number
  sessions: number
  calories: number
  /** Percentage of the range's total load, 0–100, rounded. */
  share: number
}

export interface HeatmapDay {
  dateISO: string
  fullDate: string
  load: number
  sessions: number
  /** 0 = no training, 1 (light) → 3 (hardest) per the heatmap's fixed AU bands. */
  level: 0 | 1 | 2 | 3
}

/** A column in the consistency heatmap: 7 cells, Monday→Sunday. */
export interface HeatmapWeek {
  weekStartISO: string
  days: (HeatmapDay | null)[]
}

export interface ProgressStatsData {
  totalSessions: number
  totalLoad: number
  totalCalories: number
  avgForm: number
  topSport: SportPoint | null
  currentCTL: number
  /** Change in CTL (Fitness) from the first to the last day of the range. */
  ctlTrend: number
}

export interface ProgressData {
  granularity: Granularity
  rangeStart: Date
  rangeEnd: Date
  daily: DailyPoint[]
  buckets: LoadBucket[]
  /** `null` when there is no fitness estimate yet to derive a range from. */
  band: LoadBand | null
  verdict: LoadVerdict
  sports: SportPoint[]
  heatmap: HeatmapWeek[]
  stats: ProgressStatsData
}

/** Fixed AU thresholds for the heatmap's four intensity bands (see spec). */
const HEAT_LIGHT = 200
const HEAT_HARD = 400

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function tooltipDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function heatLevel(load: number): HeatmapDay['level'] {
  if (load <= 0) return 0
  if (load < HEAT_LIGHT) return 1
  if (load <= HEAT_HARD) return 2
  return 3
}

/**
 * Blend a raw rolling average toward a seeded baseline for the cold-start window,
 * using the exact formula the CTL/ATL algorithms use: Day 0 = 100% baseline,
 * ~Day 10 = ~50/50, Day 21+ = pure data. With no seed/age it returns the rounded
 * raw value, so established users are unaffected.
 */
function blendBaseline(
  calculated: number,
  baseline: number | undefined,
  daysSinceRegistration: number | undefined,
): number {
  if (baseline == null || daysSinceRegistration == null) return Math.round(calculated)
  const dataWeight = Math.min(daysSinceRegistration / BLEND_DAYS, 1)
  return Math.round(baseline * (1 - dataWeight) + calculated * dataWeight)
}

/* ------------------------------------------------------------------ */
/* Bucketing                                                           */
/* ------------------------------------------------------------------ */

interface BucketEdge {
  start: Date
  endExclusive: Date
}

/** First day shown and last day shown, for the selected granularity. */
function rangeFor(granularity: Granularity, today: Date): { start: Date; end: Date } {
  if (granularity === 'daily') {
    return { start: addDays(today, -(BUCKET_COUNT.daily - 1)), end: today }
  }
  if (granularity === 'weekly') {
    const currentWeekStart = startOfWeek(today)
    return {
      start: addDays(currentWeekStart, -(BUCKET_COUNT.weekly - 1) * 7),
      end: addDays(currentWeekStart, 6),
    }
  }
  // Whole calendar months, ending with the one in progress. Day 0 of the next
  // month is JavaScript's idiom for "last day of this month".
  const start = new Date(today.getFullYear(), today.getMonth() - (BUCKET_COUNT.monthly - 1), 1)
  const end = new Date(today.getFullYear(), today.getMonth() + 1, 0)
  end.setHours(0, 0, 0, 0)
  return { start, end }
}

function edgesFor(granularity: Granularity, rangeStart: Date): BucketEdge[] {
  const count = BUCKET_COUNT[granularity]
  const edges: BucketEdge[] = []
  for (let i = 0; i < count; i++) {
    if (granularity === 'daily') {
      const start = addDays(rangeStart, i)
      edges.push({ start, endExclusive: addDays(start, 1) })
    } else if (granularity === 'weekly') {
      const start = addDays(rangeStart, i * 7)
      edges.push({ start, endExclusive: addDays(start, 7) })
    } else {
      edges.push({
        start: new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i, 1),
        endExclusive: new Date(rangeStart.getFullYear(), rangeStart.getMonth() + i + 1, 1),
      })
    }
  }
  return edges
}

/**
 * Which bucket a date falls in, or -1 if it is outside the range.
 *
 * Index arithmetic rather than a scan over the edges: this runs once per
 * session, and a year of training is a lot of sessions to walk twelve buckets
 * for.
 */
function bucketIndexOf(granularity: Granularity, rangeStart: Date, date: Date): number {
  const count = BUCKET_COUNT[granularity]
  let index: number
  if (granularity === 'monthly') {
    index =
      (date.getFullYear() - rangeStart.getFullYear()) * 12 +
      (date.getMonth() - rangeStart.getMonth())
  } else {
    const day = new Date(date)
    day.setHours(0, 0, 0, 0)
    const offset = daysBetween(rangeStart, day)
    index = granularity === 'daily' ? offset : Math.floor(offset / 7)
  }
  return index >= 0 && index < count ? index : -1
}

function labelsFor(granularity: Granularity, edge: BucketEdge): { tick: string; label: string } {
  if (granularity === 'daily') {
    return { tick: String(edge.start.getDate()), label: tooltipDate(edge.start) }
  }
  if (granularity === 'weekly') {
    const last = addDays(edge.endExclusive, -1)
    return {
      tick: shortDate(edge.start),
      label: `${shortDate(edge.start)} – ${last.toLocaleDateString(undefined, { day: 'numeric' })}`,
    }
  }
  return {
    tick: edge.start.toLocaleDateString(undefined, { month: 'short' }),
    label: edge.start.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
  }
}

function classify(load: number, band: LoadBand | null): BucketStanding | null {
  if (!band) return null
  if (load > band.high) return 'above'
  if (load < band.low) return 'below'
  return 'inside'
}

/** The plain-English read on the period as a whole. */
function verdictFor(buckets: LoadBucket[], band: LoadBand | null): LoadVerdict {
  // Only finished buckets. Averaging in a week that is one day old would say
  // "easing off" every Tuesday.
  const complete = buckets.filter((b) => !b.partial)
  if (!band || complete.length === 0) {
    return {
      tone: 'unknown',
      headline: 'Still learning your range',
      detail: 'Log a few more sessions and FORMA can tell you how this period compares.',
    }
  }

  const mean = complete.reduce((sum, b) => sum + b.load, 0) / complete.length
  const tone = classify(mean, band) ?? 'inside'

  if (tone === 'above') {
    return {
      tone,
      headline: "You're ramping up fast",
      detail: 'Recent training is heavier than your current fitness comfortably absorbs — watch for lingering fatigue.',
    }
  }
  if (tone === 'below') {
    return {
      tone,
      headline: "You're easing off",
      detail: 'Recent training is lighter than your current fitness supports. Fine for recovery, but fitness drifts down if it lasts.',
    }
  }
  return {
    tone,
    headline: "You're building safely",
    detail: 'Recent training sits inside the range your current fitness can absorb — this is where progress comes from.',
  }
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/**
 * Derives every dataset the Progress screen renders for the selected
 * granularity.
 *
 * CTL/ATL/Form are computed per-day from a daily-load array that extends 42 days
 * before the visible range, so Fitness is accurate from the first day shown.
 */
export function computeProgress(
  sessions: Session[],
  granularity: Granularity,
  now: Date = new Date(),
  baseline: ProgressBaseline = {},
): ProgressData {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const { start: rangeStart, end: rangeEnd } = rangeFor(granularity, today)
  const rangeEndExclusive = addDays(rangeEnd, 1)

  // Fatigue baseline sits slightly below fitness — matches metricsStore's seed.
  const baselineCTL = baseline.baselineCTL
  const baselineATL = baselineCTL != null ? baselineCTL * 0.9 : undefined

  // Daily totals keyed by local calendar date, so a workout lands on the day it
  // happened in the user's timezone (matches the planner's day grouping).
  const loadByDay = new Map<string, number>()
  const sessionsByDay = new Map<string, number>()
  for (const session of sessions) {
    const key = localISODate(new Date(session.date))
    loadByDay.set(key, (loadByDay.get(key) ?? 0) + session.loadScore)
    sessionsByDay.set(key, (sessionsByDay.get(key) ?? 0) + 1)
  }

  // Dense load array from (rangeStart − 42d) through rangeEnd, for rolling means.
  const mapStart = addDays(rangeStart, -CTL_WINDOW)
  const totalDays = daysBetween(mapStart, rangeEnd) + 1
  const loads: number[] = []
  for (let i = 0; i < totalDays; i++) {
    loads.push(loadByDay.get(localISODate(addDays(mapStart, i))) ?? 0)
  }

  const rollingMean = (endIdx: number, window: number): number => {
    let sum = 0
    for (let j = Math.max(0, endIdx - window + 1); j <= endIdx; j++) sum += loads[j]
    return sum / window
  }

  // ---- Daily Fitness / Fatigue / Form series (range only, up to today) ----
  const daily: DailyPoint[] = []
  for (let i = CTL_WINDOW; i < totalDays; i++) {
    const date = addDays(mapStart, i)
    if (date > today) break // don't plot future days of the current bucket
    // Account age *as of this day*, so the blend fades exactly as it did in the
    // past — early days lean on the baseline, recent days are pure data.
    const daysSinceReg = baseline.createdAt
      ? Math.max(0, daysBetween(baseline.createdAt, date))
      : undefined
    const ctl = blendBaseline(rollingMean(i, CTL_WINDOW), baselineCTL, daysSinceReg)
    const atl = blendBaseline(rollingMean(i, ATL_WINDOW), baselineATL, daysSinceReg)
    const key = localISODate(date)
    daily.push({
      dateISO: key,
      fullDate: tooltipDate(date),
      load: loads[i],
      sessions: sessionsByDay.get(key) ?? 0,
      ctl,
      atl,
      form: ctl - atl,
    })
  }

  const currentCTL = daily.length ? daily[daily.length - 1].ctl : 0

  // ---- The sustainable band ----
  //
  // Derived from *current* fitness rather than each bucket's own, so it is one
  // horizontal reference the whole chart is read against — "what I can absorb
  // now" — rather than a second data series chasing the bars.
  const bandDays = BUCKET_DAYS[granularity]
  const band: LoadBand | null =
    currentCTL > 0
      ? {
          low: Math.round(currentCTL * BAND_LOW * bandDays),
          high: Math.round(currentCTL * BAND_HIGH * bandDays),
          ctl: currentCTL,
        }
      : null

  // ---- Load buckets ----
  const edges = edgesFor(granularity, rangeStart)
  const acc = edges.map(() => ({ load: 0, sessions: 0, calories: 0 }))
  const inRange: Session[] = []
  for (const s of sessions) {
    const when = new Date(s.date)
    if (when < rangeStart || when >= rangeEndExclusive) continue
    inRange.push(s)
    const index = bucketIndexOf(granularity, rangeStart, when)
    if (index === -1) continue
    acc[index].load += s.loadScore
    acc[index].sessions += 1
    acc[index].calories += s.estimatedCalories ?? 0
  }

  const buckets: LoadBucket[] = edges.map((edge, i) => {
    // Still running if it contains today or reaches past it. Note `> today` and
    // not `> tomorrow`: today's own bucket ends at midnight tonight, so the
    // stricter test marked *today* complete and drew the daily view's last bar
    // at full weight as though the day were over.
    const partial = edge.endExclusive > today
    const { tick, label } = labelsFor(granularity, edge)
    return {
      key: localISODate(edge.start),
      startISO: localISODate(edge.start),
      tick,
      label,
      load: acc[i].load,
      sessions: acc[i].sessions,
      calories: Math.round(acc[i].calories),
      standing: partial ? null : classify(acc[i].load, band),
      partial,
    }
  })

  const verdict = verdictFor(buckets, band)

  // ---- Sport breakdown over the visible range ----
  const sportAcc = new Map<SportType, { load: number; sessions: number; calories: number }>()
  for (const s of inRange) {
    const entry = sportAcc.get(s.sport) ?? { load: 0, sessions: 0, calories: 0 }
    entry.load += s.loadScore
    entry.sessions += 1
    entry.calories += s.estimatedCalories ?? 0
    sportAcc.set(s.sport, entry)
  }
  const totalLoad = inRange.reduce((sum, s) => sum + s.loadScore, 0)
  const sports: SportPoint[] = Array.from(sportAcc.entries())
    .map(([sport, entry]) => ({
      sport,
      label: SPORT_META[sport].label,
      icon: SPORT_META[sport].icon,
      load: entry.load,
      sessions: entry.sessions,
      calories: Math.round(entry.calories),
      share: totalLoad > 0 ? Math.round((entry.load / totalLoad) * 100) : 0,
    }))
    .sort((a, b) => b.load - a.load)

  // ---- Consistency heatmap (weeks as columns, Mon→Sun rows) ----
  //
  // Always whole weeks, whatever the granularity: the grid *is* a week-shaped
  // object. It starts at the Monday on or before the range's first day so a
  // 14-day or month-aligned range still lands in complete columns.
  const heatStart = startOfWeek(rangeStart)
  const heatWeeks = Math.ceil((daysBetween(heatStart, rangeEnd) + 1) / 7)
  const heatmap: HeatmapWeek[] = []
  for (let w = 0; w < heatWeeks; w++) {
    const weekStart = addDays(heatStart, w * 7)
    const cells: (HeatmapDay | null)[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d)
      if (date > today || date < rangeStart) {
        cells.push(null) // outside the range, or a future day of the current week
        continue
      }
      const key = localISODate(date)
      const load = loadByDay.get(key) ?? 0
      cells.push({
        dateISO: key,
        fullDate: tooltipDate(date),
        load,
        sessions: sessionsByDay.get(key) ?? 0,
        level: heatLevel(load),
      })
    }
    heatmap.push({ weekStartISO: localISODate(weekStart), days: cells })
  }

  // ---- Summary stats ----
  const totalCalories = inRange.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)
  const avgForm = daily.length
    ? Math.round(daily.reduce((sum, d) => sum + d.form, 0) / daily.length)
    : 0
  const startCTL = daily.length ? daily[0].ctl : 0

  const stats: ProgressStatsData = {
    totalSessions: inRange.length,
    totalLoad,
    totalCalories: Math.round(totalCalories),
    avgForm,
    topSport: sports[0] ?? null,
    currentCTL,
    ctlTrend: currentCTL - startCTL,
  }

  return {
    granularity,
    rangeStart,
    rangeEnd,
    daily,
    buckets,
    band,
    verdict,
    sports,
    heatmap,
    stats,
  }
}
