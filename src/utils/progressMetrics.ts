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
// The engine's own window is still exactly one thing — the last twelve weeks,
// one bucket per week — and it still never changes. That series is what the
// consistency grid, the streak, the sport split and the conflict timeline are
// built from, and it is what the verdict is computed over.
//
// ## The trend chart's two zoom levels are not that switch coming back
//
// `ProgressData.trends` carries two *views of the same measure*: the last seven
// days a day at a time, and the last six weeks a week at a time. The difference
// from the old control is that nothing else on the page moves when you touch
// them — the band, the verdict, the consistency grid and the sport split are all
// still computed over the twelve-week window — and both views plot the same
// quantity (load) against the same reference (the sustainable range). They are a
// magnifying glass on one chart, not three screens behind one tab bar.
//
// ## The band is the part that has to be scaled, and scaling it is subtle
//
// CTL is an average **daily** load, so a week's range is CTL x 7. Measuring a
// single day against *that* would report "below" for all seven days of even an
// excellent week, so the Daily view needs its own.
//
// The obvious answer — CTL x 1 — is also wrong, and wrong in a way that only
// shows up on real data. CTL averages across rest days too, so on a day you
// actually train you are necessarily *above* your daily average: that is what
// makes the rest days affordable. Classified against CTL x 1, a healthy athlete
// training five days a week at a sensible size gets five "above" dots and two
// "below" dots and not one "in range" — the signal inverts into noise, while
// looking entirely plausible.
//
// So the Daily band is the range for **one training day**: CTL x 7 spread over
// however many days a week this athlete actually trains. See `bandFor` and
// `trainingDaysPerWeek`. The verdict then follows the same rule as the dots
// above it — mean of the training days, against the training-day band — so the
// caption can never contradict the colours it is sitting under.
//
// ## What did not change
//
// **The CTL/ATL/Form maths below is untouched** — same windows, same cold-start
// blend, same per-day series. Conflict detection reads the same model, so
// changing it here would change what the coach warns about.
import { ACWR_CEILING, ACWR_FLOOR } from '../constants/training'
import type { Session, SportType } from '../types/session'
import { SPORT_META } from './sportMeta'
import { addDays, startOfWeek, localISODate, daysBetween, WEEKDAY_INITIALS } from './dates'

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

/** Days in the trend chart's Daily view. */
export const TREND_DAYS = 7

/** Weeks in the trend chart's Weekly view, and the model readout's lookback. */
export const TREND_WEEKS = 6

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
// Shared with the recommender's weekly budget — see `ACWR_FLOOR`.
const BAND_LOW = ACWR_FLOOR
const BAND_HIGH = ACWR_CEILING

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

/** Which zoom level the trend chart is showing. */
export type Granularity = 'daily' | 'weekly'

/**
 * One point on the trend line — a day on the Daily view, a week on the Weekly.
 *
 * Deliberately the same shape for both, so the chart has one renderer rather
 * than a `granularity === 'daily' ? … : …` branch running through every path,
 * tooltip and dot in it. Everything that differs between the two — how wide the
 * bucket is, what the axis tick says, what the band is scaled to — is resolved
 * here, where the data is, and the view just draws points.
 */
export interface TrendPoint {
  /** Stable React key. */
  key: string
  /** The x-axis tick: a weekday initial, or the week's start date. */
  tick: string
  /** Tooltip heading — "Mon, Aug 18" or "Aug 18 – 24". */
  label: string
  load: number
  sessions: number
  /**
   * Where this bucket sits against its band, or `null` while it is still
   * running. Same rule as {@link WeekBucket.standing}: today is not a day that
   * "went below the range", it is a day that has not finished, and colouring its
   * dot grey every morning would be a statement about the clock rather than
   * about the athlete.
   */
  standing: BucketStanding | null
  /** True while this bucket still has time left to run. */
  partial: boolean
}

