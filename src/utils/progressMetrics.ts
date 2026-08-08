// Progress analytics engine. Derives every dataset the Progress screen renders —
// daily Fitness/Fatigue/Form, weekly load & calories, per-sport breakdown, the
// consistency heatmap, and summary stats — from a raw session list.
//
// Ported from the web app's `utils/progressMetrics.ts` (same imports, same shape)
// with one mobile addition: the daily CTL/ATL series carries the cold-start
// baseline blend so a new user's Fitness/Form line matches the dashboard's number
// instead of ramping from an artificial zero. Pure and deterministic — call it
// inside a `useMemo`.
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

/** One week bucket for the weekly-load and calorie charts. */
export interface WeeklyPoint {
  weekStartISO: string
  /** Axis label — the week's Monday, e.g. "Jun 23". */
  label: string
  /** Compact axis tick, e.g. "Wk 1". */
  weekLabel: string
  /** Tooltip label spanning the week, e.g. "Jun 23 – 29". */
  rangeLabel: string
  load: number
  sessions: number
  calories: number
}

/** Aggregated load for a single sport over the range. */
export interface SportPoint {
  sport: SportType
  label: string
  icon: string
  color: string
  load: number
  sessions: number
  calories: number
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
  rangeStart: Date
  rangeEnd: Date
  /** Whole weeks the range spans (4 / 8 / 12). */
  weeks: number
  daily: DailyPoint[]
  weekly: WeeklyPoint[]
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

/**
 * Derives every dataset the Progress screen renders for a window of `weeks` whole
 * ISO weeks ending with the current week.
 *
 * CTL/ATL/Form are computed per-day from a daily-load array that extends 42 days
 * before the visible range, so Fitness is accurate from the first day shown.
 */
export function computeProgress(
  sessions: Session[],
  weeks: number,
  now: Date = new Date(),
  baseline: ProgressBaseline = {},
): ProgressData {
  const today = new Date(now)
  today.setHours(0, 0, 0, 0)

  const currentWeekStart = startOfWeek(today)
  const rangeStart = addDays(currentWeekStart, -(weeks - 1) * 7) // first Monday shown
  const rangeEnd = addDays(currentWeekStart, 6) // Sunday of the current week
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
    if (date > today) break // don't plot future days of the current week
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

  // ---- Weekly buckets (load / sessions / calories) ----
  const weekly: WeeklyPoint[] = []
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(rangeStart, w * 7)
    const weekEnd = addDays(weekStart, 6)
    const weekEndExclusive = addDays(weekStart, 7)
    let load = 0
    let count = 0
    let calories = 0
    for (const s of sessions) {
      const t = new Date(s.date)
      if (t >= weekStart && t < weekEndExclusive) {
        load += s.loadScore
        count += 1
        calories += s.estimatedCalories ?? 0
      }
    }
    weekly.push({
      weekStartISO: localISODate(weekStart),
      label: shortDate(weekStart),
      weekLabel: `Wk ${w + 1}`,
      rangeLabel: `${shortDate(weekStart)} – ${weekEnd.toLocaleDateString(undefined, { day: 'numeric' })}`,
      load,
      sessions: count,
      calories: Math.round(calories),
    })
  }

  // ---- Sport breakdown over the visible range ----
  const inRange = sessions.filter((s) => {
    const t = new Date(s.date)
    return t >= rangeStart && t < rangeEndExclusive
  })

  const sportAcc = new Map<SportType, { load: number; sessions: number; calories: number }>()
  for (const s of inRange) {
    const acc = sportAcc.get(s.sport) ?? { load: 0, sessions: 0, calories: 0 }
    acc.load += s.loadScore
    acc.sessions += 1
    acc.calories += s.estimatedCalories ?? 0
    sportAcc.set(s.sport, acc)
  }
  const sports: SportPoint[] = Array.from(sportAcc.entries())
    .map(([sport, acc]) => ({
      sport,
      label: SPORT_META[sport].label,
      icon: SPORT_META[sport].icon,
      color: SPORT_META[sport].color,
      load: acc.load,
      sessions: acc.sessions,
      calories: Math.round(acc.calories),
    }))
    .sort((a, b) => b.load - a.load)

  // ---- Consistency heatmap (weeks as columns, Mon→Sun rows) ----
  const heatmap: HeatmapWeek[] = []
  for (let w = 0; w < weeks; w++) {
    const weekStart = addDays(rangeStart, w * 7)
    const cells: (HeatmapDay | null)[] = []
    for (let d = 0; d < 7; d++) {
      const date = addDays(weekStart, d)
      if (date > today) {
        cells.push(null) // future day in the current week
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
  const totalLoad = inRange.reduce((sum, s) => sum + s.loadScore, 0)
  const totalCalories = inRange.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)
  const avgForm = daily.length
    ? Math.round(daily.reduce((sum, d) => sum + d.form, 0) / daily.length)
    : 0
  const currentCTL = daily.length ? daily[daily.length - 1].ctl : 0
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

  return { rangeStart, rangeEnd, weeks, daily, weekly, sports, heatmap, stats }
}
