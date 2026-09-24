// Rule-based recommendation engine: weekly plan, recovery, conflict resolutions.

import { ACWR_CEILING, ACWR_FLOOR, SPORT_OPTIONS } from '../constants/training'
import { countTrainingDays } from '../utils/calibration'
import { getInteractionLevel, overlapWeight } from './sportInteractions'
import type { Session, SportType } from '../types/session'
import type { SportInteractions } from '../types/user'

export const RECOMMENDER_MIN_TRAINING_DAYS = 14

const DAYS_PER_WEEK = 7

const DETRAINING_TARGET = 1.05

const FATIGUED_FORM = -15

const DETRAINING_WEEKS = 2

const FATIGUE_TIME_CONSTANT = 7

const RECOVERY_TOLERANCE = 0.38

const MAX_RECOVERY_DAYS = 5

const MIN_CONFLICT_GAP_DAYS = 2

const PLAN_HORIZON_DAYS = 7

export const SPORT_SHARE_CAP = 0.4

const FATIGUED_RPE_CEILING = 6

const MIN_PLAN_SESSIONS = 3
const MAX_PLAN_SESSIONS = 4

const BALANCE_WINDOW_DAYS = 28

const W_RECOVERY = 0.5
const W_BALANCE = 0.3
const W_FRESHNESS = 0.2

const FRESHNESS_CEILING_DAYS = 7

const MS_PER_DAY = 86_400_000

export interface RecommenderProfile {
  sports: SportType[]
  sportInteractions: SportInteractions
}

export interface RecommenderMetrics {
  ctl: number
  atl: number
}

export interface RecommenderInput {
  sessions: Session[]
  profile: RecommenderProfile
  metrics: RecommenderMetrics
  now?: Date
}

export interface InsufficientData {
  status: 'insufficient_data'
  trainingDays: number
  required: number
  reason: string
}

export type BudgetStance = 'fatigued' | 'detraining' | 'maintain'

export type BudgetFit = 'on_target' | 'below_minimum' | 'above_capacity'

export interface LoadBudget {
  maintenanceLoad: number
  floor: number
  ceiling: number
  target: number
  stance: BudgetStance
  reason: string
}

export interface SportScore {
  sport: SportType
  recoveryDebt: number
  balanceDeficit: number
  freshness: number
  total: number
  daysSinceLastTrained: number | null
  loadShare: number
}

export type DrivingComponent = 'recovery' | 'balance' | 'freshness'

export interface SuggestedSession {
  sport: SportType
  date: string
  dayOffset: number
  durationMinutes: number
  rpe: number
  load: number
  drivenBy: DrivingComponent
  reason: string
}

export type WeeklyPlan =
  | InsufficientData
  | {
      status: 'ok'
      budget: LoadBudget
      sessions: SuggestedSession[]
      scores: SportScore[]
      allocatedLoad: number
      budgetFit: BudgetFit
    }

export interface RecoveryBlocker {
  sessionId: string
  sport: SportType
  date: string
  rpe: number
  interactionLevel: number
  windowDays: number
}

export type RecoveryStatus =
  | { sport: SportType; status: 'insufficient_data'; trainingDays: number; required: number; reason: string }
  | { sport: SportType; status: 'ready'; reason: string }
  | {
      sport: SportType
      status: 'recovering'
      readyOn: string
      daysRemaining: number
      blockedBy: RecoveryBlocker
      reason: string
    }

export interface PlannedSessionInput {
  sport: SportType
  date: string
  intensity: number
  durationMinutes?: number
}

export type Resolution =
  | { kind: 'insufficient_data'; trainingDays: number; required: number; reason: string }
  | {
      kind: 'reschedule'
      sport: SportType
      date: string
      daysMoved: number
      blockedBy: RecoveryBlocker
      reason: string
    }
  | {
      kind: 'substitute'
      sport: SportType
      date: string
      durationMinutes: number
      rpe: number
      load: number
      overlap: number
      replaces: SportType
      reason: string
    }

function dayIndex(value: string | Date): number | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY)
}