/** One zoom level of the trend chart: its points, band, verdict and caption. */
export interface TrendSeries {
  points: TrendPoint[]
  /**
   * The sustainable range **for one bucket of this size** — CTL x 7 for a week,
   * CTL x 7 / training-days-per-week for a day. See the note at the top of this
   * file for why the daily one is not simply CTL.
   */
  band: LoadBand | null
  /**
   * The plain-English read on **this** window, computed against **this** band.
   *
   * Per-series rather than one figure for the whole screen. It used to average
   * the full twelve weeks, which was fine while the chart *was* the full twelve
   * weeks — but a caption that says "you're easing off" under six visible weeks
   * of plainly enormous training is not a nuance, it is a caption that is wrong
   * about the picture directly above it. It answers for what is on screen.
   */
  verdict: LoadVerdict
  /** The window, spelled out under the chart — "Last 7 days". */
  caption: string
}

/** One figure in the Weekly view's Fitness / Fatigue / Form readout. */
export interface ModelStat {
  /** The athlete-facing name — "Fitness". */
  label: string
  /** The model's name for it — "CTL". */
  abbrev: string
  /** Today's value, rounded. */
  value: number
  /** Change over the lookback window. Positive is up, whichever way is good. */
  delta: number
}

/**
 * The Fitness / Fatigue / Form readout under the Weekly chart.
 *
 * Six weeks is the shortest window over which these three say anything: CTL is a
 * 42-day average, so a chart shorter than that is mostly showing the average's
 * own inertia rather than the athlete's training. That is exactly why this block
 * belongs to the Weekly view and is withheld on Daily — not to keep the Daily
 * view tidy, but because the numbers would not yet mean what they appear to.
 */
