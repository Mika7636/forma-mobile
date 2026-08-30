// Progress analytics engine. Derives every dataset the Progress screen renders —
// the twelve-week training-load series and its sustainable band, this week's
// summary, the per-sport breakdown, the consistency streak, and the daily
// Fitness/Fatigue/Form series behind the Advanced section — from a raw session
// list. Pure and deterministic; call it inside a `useMemo`.
//
// ## One window, not three
//
// The screen used to carry a Daily / Weekly / Monthly switch, and each option
// defined its *own* window: a fortnight, a quarter, a year. So the band moved,
// the bars changed meaning, the verdict was computed over a different span, and
// nothing on screen could be compared with anything the athlete had seen a
// moment earlier. Every reading was true and none of them were comparable.
//
// There is now exactly one window — the last twelve weeks, one bar per week —
// and it never changes. A fixed axis is what makes a chart legible over time:
// the athlete learns the shape of their own twelve weeks, and next week's chart
// is the same chart with one more bar on it.
//
// ## What did not change
//
// **The CTL/ATL/Form maths below is untouched** — same windows, same cold-start
// blend, same per-day series. Conflict detection reads the same model, so
// changing it here would change what the coach warns about.
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

/**
 * The one window the whole screen is drawn for: twelve weeks, one bar each.
 *
 * Long enough that a training block has a shape, short enough that every bar is
 * still wide enough to read and to tap on a phone.
 */
export const WEEKS = 12

/**
 * The sustainable band, as multiples of the load the athlete's current fitness
 * implies for a week.
 *
 * CTL *is* an average daily load, so "what this athlete currently absorbs" in a
 * week is CTL x 7. Below ~0.8x of that, fitness drifts down; above ~1.3x, the
 * ramp is faster than adaptation and is where the injury literature starts to
 * get nervous. Deliberately wide: this is a coaching hint, not a target, and a
 * narrow band would have athletes chasing the middle of it.
 */
const BAND_LOW = 0.8
const BAND_HIGH = 1.3

/** Which sport the screen is filtered to. `all` is the default. */
export type SportFilter = SportType | 'all'

/** Baseline seeds and account age used to blend the cold-start CTL/ATL series. */
export interface ProgressBaseline {
  /** Onboarding fitness seed (User.baselineCTL). */
  baselineCTL?: number
  /** ISO registration timestamp (User.createdAt), for the blend's day counter. */
  createdAt?: string
}

/** One day of the Fitness/Fatigue/Form series behind the Advanced section. */
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

/** Where a week's load sits relative to the sustainable band. */
export type BucketStanding = 'above' | 'inside' | 'below'

/** One bar of the training-load chart. Always a week; there are always twelve. */
export interface WeekBucket {
  /** Stable React key / identity. */
  key: string
  startISO: string
  /** Tooltip heading, e.g. "Jun 23 – 29". */
  label: string
  /**
   * Short month name in caps ("JUN"), on the first week of each month only.
   *
   * The axis used to label every bucket, or every other one, which is how it
   * ended up rendering "Aug 10Aug 17" and reading as though bars were missing.
   * A month boundary is the only tick a twelve-week axis actually needs: it is
   * the unit the athlete thinks in, there are three or four of them in frame,
   * and they never collide.
   */
  monthTick: string | null
  load: number
  sessions: number
  minutes: number
  calories: number
  /**
   * `null` while the week is still running.
   *
   * A week that is two days old has not "gone below the range" — it simply has
   * not happened yet. Classifying it would paint the current bar grey every
   * Monday and drag the headline verdict down with it, so an unfinished week is
   * drawn but not judged, and is excluded from the verdict entirely.
   */
  standing: BucketStanding | null
  /**
   * Where the load sits *right now*, finished or not — `null` only for a running
   * week that has not yet reached the floor.
   *
   * The consistency grid needs this rather than {@link standing}: a week that
   * has already landed inside the range has earned its dot on the Thursday, and
   * one that has already overshot cannot come back, because load only ever
   * accumulates.
   */
  standingSoFar: BucketStanding | null
  /** True while this week still has days left to run. */
  partial: boolean
}

/** The load range the athlete's current fitness implies for one week. */
export interface LoadBand {
  low: number
  high: number
  /** The CTL the band was derived from — the last day of the series. */
  ctl: number
}