function isoFromDayIndex(index: number): string {
  return new Date(index * MS_PER_DAY).toISOString().slice(0, 10)
}

function weekdayName(index: number): string {
  return new Date(index * MS_PER_DAY).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

function sportLabel(sport: string): string {
  return SPORT_OPTIONS.find((o) => o.value === sport)?.label ?? sport
}

interface DatedSession {
  id: string
  sport: SportType
  dayIndex: number
  rpe: number
  load: number
}

function toDated(sessions: Session[]): DatedSession[] {
  const out: DatedSession[] = []
  for (const s of sessions) {
    const day = dayIndex(s.date)
    if (day === null || typeof s.sport !== 'string' || !s.sport) continue
    out.push({
      id: s.id,
      sport: s.sport,
      dayIndex: day,
      rpe: Number.isFinite(s.rpe) ? s.rpe : 0,
      load: Number.isFinite(s.loadScore) ? s.loadScore : 0,
    })
  }
  return out.sort((a, b) => b.dayIndex - a.dayIndex)
}

export function residualFatigue(overlap: number, rpe: number, daysAgo: number): number {
  if (overlap <= 0 || rpe <= 0) return 0
  const intensity = Math.max(0, Math.min(rpe / 10, 1))
  return overlap * intensity * Math.exp(-Math.max(0, daysAgo) / FATIGUE_TIME_CONSTANT)
}

export function recoveryWindowDays(overlap: number, rpe: number): number {
  const initial = residualFatigue(overlap, rpe, 0)
  if (initial <= RECOVERY_TOLERANCE) return 0
  const days = FATIGUE_TIME_CONSTANT * Math.log(initial / RECOVERY_TOLERANCE)
  return Math.min(MAX_RECOVERY_DAYS, Math.max(0, Math.ceil(days)))
}

function guard(sessions: Session[]): InsufficientData | null {
  const trainingDays = countTrainingDays(sessions)
  if (trainingDays >= RECOMMENDER_MIN_TRAINING_DAYS) return null
  return {
    status: 'insufficient_data',
    trainingDays,
    required: RECOMMENDER_MIN_TRAINING_DAYS,
    reason:
      `${trainingDays} of ${RECOMMENDER_MIN_TRAINING_DAYS} training days logged. ` +
      'FORMA needs a fortnight of real training days before it can suggest a week with any confidence.',
  }
}

function trailingWeekLoad(sessions: DatedSession[], today: number, weeksAgo: number): number {
  const end = today - weeksAgo * DAYS_PER_WEEK
  const start = end - DAYS_PER_WEEK
  let total = 0
  for (const s of sessions) {
    if (s.dayIndex > start && s.dayIndex <= end) total += s.load
  }
  return total
}

function computeBudget(
  sessions: DatedSession[],
  metrics: RecommenderMetrics,
  today: number,
): LoadBudget {
  const maintenanceLoad = Math.round(metrics.ctl * DAYS_PER_WEEK)
  const floor = Math.round(maintenanceLoad * ACWR_FLOOR)
  const ceiling = Math.round(maintenanceLoad * ACWR_CEILING)
  const form = metrics.ctl - metrics.atl

  if (form < FATIGUED_FORM) {
    return {
      maintenanceLoad,
      floor,
      ceiling,
      target: floor,
      stance: 'fatigued',
      reason:
        `Form is ${Math.round(form)}, below ${FATIGUED_FORM} — fatigue is well ahead of fitness, ` +
        `so this week aims at the bottom of your range (${floor} AU) rather than at maintenance (${maintenanceLoad} AU).`,
    }
  }

  const recentWeeks: number[] = []
  for (let w = 0; w < DETRAINING_WEEKS; w++) recentWeeks.push(trailingWeekLoad(sessions, today, w))
  const detraining = recentWeeks.length === DETRAINING_WEEKS && recentWeeks.every((l) => l < floor)

  if (detraining) {
    const target = Math.round(maintenanceLoad * DETRAINING_TARGET)
    return {
      maintenanceLoad,
      floor,
      ceiling,
      target,
      stance: 'detraining',
      reason:
        `The last ${DETRAINING_WEEKS} weeks came in at ${recentWeeks.map(Math.round).join(' and ')} AU, ` +
        `both under your ${floor} AU floor — fitness is drifting down, so this week aims slightly above ` +
        `maintenance at ${target} AU.`,
    }
  }

  return {
    maintenanceLoad,
    floor,
    ceiling,
    target: maintenanceLoad,
    stance: 'maintain',
    reason:
      `Form is ${Math.round(form)} and the last ${DETRAINING_WEEKS} weeks held above your ${floor} AU floor, ` +
      `so this week aims at maintenance — ${maintenanceLoad} AU, your fitness of ${Math.round(metrics.ctl)} across ${DAYS_PER_WEEK} days.`,
  }
}

export function scoreSports(
  sessions: DatedSession[],
  profile: RecommenderProfile,
  today: number,
): SportScore[] {
  const sports = profile.sports
  const matrix = profile.sportInteractions ?? {}

  const windowStart = today - BALANCE_WINDOW_DAYS
  const loadBySport = new Map<string, number>()
  let windowTotal = 0
  for (const s of sessions) {
    if (s.dayIndex <= windowStart) continue
    loadBySport.set(s.sport, (loadBySport.get(s.sport) ?? 0) + s.load)
    windowTotal += s.load
  }
  const evenShare = sports.length > 0 ? 1 / sports.length : 0

  return sports.map((sport) => {
    let debt = 0
    for (const s of sessions) {
      const daysAgo = today - s.dayIndex
      if (daysAgo < 0 || daysAgo > FATIGUE_TIME_CONSTANT * 2) continue
      debt += residualFatigue(overlapWeight(sport, s.sport, matrix), s.rpe, daysAgo)
    }
    const recoveryDebt = Math.max(0, Math.min(debt, 1))

    const loadShare = windowTotal > 0 ? (loadBySport.get(sport) ?? 0) / windowTotal : 0
    const balanceDeficit =
      evenShare > 0 ? Math.max(0, Math.min((evenShare - loadShare) / evenShare, 1)) : 0

    let lastDay: number | null = null
    for (const s of sessions) {
      if (s.sport !== sport) continue
      if (lastDay === null || s.dayIndex > lastDay) lastDay = s.dayIndex
    }
    const daysSinceLastTrained = lastDay === null ? null : Math.max(0, today - lastDay)
    const freshness =
      daysSinceLastTrained === null
        ? 1
        : Math.min(daysSinceLastTrained / FRESHNESS_CEILING_DAYS, 1)

    const total =
      W_RECOVERY * (1 - recoveryDebt) + W_BALANCE * balanceDeficit + W_FRESHNESS * freshness

    return {
      sport,
      recoveryDebt,
      balanceDeficit,
      freshness,
      total,
      daysSinceLastTrained,
      loadShare,
    }
  })
}

function drivingComponent(score: SportScore): DrivingComponent {
  const recovery = W_RECOVERY * (1 - score.recoveryDebt)
  const balance = W_BALANCE * score.balanceDeficit
  const freshness = W_FRESHNESS * score.freshness
  if (balance >= recovery && balance >= freshness) return 'balance'
  if (freshness >= recovery && freshness >= balance) return 'freshness'
  return 'recovery'
}

const SESSION_SHAPES: Record<string, { rpe: [number, number]; minutes: [number, number] }> = {
  running: { rpe: [4, 8], minutes: [20, 90] },
  cycling: { rpe: [3, 7], minutes: [30, 150] },
  swimming: { rpe: [4, 8], minutes: [20, 75] },
  football: { rpe: [5, 8], minutes: [45, 120] },
  combat: { rpe: [6, 9], minutes: [45, 90] },
  gym: { rpe: [5, 8], minutes: [30, 90] },
  strength: { rpe: [5, 9], minutes: [30, 90] },
}

const DEFAULT_SHAPE = { rpe: [4, 8] as [number, number], minutes: [30, 90] as [number, number] }

function minSessionLoad(sport: string): number {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  return shape.minutes[0] * shape.rpe[0]
}

function rpeBand(sport: string, maxRpe?: number): [number, number] {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  const [low, high] = shape.rpe
  if (maxRpe == null) return [low, high]
  return [low, Math.max(low, Math.min(high, maxRpe))]
}

function maxSessionLoad(sport: string, maxRpe?: number): number {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  return shape.minutes[1] * rpeBand(sport, maxRpe)[1]
}

export function allocateShares(
  placements: Placement[],
  weightOf: (p: Placement) => number,
): number[] {
  const weights = placements.map((p) => Math.max(0.01, weightOf(p)))
  const sports = Array.from(new Set(placements.map((p) => p.sport)))
  const cap = Math.max(SPORT_SHARE_CAP, 1 / sports.length)

  const sportWeight = new Map<string, number>()
  placements.forEach((p, i) => sportWeight.set(p.sport, (sportWeight.get(p.sport) ?? 0) + weights[i]))

  const capped = new Map<string, number>()
  for (let pass = 0; pass <= sports.length; pass++) {
    const free = sports.filter((sport) => !capped.has(sport))
    const remaining = 1 - capped.size * cap
    const freeWeight = free.reduce((sum, sport) => sum + (sportWeight.get(sport) ?? 0), 0)
    if (free.length === 0 || freeWeight <= 0) break

    const breached = free.filter(
      (sport) => (remaining * (sportWeight.get(sport) ?? 0)) / freeWeight > cap + 1e-9,
    )
    if (breached.length === 0) {
      for (const sport of free) {
        capped.set(sport, (remaining * (sportWeight.get(sport) ?? 0)) / freeWeight)
      }
      break
    }
    for (const sport of breached) capped.set(sport, cap)
  }

  return placements.map((p, i) => {
    const sportShare = capped.get(p.sport) ?? 0
    const within = weights[i] / (sportWeight.get(p.sport) || 1)
    return sportShare * within
  })
}

export function shapeSession(
  sport: string,
  load: number,
  maxRpe?: number,
): { durationMinutes: number; rpe: number; load: number } {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  const [rpeLow, rpeHigh] = rpeBand(sport, maxRpe)
  const [minLow, minHigh] = shape.minutes
  const midRpe = (rpeLow + rpeHigh) / 2

  let best: { durationMinutes: number; rpe: number; load: number } | null = null
  let bestKey = Number.POSITIVE_INFINITY

  for (let rpe = rpeLow; rpe <= rpeHigh; rpe++) {
    const raw = load / rpe
    const rounded = Math.max(minLow, Math.min(Math.round(raw / 5) * 5, minHigh))
    const actual = rounded * rpe
    const key = Math.abs(actual - load) + Math.abs(rpe - midRpe) * 0.01
    if (key < bestKey) {
      bestKey = key
      best = { durationMinutes: rounded, rpe, load: actual }
    }
  }

  return best ?? { durationMinutes: minLow, rpe: rpeLow, load: minLow * rpeLow }
}

export interface Placement {
  sport: SportType
  dayIndex: number
  spacedFrom: Extract<DayBlock, { kind: 'overlap' }> | null
}

type DayBlock =
  | { kind: 'occupied' }
  | { kind: 'overlap'; sport: SportType; dayIndex: number; level: number; gap: number }

function blockingConstraint(
  sport: SportType,
  day: number,
  history: DatedSession[],
  placed: Placement[],
  placedRpe: Map<number, number>,
  matrix: SportInteractions,
): DayBlock | null {
  for (const p of placed) {
    if (p.dayIndex === day) return { kind: 'occupied' }
  }

  let binding: Extract<DayBlock, { kind: 'overlap' }> | null = null

  const consider = (otherSport: SportType, otherDay: number, rpe: number) => {
    const level = getInteractionLevel(sport, otherSport, matrix)
    const overlap = overlapWeight(sport, otherSport, matrix)
    const window = recoveryWindowDays(overlap, rpe)
    const required = level >= 2 ? Math.max(window, MIN_CONFLICT_GAP_DAYS) : window
    if (required <= 0) return
    if (Math.abs(day - otherDay) >= required) return
    if (!binding || required > binding.gap) {
      binding = { kind: 'overlap', sport: otherSport, dayIndex: otherDay, level, gap: required }
    }
  }

  for (const s of history) {
    if (day - s.dayIndex > MAX_RECOVERY_DAYS) continue
    consider(s.sport, s.dayIndex, s.rpe)
  }
  for (const p of placed) {
    consider(p.sport, p.dayIndex, placedRpe.get(p.dayIndex) ?? 0)
  }

  return binding
}

function placeSessions(
  ranked: SportScore[],
  history: DatedSession[],
  matrix: SportInteractions,
  today: number,
  wanted: number,
): Placement[] {
  const placed: Placement[] = []
  const ASSUMED_RPE = 7
  const placedRpe = new Map<number, number>()

  for (let i = 0; placed.length < wanted && i < wanted * ranked.length; i++) {
    const candidate = ranked[i % ranked.length]
    if (!candidate) break

    let day: number | null = null
    let firstOverlap: Extract<DayBlock, { kind: 'overlap' }> | null = null

    for (let offset = 1; offset <= PLAN_HORIZON_DAYS; offset++) {
      const block = blockingConstraint(
        candidate.sport,
        today + offset,
        history,
        placed,
        placedRpe,
        matrix,
      )
      if (!block) {
        day = today + offset
        break
      }
      if (block.kind === 'overlap' && !firstOverlap) firstOverlap = block
    }

    if (day === null) continue

    placed.push({
      sport: candidate.sport,
      dayIndex: day,
      spacedFrom: day > today + 1 ? firstOverlap : null,
    })
    placedRpe.set(day, ASSUMED_RPE)
  }

  return placed.sort((a, b) => a.dayIndex - b.dayIndex)
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

function buildReason(
  score: SportScore,
  driver: DrivingComponent,
  placement: Placement,
  sportCount: number,
  isLowestDebt: boolean,
): string {
  const label = sportLabel(score.sport)
  const clauses: string[] = []

  if (driver === 'recovery') {
    const debt = Math.round(score.recoveryDebt * 100)
    clauses.push(
      isLowestDebt
        ? `Lowest conflicting fatigue of your sports right now, at ${debt}% recovery debt`
        : `Only ${debt}% recovery debt outstanding against your recent sessions`,
    )
  } else if (driver === 'balance') {
    const even = Math.round((1 / Math.max(1, sportCount)) * 100)
    clauses.push(
      `${label} is ${Math.round(score.loadShare * 100)}% of your load this month against an even split of ${even}%`,
    )
  } else {
    clauses.push(
      score.daysSinceLastTrained === null
        ? `You haven't logged ${label} at all yet`
        : `${plural(score.daysSinceLastTrained, 'day')} since your last ${label} session`,
    )
  }

  if (placement.spacedFrom) {
    const gap = placement.dayIndex - placement.spacedFrom.dayIndex
    const day = weekdayName(placement.spacedFrom.dayIndex)
    const other = sportLabel(placement.spacedFrom.sport)
    clauses.push(
      placement.spacedFrom.sport === score.sport
        ? `placed ${plural(gap, 'day')} after ${day}'s ${other} session so the same muscles get their recovery`
        : `placed ${plural(gap, 'day')} after ${day}'s ${other} session to clear their level-${placement.spacedFrom.level} overlap`,
    )
  }

  return `${clauses.join(', and ')}.`
}

export function computeWeeklyPlan(input: RecommenderInput): WeeklyPlan {
  const blocked = guard(input.sessions)
  if (blocked) return blocked

  const now = input.now ?? new Date()
  const today = dayIndex(now)
  if (today === null) return guardFallback(input.sessions)

  const sessions = toDated(input.sessions)
  const budget = computeBudget(sessions, input.metrics, today)

  if (budget.maintenanceLoad <= 0) {
    const trainingDays = countTrainingDays(input.sessions)
    return {
      status: 'insufficient_data',
      trainingDays,
      required: RECOMMENDER_MIN_TRAINING_DAYS,
      reason:
        'Fitness is still zero, so there is no maintenance week to build a budget from. ' +
        'Log a few more sessions and this will fill in.',
    }
  }

  const scores = scoreSports(sessions, input.profile, today)
  const ranked = [...scores].sort((a, b) => b.total - a.total || a.sport.localeCompare(b.sport))

  const cheapest = Math.min(...input.profile.sports.map(minSessionLoad), Number.POSITIVE_INFINITY)
  const affordable = Number.isFinite(cheapest)
    ? Math.floor(budget.target / cheapest)
    : MAX_PLAN_SESSIONS
  const wanted = Math.max(1, Math.min(affordable, MAX_PLAN_SESSIONS))

  let placements = placeSessions(
    ranked,
    sessions,
    input.profile.sportInteractions ?? {},
    today,
    wanted,
  )

  if (placements.length === 0) {
    return {
      status: 'ok',
      budget,
      sessions: [],
      scores: ranked,
      allocatedLoad: 0,
      budgetFit: 'below_minimum',
    }
  }

  const scoreOf = new Map(scores.map((sc) => [sc.sport, sc]))
  const minimumOf = (list: Placement[]) => list.reduce((sum, p) => sum + minSessionLoad(p.sport), 0)

  const rpeCeiling = budget.stance === 'fatigued' ? FATIGUED_RPE_CEILING : undefined

  while (placements.length > 1 && minimumOf(placements) > budget.target) {
    let weakest = placements[0]
    for (const p of placements) {
      if ((scoreOf.get(p.sport)?.total ?? 0) < (scoreOf.get(weakest.sport)?.total ?? 0)) weakest = p
    }
    placements = placements.filter((p) => p !== weakest)
  }

  for (let guard = 0; guard < placements.length; guard++) {
    const distinct = new Set(placements.map((p) => p.sport)).size
    const capLoad = Math.max(SPORT_SHARE_CAP, 1 / distinct) * budget.target
    const grouped = new Map<SportType, Placement[]>()
    for (const p of placements) {
      grouped.set(p.sport, [...(grouped.get(p.sport) ?? []), p])
    }
    const overspent = [...grouped.values()].find(
      (list) => list.length > 1 && minimumOf(list) > capLoad,
    )
    if (!overspent || placements.length <= 1) break
    const victim = overspent[overspent.length - 1]
    placements = placements.filter((p) => p !== victim)
  }

  const capacityOf = (list: Placement[]) =>
    list.reduce((sum, p) => sum + maxSessionLoad(p.sport, rpeCeiling), 0)
  const budgetFit: BudgetFit =
    minimumOf(placements) > budget.target
      ? 'below_minimum'
      : capacityOf(placements) < budget.target
        ? 'above_capacity'
        : 'on_target'

  const shares = allocateShares(placements, (p) => scoreOf.get(p.sport)?.total ?? 0.01)

  const lowestDebt = ranked.reduce(
    (min, sc) => Math.min(min, sc.recoveryDebt),
    Number.POSITIVE_INFINITY,
  )

  const suggestions: SuggestedSession[] = placements.map((placement, i) => {
    const share = shares[i] * budget.target
    const shaped = shapeSession(placement.sport, share, rpeCeiling)
    const score = scoreOf.get(placement.sport)!
    const driver = drivingComponent(score)
    return {
      sport: placement.sport,
      date: isoFromDayIndex(placement.dayIndex),
      dayOffset: placement.dayIndex - today,
      durationMinutes: shaped.durationMinutes,
      rpe: shaped.rpe,
      load: shaped.load,
      drivenBy: driver,
      reason: buildReason(
        score,
        driver,
        placement,
        input.profile.sports.length,
        score.recoveryDebt <= lowestDebt,
      ),
    }
  })

  correctDrift(
    suggestions,
    budget.target,
    rpeCeiling,
    shares.map((share) => share * budget.target * 1.05),
  )

  return {
    status: 'ok',
    budget,
    sessions: suggestions,
    scores: ranked,
    allocatedLoad: suggestions.reduce((sum, s) => sum + s.load, 0),
    budgetFit,
  }
}

function correctDrift(
  suggestions: SuggestedSession[],
  target: number,
  maxRpe: number | undefined,
  loadCaps: number[],
): void {
  if (suggestions.length === 0) return

  const capOf = new Map(suggestions.map((s, i) => [s, loadCaps[i] ?? Number.POSITIVE_INFINITY]))
  const byLoad = [...suggestions].sort((a, b) => b.load - a.load)

  for (let pass = 0; pass < 2; pass++) {
    let drift = target - suggestions.reduce((sum, s) => sum + s.load, 0)
    if (drift === 0) return

    for (const session of byLoad) {
      if (drift === 0) break
      const wanted = Math.min(session.load + drift, capOf.get(session) ?? Number.POSITIVE_INFINITY)
      const reshaped = shapeSession(session.sport, wanted, maxRpe)
      if (reshaped.load === session.load) continue
      drift -= reshaped.load - session.load
      session.durationMinutes = reshaped.durationMinutes
      session.rpe = reshaped.rpe
      session.load = reshaped.load
    }
  }
}

function guardFallback(sessions: Session[]): InsufficientData {
  return {
    status: 'insufficient_data',
    trainingDays: countTrainingDays(sessions),
    required: RECOMMENDER_MIN_TRAINING_DAYS,
    reason: 'Could not resolve the current date, so no plan was computed.',
  }
}

export function computeRecoveryStatus(input: RecommenderInput): RecoveryStatus[] {
  const blocked = guard(input.sessions)
  const sports = input.profile.sports

  if (blocked) {
    return sports.map((sport) => ({
      sport,
      status: 'insufficient_data' as const,
      trainingDays: blocked.trainingDays,
      required: blocked.required,
      reason: blocked.reason,
    }))
  }

  const now = input.now ?? new Date()
  const today = dayIndex(now) ?? 0
  const sessions = toDated(input.sessions)
  const matrix = input.profile.sportInteractions ?? {}

  return sports.map((sport): RecoveryStatus => {
    let worst: { blocker: RecoveryBlocker; readyDay: number } | null = null

    for (const s of sessions) {
      const daysAgo = today - s.dayIndex
      if (daysAgo < 0 || daysAgo > MAX_RECOVERY_DAYS) continue

      const overlap = overlapWeight(sport, s.sport, matrix)
      const window = recoveryWindowDays(overlap, s.rpe)
      if (window <= 0) continue

      const readyDay = s.dayIndex + window
      if (readyDay <= today) continue
      if (!worst || readyDay > worst.readyDay) {
        worst = {
          readyDay,
          blocker: {
            sessionId: s.id,
            sport: s.sport,
            date: isoFromDayIndex(s.dayIndex),
            rpe: s.rpe,
            interactionLevel:
              s.sport === sport ? 3 : getInteractionLevel(sport, s.sport, matrix),
            windowDays: window,
          },
        }
      }
    }

    if (!worst) {
      return {
        sport,
        status: 'ready',
        reason: `No outstanding overlapping fatigue — ${sportLabel(sport)} is clear to train today.`,
      }
    }

    const daysRemaining = worst.readyDay - today
    const b = worst.blocker
    const sameSport = b.sport === sport
    return {
      sport,
      status: 'recovering',
      readyOn: isoFromDayIndex(worst.readyDay),
      daysRemaining,
      blockedBy: b,
      reason: sameSport
        ? `Your ${sportLabel(b.sport)} session on ${weekdayName(dayIndex(b.date) ?? today)} at RPE ${b.rpe} ` +
          `needs ${plural(b.windowDays, 'day')} to clear, so ${sportLabel(sport)} is advisable again in ` +
          `${plural(daysRemaining, 'day')}.`
        : `${sportLabel(b.sport)} on ${weekdayName(dayIndex(b.date) ?? today)} at RPE ${b.rpe} has a ` +
          `level-${b.interactionLevel} overlap with ${sportLabel(sport)}, which needs ` +
          `${plural(b.windowDays, 'day')} — ${daysRemaining} still to go.`,
    }
  })
}

export function suggestConflictResolution(
  plannedSession: PlannedSessionInput,
  context: RecommenderInput,
): Resolution[] {
  const blocked = guard(context.sessions)
  if (blocked) {
    return [
      {
        kind: 'insufficient_data',
        trainingDays: blocked.trainingDays,
        required: blocked.required,
        reason: blocked.reason,
      },
    ]
  }

  const plannedDay = dayIndex(plannedSession.date)
  if (plannedDay === null) return []

  const sessions = toDated(context.sessions)
  const matrix = context.profile.sportInteractions ?? {}
  const resolutions: Resolution[] = []

  const constraintOn = (sport: SportType, day: number): RecoveryBlocker | null => {
    let worst: RecoveryBlocker | null = null
    for (const s of sessions) {
      const gap = day - s.dayIndex
      if (gap < 0 || gap > MAX_RECOVERY_DAYS) continue
      const level = getInteractionLevel(sport, s.sport, matrix)
      const overlap = overlapWeight(sport, s.sport, matrix)
      const window = recoveryWindowDays(overlap, s.rpe)
      const required = level >= 2 ? Math.max(window, MIN_CONFLICT_GAP_DAYS) : window
      if (required <= 0 || gap >= required) continue
      if (!worst || required > worst.windowDays) {
        worst = {
          sessionId: s.id,
          sport: s.sport,
          date: isoFromDayIndex(s.dayIndex),
          rpe: s.rpe,
          interactionLevel: s.sport === sport ? 3 : level,
          windowDays: required,
        }
      }
    }
    return worst
  }

  const original = constraintOn(plannedSession.sport, plannedDay)

  for (let offset = 1; offset <= PLAN_HORIZON_DAYS; offset++) {
    const day = plannedDay + offset
    if (constraintOn(plannedSession.sport, day)) continue
    resolutions.push({
      kind: 'reschedule',
      sport: plannedSession.sport,
      date: isoFromDayIndex(day),
      daysMoved: offset,
      blockedBy:
        original ?? {
          sessionId: '',
          sport: plannedSession.sport,
          date: plannedSession.date,
          rpe: plannedSession.intensity,
          interactionLevel: 0,
          windowDays: 0,
        },
      reason: original
        ? `Moving to ${weekdayName(day)} puts ${offset} day${offset === 1 ? '' : 's'} more between it and ` +
          `your ${sportLabel(original.sport)} session on ${weekdayName(dayIndex(original.date) ?? day)}, ` +
          `which needs ${plural(original.windowDays, 'day')} to clear its level-${original.interactionLevel} overlap.`
        : `${weekdayName(day)} is the nearest day with no overlapping fatigue outstanding.`,
    })
    break
  }

  if (original) {
    const load =
      (plannedSession.durationMinutes ?? 0) * plannedSession.intensity ||
      Math.round(context.metrics.ctl * DAYS_PER_WEEK / MAX_PLAN_SESSIONS)

    const alternatives = context.profile.sports
      .filter((s) => s !== plannedSession.sport)
      .map((s) => ({ sport: s, overlap: overlapWeight(s, original.sport, matrix) }))
      .filter((c) => !constraintOn(c.sport, plannedDay))
      .sort((a, b) => a.overlap - b.overlap || a.sport.localeCompare(b.sport))

    const pick = alternatives[0]
    if (pick) {
      const shaped = shapeSession(pick.sport, load)
      resolutions.push({
        kind: 'substitute',
        sport: pick.sport,
        date: plannedSession.date,
        durationMinutes: shaped.durationMinutes,
        rpe: shaped.rpe,
        load: shaped.load,
        overlap: pick.overlap,
        replaces: plannedSession.sport,
        reason:
          `${sportLabel(pick.sport)} has a level-${getInteractionLevel(pick.sport, original.sport, matrix)} ` +
          `overlap with ${weekdayName(dayIndex(original.date) ?? plannedDay)}'s ${sportLabel(original.sport)} ` +
          `session, against level-${original.interactionLevel} for ${sportLabel(plannedSession.sport)} — ` +
          `so it keeps the day and roughly the load (${shaped.load} AU) without stacking the same fatigue.`,
      })
    }
  }

  return resolutions.slice(0, 2)
}