export interface ModelReadout {
  fitness: ModelStat
  fatigue: ModelStat
  form: ModelStat
  /** How many weeks the deltas span. */
  weeks: number
  /** One plain-English sentence, generated from the three deltas. */
  summary: string
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
  /**
   * The trend chart's two zoom levels, both always computed.
   *
   * Both, rather than only the selected one, because switching tabs must not
   * cost a recompute of the whole screen: `computeProgress` runs inside a
   * `useMemo` keyed on the sessions and the sport filter, and threading the
   * granularity through it would blow that memo away on every tap. Two extra
   * passes over an array the function has already built are free by comparison.
   */
  trends: Record<Granularity, TrendSeries>
  /**
   * Fitness / Fatigue / Form now, and six weeks ago. `null` when the window
   * doesn't reach back far enough to have a comparison to make.
   */
  model: ModelReadout | null
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

/**
 * The sustainable range for a bucket `days` long, from a current fitness value.
 *
 * CTL is an average *daily* load, so the multiplier is the bucket width and
 * nothing else: seven for a week, one for a day. This is the whole reason the
 * two zoom levels can share a chart — the band moves with the bucket, so "above
 * the range" means the same thing on both.
 */
function bandFor(ctl: number, days: number): LoadBand | null {
  if (ctl <= 0) return null
  return {
    low: Math.round(ctl * BAND_LOW * days),
    high: Math.round(ctl * BAND_HIGH * days),
    ctl,
  }
}

/** How far back the training-frequency estimate is willing to look. */
const FREQUENCY_WINDOW = 28

/**
 * How many days a week this athlete actually trains — the Daily band's divisor.
 *
 * ## Why the denominator is the observed span and not a flat four weeks
 *
 * Dividing by four assumes four weeks of history exist. On an account five days
 * old, three training days over four weeks reads as "trains once a week", which
 * hands a single day the load range of a whole week and puts every day of a
 * perfectly good first week below it — the exact inversion the training-day band
 * was introduced to fix, reappearing at the other end of the scale.
 *
 * So it counts across the span it can actually see: from the earliest training
 * day in the window up to today, floored at a week so one busy Tuesday cannot
 * read as "trains seven days a week".
 *
 * Rounded and clamped to 1–7, because it is picking between seven possible bands
 * and deserves no more precision than that.
 */
function trainingDaysPerWeek(byDay: Map<string, number>, today: Date): number {
  let active = 0
  let earliest = 0
  for (let i = 0; i < FREQUENCY_WINDOW; i++) {
    if ((byDay.get(localISODate(addDays(today, -i))) ?? 0) > 0) {
      active += 1
      earliest = i
    }
  }
  if (active === 0) return 7
  const spanDays = Math.max(7, earliest + 1)
  return Math.min(7, Math.max(1, Math.round((active * 7) / spanDays)))
}

function classify(load: number, band: LoadBand | null): BucketStanding | null {
  if (!band) return null
  if (load > band.high) return 'above'
  if (load < band.low) return 'below'
  return 'inside'
}

/**
 * The plain-English read on one window, against that window's own band.
 *
 * `restCounts` is what separates the two zoom levels. A week with no training in
 * it is a real week of not training and belongs in a weekly average. A *day* with
 * no training in it is a rest day — an intended part of the week, and already
 * accounted for in the training-day band the daily dots are classified against —
 * so averaging rest days in would report "easing off" for every athlete who
 * takes two days off, which is every athlete who trains well.
 */
function verdictFor(
  buckets: { load: number; partial: boolean }[],
  band: LoadBand | null,
  restCounts = true,
): LoadVerdict {
  // Only finished buckets. Averaging in a week that is one day old would say
  // "easing off" every Tuesday.
  const complete = buckets.filter((b) => !b.partial && (restCounts || b.load > 0))
  // No band is the only genuinely unanswerable case. A *daily* window with no
  // training days in it is not unanswerable — we know exactly what happened —
  // so it falls through with a mean of zero and lands on "easing off", which is
  // both true and the same thing its seven grey dots are already saying.
  if (!band || (complete.length === 0 && restCounts)) {
    return {
      tone: 'unknown',
      headline: 'Still learning your range',
      detail: 'log a few more sessions',
    }
  }

  const mean =
    complete.length > 0 ? complete.reduce((sum, b) => sum + b.load, 0) / complete.length : 0
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
/* The Fitness / Fatigue / Form sentence                               */
/* ------------------------------------------------------------------ */

type Direction = 'up' | 'down' | 'steady'

/**
 * Whether a six-week change is worth calling a change.
 *
 * A flat threshold would call a 2 AU drift on a CTL of 90 a decline; a purely
 * proportional one would call a 2 AU drift on a CTL of 8 a collapse. The floor
 * and the percentage together mean "moved enough that the athlete would have
 * felt it", which is the only sense in which a sentence about it is true.
 */
function direction(delta: number, from: number): Direction {
  const threshold = Math.max(3, Math.abs(from) * 0.06)
  if (delta > threshold) return 'up'
  if (delta < -threshold) return 'down'
  return 'steady'
}

/** "fitness up 12" / "fatigue held steady" — the clause, uncapitalised. */
function movementClause(noun: string, dir: Direction, delta: number): string {
  if (dir === 'steady') return `${noun} held steady`
  return `${noun} ${dir} ${Math.abs(delta)}`
}

/**
 * What the two movements mean together, as the sentence's final clause.
 *
 * Deliberately exhaustive over the nine combinations rather than assembled from
 * per-axis fragments. The *interaction* is the whole point — fitness up is good
 * news or bad news depending entirely on what fatigue did underneath it — and a
 * template that says "fitness rose" and "fatigue rose" in sequence never gets to
 * the sentence the athlete actually needs, which is which of the two is winning.
 */
function interactionRead(
  fitness: Direction,
  fatigue: Direction,
  fitnessDelta: number,
  fatigueDelta: number,
): string {
  if (fitness === 'up' && fatigue === 'steady') return "that's a healthy build"
  if (fitness === 'up' && fatigue === 'down') {
    return "fitter and fresher, which is the best combination there is"
  }
  if (fitness === 'up' && fatigue === 'up') {
    return fitnessDelta >= fatigueDelta
      ? 'fitness is outpacing fatigue, which is the right way round'
      : 'fatigue is climbing faster than fitness — an easier week would bank it'
  }
  if (fitness === 'steady' && fatigue === 'up') {
    return "that's cost without much return"
  }
  if (fitness === 'steady' && fatigue === 'down') {
    return "you're freshening up on the fitness you already had"
  }
  if (fitness === 'steady' && fatigue === 'steady') {
    return "you're ticking over rather than building"
  }
  if (fitness === 'down' && fatigue === 'up') {
    return 'fitness slipping while fatigue rises is the one combination worth acting on'
  }
  if (fitness === 'down' && fatigue === 'down') {
    return "you've been easing off, and fitness has followed"
  }
  return 'fitness drifts down when the work eases off'
}

/**
 * Today's Fitness / Fatigue / Form against the same three six weeks ago.
 *
 * Reads the *unfiltered* daily series, like the Advanced section does and for
 * the same reason: the engine has no idea what the sport chips are set to, and
 * fatigue from a swim is fatigue when you go running. A per-sport CTL would be a
 * model nothing in the app actually runs.
 */
function buildModel(daily: DailyPoint[]): ModelReadout | null {
  const lookback = TREND_WEEKS * 7
  if (daily.length <= lookback) return null

  const now = daily[daily.length - 1]
  const then = daily[daily.length - 1 - lookback]

  const fitnessDelta = now.ctl - then.ctl
  const fatigueDelta = now.atl - then.atl

  const fitnessDir = direction(fitnessDelta, then.ctl)
  const fatigueDir = direction(fatigueDelta, then.atl)

  const lead = movementClause('Fitness', fitnessDir, fitnessDelta)
  const follow = movementClause('fatigue', fatigueDir, fatigueDelta)
  const read = interactionRead(fitnessDir, fatigueDir, fitnessDelta, fatigueDelta)

  // "Fitness up 12 over six weeks while fatigue held steady — that's a healthy
  // build." The two-both-steady case says it once instead of twice.
  const summary =
    fitnessDir === 'steady' && fatigueDir === 'steady'
      ? `Fitness and fatigue both held steady over six weeks — ${read}.`
      : `${lead} over six weeks while ${follow} — ${read}.`

  return {
    fitness: { label: 'Fitness', abbrev: 'CTL', value: now.ctl, delta: fitnessDelta },
    fatigue: { label: 'Fatigue', abbrev: 'ATL', value: now.atl, delta: fatigueDelta },
    form: { label: 'Form', abbrev: 'CTL - ATL', value: now.form, delta: now.form - then.form },
    weeks: TREND_WEEKS,
    summary,
  }
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

  // A week's worth of range, and one training day's worth of it. See `bandFor`,
  // `trainingDaysPerWeek`, and the note at the top of this file for why the
  // daily divisor is the athlete's own training frequency and not seven.
  const band = bandFor(currentCTL, 7)
  const dailyBand = bandFor(currentCTL, 7 / trainingDaysPerWeek(view.load, today))

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

  // ---- The trend chart's two zoom levels ----
  //
  // Weekly is a straight slice of the twelve buckets just built, not a second
  // aggregation of the same sessions. That is the point: the six weeks on the
  // chart are literally the last six dots of the consistency grid, so the two
  // cards can never disagree about whether a week landed in range.
  const weekly: TrendPoint[] = []
  for (let i = Math.max(0, WEEKS - TREND_WEEKS); i < WEEKS; i++) {
    const bucket = weeks[i]
    const start = addDays(rangeStart, i * 7)
    weekly.push({
      key: bucket.key,
      // The week's start date. Six ticks have room for a real date, where twelve
      // did not — which is why the bar chart's axis could only carry a month.
      tick: shortDate(start),
      label: bucket.label,
      load: bucket.load,
      sessions: bucket.sessions,
      standing: bucket.standing,
      partial: bucket.partial,
    })
  }

  // Daily reads the filtered day map directly. Note `view`, not `all`: the chart
  // follows the sport chips, and its band was derived from the same filtered
  // rolling load above.
  const dailyTrend: TrendPoint[] = []
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const key = localISODate(date)
    const load = view.load.get(key) ?? 0
    // Today is the only bucket still running, and it is judged by exactly the
    // rule the weekly buckets use: drawn, but not classified.
    const partial = i === 0
    const standingSoFar = classify(load, dailyBand)
    dailyTrend.push({
      key,
      tick: WEEKDAY_INITIALS[date.getDay()],
      label: tooltipDate(date),
      load,
      sessions: view.count.get(key) ?? 0,
      standing: partial ? null : standingSoFar,
      partial,
    })
  }

  const trends: Record<Granularity, TrendSeries> = {
    daily: {
      points: dailyTrend,
      band: dailyBand,
      // Rest days excluded: they are what the training-day band already assumes.
      verdict: verdictFor(dailyTrend, dailyBand, false),
      caption: `Last ${TREND_DAYS} days`,
    },
    weekly: {
      points: weekly,
      band,
      verdict: verdictFor(weekly, band),
      caption: `Last ${TREND_WEEKS} weeks`,
    },
  }

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
    trends,
    model: buildModel(daily),
    thisWeek,
    streak,
    sports,
    availableSports,
    daily,
  }
}
