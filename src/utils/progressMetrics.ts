// Progress analytics engine: every dataset the screen renders.

import { ACWR_CEILING, ACWR_FLOOR } from '../constants/training'
import type { Session, SportType } from '../types/session'
import { SPORT_META } from './sportMeta'
import { addDays, startOfWeek, localISODate, daysBetween, WEEKDAY_INITIALS } from './dates'

const CTL_WINDOW = 42
const ATL_WINDOW = 7

const BLEND_DAYS = 21

export const WEEKS = 12

export const TREND_DAYS = 7

export const TREND_WEEKS = 6

const BAND_LOW = ACWR_FLOOR
const BAND_HIGH = ACWR_CEILING

export type SportFilter = SportType | 'all'

export interface ProgressBaseline {
  baselineCTL?: number
  createdAt?: string
}

export interface DailyPoint {
  dateISO: string
  fullDate: string
  load: number
  sessions: number
  ctl: number
  atl: number
  form: number
}

export type BucketStanding = 'above' | 'inside' | 'below'

export interface WeekBucket {
  key: string
  startISO: string
  label: string
  monthTick: string | null
  load: number
  sessions: number
  minutes: number
  calories: number
  standing: BucketStanding | null
  standingSoFar: BucketStanding | null
  partial: boolean
}

export type Granularity = 'daily' | 'weekly'

export interface TrendPoint {
  key: string
  tick: string
  label: string
  load: number
  sessions: number
  standing: BucketStanding | null
  partial: boolean
}

export interface TrendSeries {
  points: TrendPoint[]
  band: LoadBand | null
  verdict: LoadVerdict
  caption: string
}

export interface ModelStat {
  label: string
  abbrev: string
  value: number
  delta: number
}

export interface ModelReadout {
  fitness: ModelStat
  fatigue: ModelStat
  form: ModelStat
  weeks: number
  summary: string
}

export interface LoadBand {
  low: number
  high: number
  ctl: number
}

export type VerdictTone = BucketStanding | 'unknown'

export interface LoadVerdict {
  tone: VerdictTone
  headline: string
  detail: string
}

export interface WeekSummary {
  load: number
  minutes: number
  sessions: number
}

export interface SportPoint {
  sport: SportType
  label: string
  load: number
  sessions: number
  minutes: number
  calories: number
  share: number
}

export interface ProgressData {
  rangeStart: Date
  rangeEnd: Date
  weeks: WeekBucket[]
  band: LoadBand | null
  trends: Record<Granularity, TrendSeries>
  model: ModelReadout | null
  thisWeek: WeekSummary
  streak: number
  sports: SportPoint[]
  availableSports: SportType[]
  daily: DailyPoint[]
}

function shortDate(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

function tooltipDate(date: Date): string {
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}

function blendBaseline(
  calculated: number,
  baseline: number | undefined,
  daysSinceRegistration: number | undefined,
): number {
  if (baseline == null || daysSinceRegistration == null) return Math.round(calculated)
  const dataWeight = Math.min(daysSinceRegistration / BLEND_DAYS, 1)
  return Math.round(baseline * (1 - dataWeight) + calculated * dataWeight)
}

function bandFor(ctl: number, days: number): LoadBand | null {
  if (ctl <= 0) return null
  return {
    low: Math.round(ctl * BAND_LOW * days),
    high: Math.round(ctl * BAND_HIGH * days),
    ctl,
  }
}

const FREQUENCY_WINDOW = 28

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

function verdictFor(
  buckets: { load: number; partial: boolean }[],
  band: LoadBand | null,
  restCounts = true,
): LoadVerdict {
  const complete = buckets.filter((b) => !b.partial && (restCounts || b.load > 0))
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

type Direction = 'up' | 'down' | 'steady'

function direction(delta: number, from: number): Direction {
  const threshold = Math.max(3, Math.abs(from) * 0.06)
  if (delta > threshold) return 'up'
  if (delta < -threshold) return 'down'
  return 'steady'
}

function movementClause(noun: string, dir: Direction, delta: number): string {
  if (dir === 'steady') return `${noun} held steady`
  return `${noun} ${dir} ${Math.abs(delta)}`
}

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

export function computeProgress(
  sessions: Session[],
  sport: SportFilter = 'all',
  now: Date = new Date(),
  baseline: ProgressBaseline = {},
): ProgressData {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const thisWeekStart = startOfWeek(today)
  const rangeStart = addDays(thisWeekStart, -(WEEKS - 1) * 7)
  const rangeEnd = addDays(thisWeekStart, 6)
  const rangeEndExclusive = addDays(rangeEnd, 1)

  const filtered = sport === 'all' ? sessions : sessions.filter((s) => s.sport === sport)

  const baselineCTL = baseline.baselineCTL
  const baselineATL = baselineCTL != null ? baselineCTL * 0.9 : undefined

  const all = totalsByDay(sessions)
  const view = sport === 'all' ? all : totalsByDay(filtered)

  const mapStart = addDays(rangeStart, -CTL_WINDOW)
  const totalDays = daysBetween(mapStart, rangeEnd) + 1
  const allLoads = denseLoads(all.load, mapStart, totalDays)
  const viewLoads = sport === 'all' ? allLoads : denseLoads(view.load, mapStart, totalDays)

  const daily: DailyPoint[] = []
  for (let i = CTL_WINDOW; i < totalDays; i++) {
    const date = addDays(mapStart, i)
    if (date > today) break
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

  const todayIdx = daysBetween(mapStart, today)
  const currentCTL =
    sport === 'all'
      ? (daily.length ? daily[daily.length - 1].ctl : 0)
      : Math.round(rollingMean(viewLoads, todayIdx, CTL_WINDOW))

  const band = bandFor(currentCTL, 7)
  const dailyBand = bandFor(currentCTL, 7 / trainingDaysPerWeek(view.load, today))

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
    const partial = endExclusive > today
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
      standingSoFar: partial && standingSoFar === 'below' ? null : standingSoFar,
      partial,
    }
  })

  const weekly: TrendPoint[] = []
  for (let i = Math.max(0, WEEKS - TREND_WEEKS); i < WEEKS; i++) {
    const bucket = weeks[i]
    const start = addDays(rangeStart, i * 7)
    weekly.push({
      key: bucket.key,
      tick: shortDate(start),
      label: bucket.label,
      load: bucket.load,
      sessions: bucket.sessions,
      standing: bucket.standing,
      partial: bucket.partial,
    })
  }

  const dailyTrend: TrendPoint[] = []
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const date = addDays(today, -i)
    const key = localISODate(date)
    const load = view.load.get(key) ?? 0
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

  let streak = 0
  for (let i = weeks.length - 1; i >= 0; i--) {
    const week = weeks[i]
    if (week.standingSoFar === 'inside') {
      streak++
      continue
    }
    if (week.partial && week.standingSoFar === null) continue
    break
  }

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