export type VerdictTone = BucketStanding | 'unknown'

/** The plain-English read on the period, shown as a caption under the chart. */
export interface LoadVerdict {
  tone: VerdictTone
  /** e.g. "You're building safely". */
  headline: string
  /** One clause of explanation, appended after the headline on the same line. */
  detail: string
}

/** The three figures in the "This week" block. */
export interface WeekSummary {
  load: number
  minutes: number
  sessions: number
}

/**
 * Aggregated load for a single sport over the window.
 *
 * Carries no colour: this is a pure data module with no palette in scope, and a
 * hue baked in here would be frozen at whichever theme was active when the
 * metrics were computed. The view resolves it with `sportVisual(sport, colors)`
 * at render time instead.
 */
export interface SportPoint {
  sport: SportType
  label: string
  load: number
  sessions: number
  minutes: number
  calories: number
  /** Percentage of the window's total load, 0–100, rounded. */
  share: number
}

export interface ProgressData {
  /** Monday of the first week shown. */
  rangeStart: Date
  /** Sunday of the current week — the last day the chart has a slot for. */
  rangeEnd: Date
  /** Exactly {@link WEEKS} buckets, oldest → newest. */
  weeks: WeekBucket[]
  /** `null` when there is no fitness estimate yet to derive a range from. */
  band: LoadBand | null
  verdict: LoadVerdict
  /** The last bucket, as the three figures the "This week" block shows. */
  thisWeek: WeekSummary
  /** Consecutive weeks, counting back from now, that landed inside the range. */
  streak: number
  sports: SportPoint[]
  /**
   * Every sport with training in the window, busiest first — the filter chips.
   *
   * Always computed from the *unfiltered* sessions. Deriving it from the
   * filtered set would delete every other chip the moment one was chosen,
   * leaving no way back.
   */
  availableSports: SportType[]
  /**
   * The daily Fitness/Fatigue/Form series, from **all** sessions regardless of
   * the sport filter.
   *
   * The Advanced section shows the model the engine actually runs, and the
   * engine does not know about the filter — fatigue from a swim is fatigue when
   * you go running. Filtering this chart would show the athlete a model that
   * nothing in the app uses.
   */
  daily: DailyPoint[]
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function tooltipDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
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

function classify(load: number, band: LoadBand | null): BucketStanding | null {
  if (!band) return null
  if (load > band.high) return 'above'
  if (load < band.low) return 'below'
  return 'inside'
}

/** The plain-English read on the window as a whole. */
function verdictFor(weeks: WeekBucket[], band: LoadBand | null): LoadVerdict {
  // Only finished weeks. Averaging in a week that is one day old would say
  // "easing off" every Tuesday.
  const complete = weeks.filter((w) => !w.partial)
  if (!band || complete.length === 0) {
    return {
      tone: 'unknown',
      headline: 'Still learning your range',
      detail: 'log a few more sessions',
    }
  }

  const mean = complete.reduce((sum, w) => sum + w.load, 0) / complete.length
  const tone = classify(mean, band) ?? 'inside'

  if (tone === 'above') {
    return { tone, headline: "You're ramping up fast", detail: 'watch for lingering fatigue' }
  }
  if (tone === 'below') {
    return { tone, headline: "You're easing off", detail: 'fitness drifts down if it lasts' }
  }
  return { tone, headline: "You're building safely", detail: 'this is where progress comes from' }
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

/** Daily load totals keyed by *local* calendar date. */
function totalsByDay(sessions: Session[]) {
  const load = new Map<string, number>()
  const count = new Map<string, number>()
  for (const session of sessions) {
    const key = localISODate(new Date(session.date))
    load.set(key, (load.get(key) ?? 0) + session.loadScore)
    count.set(key, (count.get(key) ?? 0) + 1)
  }
  return { load, count }
}

/** A dense day-by-day load array from `start`, `days` long. */
function denseLoads(byDay: Map<string, number>, start: Date, days: number): number[] {
  const out: number[] = []
  for (let i = 0; i < days; i++) out.push(byDay.get(localISODate(addDays(start, i))) ?? 0)
  return out
}

function rollingMean(loads: number[], endIdx: number, window: number): number {
  let sum = 0
  for (let j = Math.max(0, endIdx - window + 1); j <= endIdx; j++) sum += loads[j]
  return sum / window
}

/**
 * Derives every dataset the Progress screen renders, for the fixed twelve-week
 * window and the selected sport.
 *
 * CTL/ATL/Form are computed per-day from a daily-load array that extends 42 days
 * before the visible window, so Fitness is accurate from the first day shown.
 */
export function computeProgress(
  sessions: Session[],
  sport: SportFilter = 'all',
  now: Date = new Date(),
  baseline: ProgressBaseline = {},
): ProgressData {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  // Whole weeks, ending with the one in progress.
  const thisWeekStart = startOfWeek(today)
  const rangeStart = addDays(thisWeekStart, -(WEEKS - 1) * 7)
  const rangeEnd = addDays(thisWeekStart, 6)
  const rangeEndExclusive = addDays(rangeEnd, 1)

  const filtered = sport === 'all' ? sessions : sessions.filter((s) => s.sport === sport)

  // Fatigue baseline sits slightly below fitness — matches metricsStore's seed.
  const baselineCTL = baseline.baselineCTL
  const baselineATL = baselineCTL != null ? baselineCTL * 0.9 : undefined

  const all = totalsByDay(sessions)
  const view = sport === 'all' ? all : totalsByDay(filtered)

  // Dense load arrays from (rangeStart − 42d) through rangeEnd, for rolling means.
  const mapStart = addDays(rangeStart, -CTL_WINDOW)
  const totalDays = daysBetween(mapStart, rangeEnd) + 1
  const allLoads = denseLoads(all.load, mapStart, totalDays)
  const viewLoads = sport === 'all' ? allLoads : denseLoads(view.load, mapStart, totalDays)

  // ---- Daily Fitness / Fatigue / Form series (unfiltered; Advanced only) ----
  const daily: DailyPoint[] = []
  for (let i = CTL_WINDOW; i < totalDays; i++) {
    const date = addDays(mapStart, i)
    if (date > today) break // don't plot future days of the current week
    // Account age *as of this day*, so the blend fades exactly as it did in the
    // past — early days lean on the baseline, recent days are pure data.
    const daysSinceReg = baseline.createdAt
      ? Math.max(0, daysBetween(baseline.createdAt, date))
      : undefined
    const ctl = blendBaseline(rollingMean(allLoads, i, CTL_WINDOW), baselineCTL, daysSinceReg)
    const atl = blendBaseline(rollingMean(allLoads, i, ATL_WINDOW), baselineATL, daysSinceReg)
    const key = localISODate(date)
    daily.push({
      dateISO: key,
      fullDate: tooltipDate(date),
      load: allLoads[i],
      sessions: all.count.get(key) ?? 0,
      ctl,
      atl,
      form: ctl - atl,
    })
  }

  // ---- The sustainable band ----
  //
  // Derived from *current* fitness rather than each week's own, so it is one
  // horizontal reference the whole chart is read against — "what I can absorb
  // now" — rather than a second data series chasing the bars.
  //
  // Under a sport filter it is built from that sport's own rolling load, which
  // is the only reference that makes the filtered bars mean anything: measuring
  // running-only weeks against whole-body capacity would report "below range"
  // for every athlete who does more than one sport. The onboarding baseline is
  // deliberately *not* blended in there — it seeds total fitness, and there is
  // no such thing as a seeded swimming baseline.
  const todayIdx = daysBetween(mapStart, today)
  const currentCTL =
    sport === 'all'
      ? (daily.length ? daily[daily.length - 1].ctl : 0)
      : Math.round(rollingMean(viewLoads, todayIdx, CTL_WINDOW))

  const band: LoadBand | null =
    currentCTL > 0
      ? {
          low: Math.round(currentCTL * BAND_LOW * 7),
          high: Math.round(currentCTL * BAND_HIGH * 7),
          ctl: currentCTL,
        }
      : null

  // ---- The twelve weekly buckets ----
  const acc = Array.from({ length: WEEKS }, () => ({
    load: 0,
    sessions: 0,
    minutes: 0,
    calories: 0,
  }))
  const inRange: Session[] = []
  const inRangeAll: Session[] = []
  for (const s of sessions) {
    const when = new Date(s.date)
    if (when < rangeStart || when >= rangeEndExclusive) continue
    inRangeAll.push(s)
    if (sport !== 'all' && s.sport !== sport) continue
    inRange.push(s)
    const day = new Date(when)
    day.setHours(0, 0, 0, 0)
    const index = Math.floor(daysBetween(rangeStart, day) / 7)
    if (index < 0 || index >= WEEKS) continue
    acc[index].load += s.loadScore
    acc[index].sessions += 1
    acc[index].minutes += s.durationMinutes
    acc[index].calories += s.estimatedCalories ?? 0
  }

  let previousMonth = -1
  const weeks: WeekBucket[] = acc.map((entry, i) => {
    const start = addDays(rangeStart, i * 7)
    const endExclusive = addDays(start, 7)
    // Still running if it contains today or reaches past it. Note `> today` and
    // not `> tomorrow`: today's own week ends at midnight on Sunday, so the
    // stricter test marked the current week complete.
    const partial = endExclusive > today
    // One tick per month, on the first week that *starts* in it. Comparing
    // start months (rather than asking whether the week contains a 1st) keeps
    // the labels strictly increasing and exactly one per month, including for
    // the week that straddles the boundary.
    const month = start.getMonth()
    const monthTick =
      i === 0 || month !== previousMonth
        ? start.toLocaleDateString(undefined, { month: 'short' }).toUpperCase()
        : null
    previousMonth = month

    const standingSoFar = classify(entry.load, band)
    return {
      key: localISODate(start),
      startISO: localISODate(start),
      label: `${shortDate(start)} – ${addDays(endExclusive, -1).toLocaleDateString(undefined, { day: 'numeric' })}`,
      monthTick,
      load: entry.load,
      sessions: entry.sessions,
      minutes: entry.minutes,
      calories: Math.round(entry.calories),
      standing: partial ? null : standingSoFar,
      // On a Tuesday every week is below its own weekly range, which is not a
      // fact about the athlete.
      standingSoFar: partial && standingSoFar === 'below' ? null : standingSoFar,
      partial,
    }
  })

  const verdict = verdictFor(weeks, band)

  const last = weeks[weeks.length - 1]
  const thisWeek: WeekSummary = {
    load: last.load,
    minutes: last.minutes,
    sessions: last.sessions,
  }

  // ---- The streak ----
  //
  // Counted from now backwards. The week in progress extends it only once it
  // has actually landed inside the range; if it has already overshot it breaks
  // the streak, because load only accumulates and it cannot come back.
  let streak = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    const week = weeks[i]
    if (week.standingSoFar === 'inside') {
      streak++
      continue
    }
    if (week.partial && week.standingSoFar === null) continue // not yet decided
    break
  }

  // ---- Sport breakdown over the window ----
  const sportAcc = new Map<
    SportType,
    { load: number; sessions: number; minutes: number; calories: number }
  >()
  for (const s of inRange) {
    const entry = sportAcc.get(s.sport) ?? { load: 0, sessions: 0, minutes: 0, calories: 0 }
    entry.load += s.loadScore
    entry.sessions += 1
    entry.minutes += s.durationMinutes
    entry.calories += s.estimatedCalories ?? 0
    sportAcc.set(s.sport, entry)
  }
  const totalLoad = inRange.reduce((sum, s) => sum + s.loadScore, 0)
  const sports: SportPoint[] = Array.from(sportAcc.entries())
    .map(([key, entry]) => ({
      sport: key,
      label: SPORT_META[key]?.label ?? key,
      load: entry.load,
      sessions: entry.sessions,
      minutes: entry.minutes,
      calories: Math.round(entry.calories),
      share: totalLoad > 0 ? Math.round((entry.load / totalLoad) * 100) : 0,
    }))
    .sort((a, b) => b.load - a.load)

  // Chips come from the unfiltered window, busiest sport first.
  const chipLoad = new Map<SportType, number>()
  for (const s of inRangeAll) chipLoad.set(s.sport, (chipLoad.get(s.sport) ?? 0) + s.loadScore)
  const availableSports = Array.from(chipLoad.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key)

  return {
    rangeStart,
    rangeEnd,
    weeks,
    band,
    verdict,
    thisWeek,
    streak,
    sports,
    availableSports,
    daily,
  }
}
