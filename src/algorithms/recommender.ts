// FORMA's recommendation engine: a rule-based expert system, not a model.
//
// ## What kind of thing this is
//
// Three parts, in the classical arrangement:
//
//   * **Knowledge base** — the sport interaction matrix (`sportInteractions`),
//     which is the athlete's own copy, seeded at registration and editable. It
//     is the only thing here that encodes domain expertise about how sports
//     interfere, and it is shared with the conflict engine so the app cannot
//     warn about a pairing it would also recommend.
//   * **Inference engine** — the constraint checks below: a load budget bounded
//     by the same acute:chronic range the Progress band draws, recovery windows
//     derived from the matrix and ATL's decay, and a scoring rule that ranks
//     sports on three measured components.
//   * **Explainable output** — every recommendation carries a `reason` built by
//     interpolating the numbers that actually drove it. Nothing here composes a
//     sentence from anything it did not compute; if a figure appears in the
//     copy, it appears in the returned data too, and a caller can check it.
//
// There is no API call, no model, no randomness, and no hidden state. Given the
// same sessions, profile, metrics and `now`, every function returns exactly the
// same object — which is what makes the whole thing testable and is most of the
// reason it is rules and not a model.
//
// ## Why every function is guarded on training days
//
// Advice is a stronger claim than a chart. A Form Score that is slightly wrong
// is a number the athlete can discount; "train combat on Thursday" is an
// instruction, and one derived from four sessions is a guess wearing the app's
// authority. So all three entry points refuse below
// {@link RECOMMENDER_MIN_TRAINING_DAYS} distinct training days and say so in a
// typed state rather than degrading quietly — see the note on that constant for
// why the bar is days trained rather than days elapsed.
import { ACWR_CEILING, ACWR_FLOOR, SPORT_OPTIONS } from '../constants/training'
import { countTrainingDays } from '../utils/calibration'
import { getInteractionLevel, overlapWeight } from './sportInteractions'
import type { Session, SportType } from '../types/session'
import type { SportInteractions } from '../types/user'

/* ------------------------------------------------------------------ */
/* Constants — every tunable in one place                              */
/* ------------------------------------------------------------------ */

/**
 * Distinct training days below which this module refuses to advise.
 *
 * Days the athlete actually trained, counted by the same
 * {@link countTrainingDays} the Form Score's baseline gate uses, so the two
 * cannot disagree about how well FORMA knows somebody. It is deliberately lower
 * than that gate's 42: showing a *number* built on a half-converged average is a
 * different risk from suggesting a week's training, and a fortnight of real
 * training days is enough to rank sports and space them sensibly even while the
 * fitness average is still filling.
 */
export const RECOMMENDER_MIN_TRAINING_DAYS = 14

/** CTL is a daily average, so a week at maintenance is seven of them. */
const DAYS_PER_WEEK = 7

/** Nudge above maintenance applied when the athlete is detraining. */
const DETRAINING_TARGET = 1.05

/** Form below this reads as accumulated fatigue rather than a hard block. */
const FATIGUED_FORM = -15

/** Consecutive sub-floor weeks that count as detraining. */
const DETRAINING_WEEKS = 2

/**
 * The decay constant for residual fatigue, in days.
 *
 * Seven, because ATL — the fatigue term — is a 7-day average, so seven days is
 * the horizon over which a session still counts as recent. Modelled as a smooth
 * exponential rather than as the step function a 7-day rolling mean literally
 * applies: the rolling mean drops a session entirely on day 7, and advice built
 * on that would tell an athlete a sport was blocked on Tuesday and fine on
 * Wednesday for no reason they could feel. A decay says the same thing without
 * the cliff.
 */
const FATIGUE_TIME_CONSTANT = 7

/**
 * Residual conflicting fatigue at or below which a sport is advisable again.
 *
 * Solved rather than picked. The requirement is that a level-2 pairing after an
 * RPE-7 session — precisely the threshold at which `detectConflicts` fires at
 * balanced sensitivity — yields a window of exactly 2 days, which is that
 * engine's own 48-hour rule. Substituting into {@link recoveryWindowDays} and
 * requiring the ceiling to land on 2 gives a valid band of roughly
 * [0.355, 0.405); 0.38 is taken from the middle of it, so neither rounding edge
 * is one floating-point wobble away.
 *
 * The two engines therefore agree at the point they overlap, and this module
 * extends the idea past it rather than offering a second opinion. It also keeps
 * level-1 pairings at zero days for any intensity — the matrix's weakest
 * overlap is 1/3, below this tolerance even at RPE 10 — which is the same
 * "level 2 and up" bar the conflict engine warns from.
 */
const RECOVERY_TOLERANCE = 0.38

/** Nobody is told to wait longer than this to train a sport again. */
const MAX_RECOVERY_DAYS = 5

/**
 * Conflicting sports are never placed closer than this, whatever the maths says.
 *
 * A hard floor on top of {@link recoveryWindowDays}, because "not on adjacent
 * days" is a rule the plan must satisfy even where a light prior session would
 * have computed a window of zero.
 */
const MIN_CONFLICT_GAP_DAYS = 2

/** Days a suggested plan spans. */
const PLAN_HORIZON_DAYS = 7

/** How many sessions a plan suggests. */
const MIN_PLAN_SESSIONS = 3
const MAX_PLAN_SESSIONS = 4

/** Window over which the balance component measures each sport's share. */
const BALANCE_WINDOW_DAYS = 28

/**
 * Component weights. Recovery outranks the other two combined, because avoiding
 * harm outranks balance: a perfectly balanced week that stacks a level-3 pairing
 * is worse advice than an unbalanced one that does not.
 */
const W_RECOVERY = 0.5
const W_BALANCE = 0.3
const W_FRESHNESS = 0.2

/** Days since a sport was last trained at which freshness saturates. */
const FRESHNESS_CEILING_DAYS = 7

const MS_PER_DAY = 86_400_000

/* ------------------------------------------------------------------ */
/* Inputs                                                             */
/* ------------------------------------------------------------------ */

/** The slice of a profile the engine reads. A full `User` satisfies it. */
export interface RecommenderProfile {
  sports: SportType[]
  sportInteractions: SportInteractions
}

/** Current fitness and fatigue, as the metrics store already computes them. */
export interface RecommenderMetrics {
  /** Chronic training load — the 42-day daily average. */
  ctl: number
  /** Acute training load — the 7-day daily average. */
  atl: number
}

/**
 * Everything the engine needs, passed in by the caller.
 *
 * No Firestore, no stores, no clock except the one handed over: `now` is a
 * parameter so that "what should I do this week" is a pure function of a moment
 * rather than of when the test happened to run.
 */
export interface RecommenderInput {
  /** The athlete's history. Full history where available. */
  sessions: Session[]
  profile: RecommenderProfile
  metrics: RecommenderMetrics
  now?: Date
}

/* ------------------------------------------------------------------ */
/* Outputs                                                            */
/* ------------------------------------------------------------------ */

/** Why the engine declined to answer. Returned, never thrown. */
export interface InsufficientData {
  status: 'insufficient_data'
  trainingDays: number
  required: number
  /** Plain English, with the real figures in it. */
  reason: string
}

/** Which rule set the weekly target. */
export type BudgetStance = 'fatigued' | 'detraining' | 'maintain'

/**
 * Whether the week's sessions could be made to sum to the budget.
 *
 * Almost always `on_target`. The other two are the cases where the athlete's own
 * sports and the budget genuinely cannot be reconciled, and they are reported
 * rather than hidden because both are readable states with obvious advice
 * attached — and because the alternative is a plan that quietly misses its own
 * stated target and looks like an arithmetic bug.
 *
 *  * `below_minimum` — one realistic session already costs more than the whole
 *    week. A beginner at very low fitness whose chosen sports all come in long:
 *    a 45-minute football match is 225 AU against a 140 AU week.
 *  * `above_capacity` — the sessions that could legally be placed cannot carry
 *    the budget between them. A single-sport athlete at high fitness, where the
 *    recovery windows between repeats of that one sport leave room for fewer
 *    sessions than the budget needs.
 */
export type BudgetFit = 'on_target' | 'below_minimum' | 'above_capacity'

export interface LoadBudget {
  /** `CTL x 7` — a week that holds fitness exactly level. */
  maintenanceLoad: number
  /** `ACWR_FLOOR x maintenance`. Below this, fitness drifts down. */
  floor: number
  /** `ACWR_CEILING x maintenance`. Above this, injury risk turns up. */
  ceiling: number
  /** Where in `[floor, ceiling]` this week should land. */
  target: number
  stance: BudgetStance
  /** The rule that chose `target`, with its numbers. */
  reason: string
}

/** The three measured components behind a sport's rank. Each 0–1. */
export interface SportScore {
  sport: SportType
  /** Outstanding conflicting fatigue. Higher is worse; it *lowers* `total`. */
  recoveryDebt: number
  /** How far under an even share of load this sport is. Higher scores higher. */
  balanceDeficit: number
  /** Days since last trained, over {@link FRESHNESS_CEILING_DAYS}. */
  freshness: number
  /** Weighted total, 0–1. */
  total: number
  /** Days since this sport was last trained; `null` if never. */
  daysSinceLastTrained: number | null
  /** This sport's share of the last 28 days' load, 0–1. */
  loadShare: number
}

/** Which component contributed most to a suggestion. */
export type DrivingComponent = 'recovery' | 'balance' | 'freshness'

export interface SuggestedSession {
  sport: SportType
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  /** Whole days from today. 1 is tomorrow. */
  dayOffset: number
  durationMinutes: number
  /** Integer 1–10. `durationMinutes x rpe` is `load`. */
  rpe: number
  /** sRPE load this session is meant to carry. */
  load: number
  /** The component that put this sport at the top. */
  drivenBy: DrivingComponent
  /** One sentence, interpolated from this session's own figures. */
  reason: string
}

export type WeeklyPlan =
  | InsufficientData
  | {
      status: 'ok'
      budget: LoadBudget
      sessions: SuggestedSession[]
      /** Every sport ranked, so a caller can show the workings. */
      scores: SportScore[]
      /** Sum of `sessions[].load`. Within rounding of `budget.target`. */
      allocatedLoad: number
      /** Whether the suggested sessions could actually sum to the target. */
      budgetFit: BudgetFit
    }

/** The session standing between a sport and its next outing. */
export interface RecoveryBlocker {
  sessionId: string
  sport: SportType
  /** Local calendar day the blocking session happened on. */
  date: string
  rpe: number
  /** 0–3 from the matrix; 3-equivalent when it is the same sport. */
  interactionLevel: number
  /** Days that session's fatigue needs, from the matrix and ATL's decay. */
  windowDays: number
}

export type RecoveryStatus =
  | { sport: SportType; status: 'insufficient_data'; trainingDays: number; required: number; reason: string }
  | { sport: SportType; status: 'ready'; reason: string }
  | {
      sport: SportType
      status: 'recovering'
      /** Local calendar day it becomes advisable. */
      readyOn: string
      daysRemaining: number
      blockedBy: RecoveryBlocker
      reason: string
    }

/** A session the conflict engine has flagged, as the planner holds it. */
export interface PlannedSessionInput {
  sport: SportType
  /** Local calendar day, `YYYY-MM-DD`. */
  date: string
  /** Planned RPE, 1–10. */
  intensity: number
  durationMinutes?: number
}

export type Resolution =
  | { kind: 'insufficient_data'; trainingDays: number; required: number; reason: string }
  | {
      kind: 'reschedule'
      sport: SportType
      /** Where to move it to. */
      date: string
      daysMoved: number
      blockedBy: RecoveryBlocker
      reason: string
    }
  | {
      kind: 'substitute'
      /** What to do instead, on the original day. */
      sport: SportType
      date: string
      durationMinutes: number
      rpe: number
      load: number
      /** The substitute's overlap with the blocking session, 0–1. */
      overlap: number
      replaces: SportType
      reason: string
    }

/* ------------------------------------------------------------------ */
/* Day arithmetic                                                     */
/* ------------------------------------------------------------------ */

/**
 * A local calendar-day index.
 *
 * The same construction the calibration gate uses: local Y/M/D re-anchored
 * through `Date.UTC`, so two sessions on one local day share an index whatever
 * the clocks did, and a difference of indices is whole calendar days across a
 * DST boundary. `null` for anything unparseable, so a bad row is skipped rather
 * than poisoning a window with `NaN`.
 */
function dayIndex(value: string | Date): number | null {
  if (!(value instanceof Date) && typeof value !== 'string') return null
  const d = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(d.getTime())) return null
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY)
}

/** `YYYY-MM-DD` for a day index. */
function isoFromDayIndex(index: number): string {
  return new Date(index * MS_PER_DAY).toISOString().slice(0, 10)
}

/** "Tuesday" — how a suggested day is named in a reason. */
function weekdayName(index: number): string {
  return new Date(index * MS_PER_DAY).toLocaleDateString('en-GB', {
    weekday: 'long',
    timeZone: 'UTC',
  })
}

function sportLabel(sport: string): string {
  return SPORT_OPTIONS.find((o) => o.value === sport)?.label ?? sport
}

/** One session reduced to what the rules read, with its day already resolved. */
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

/* ------------------------------------------------------------------ */
/* The core rule: how long conflicting fatigue lasts                   */
/* ------------------------------------------------------------------ */

/**
 * Residual fatigue from a session of intensity `rpe`, `daysAgo` days later,
 * as it lands on a sport with `overlap` against it. 0–1.
 *
 * Three factors, all measured rather than assumed: how much the two sports share
 * (the matrix), how hard the session was (its own RPE), and how long ago it was
 * (ATL's decay). A level-1 pairing, an easy session, or a fortnight of distance
 * each drive this toward zero on their own.
 */
export function residualFatigue(overlap: number, rpe: number, daysAgo: number): number {
  if (overlap <= 0 || rpe <= 0) return 0
  const intensity = Math.max(0, Math.min(rpe / 10, 1))
  return overlap * intensity * Math.exp(-Math.max(0, daysAgo) / FATIGUE_TIME_CONSTANT)
}

/**
 * How many days must pass before a session stops holding a sport back.
 *
 * Solved rather than tabulated: {@link residualFatigue} is
 * `overlap x intensity x e^(-d/7)`, so the day it falls to
 * {@link RECOVERY_TOLERANCE} is `7 x ln(overlap x intensity / tolerance)`.
 * Ceiled to a whole day, floored at zero and capped at
 * {@link MAX_RECOVERY_DAYS}.
 *
 * Which is why this is not a flat constant: a level-3 pairing after an RPE-9
 * session yields five days, the same pairing after an easy RPE-4 session yields
 * none, and a level-1 pairing yields none at any intensity — matching the
 * conflict engine, which only ever fires from level 2 up.
 */
export function recoveryWindowDays(overlap: number, rpe: number): number {
  const initial = residualFatigue(overlap, rpe, 0)
  if (initial <= RECOVERY_TOLERANCE) return 0
  const days = FATIGUE_TIME_CONSTANT * Math.log(initial / RECOVERY_TOLERANCE)
  return Math.min(MAX_RECOVERY_DAYS, Math.max(0, Math.ceil(days)))
}

/* ------------------------------------------------------------------ */
/* Guard                                                              */
/* ------------------------------------------------------------------ */

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

/* ------------------------------------------------------------------ */
/* 1. Load budget                                                     */
/* ------------------------------------------------------------------ */

/** Total load in the trailing 7-day block `weeksAgo` weeks back. */
function trailingWeekLoad(sessions: DatedSession[], today: number, weeksAgo: number): number {
  const end = today - weeksAgo * DAYS_PER_WEEK
  const start = end - DAYS_PER_WEEK
  let total = 0
  for (const s of sessions) {
    if (s.dayIndex > start && s.dayIndex <= end) total += s.load
  }
  return total
}

/**
 * The coming week's load budget, and the rule that set it.
 *
 * The bounds are the Gabbett acute:chronic range the Progress band is drawn
 * from — imported, not copied, so the number the athlete is advised to hit is
 * inside the band they can already see. The target within them is a three-way
 * decision, checked in order of urgency: fatigue first, because backing off is
 * the one recommendation it is never wrong to follow late; then detraining;
 * then hold.
 */
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

  // Trailing 7-day blocks rather than calendar weeks: the question is whether
  // the last fortnight of *elapsed* training was under the floor, and a calendar
  // week read on a Tuesday would compare two days against a seven-day floor.
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

/* ------------------------------------------------------------------ */
/* 2. Sport scoring                                                   */
/* ------------------------------------------------------------------ */

/**
 * Rank the athlete's sports on three measured components.
 *
 * Exported because the plan returns these alongside its suggestions: the whole
 * claim of an explainable system is that a reader can check the reasoning, and
 * that means handing over the components, not only the sentence built from them.
 */
export function scoreSports(
  sessions: DatedSession[],
  profile: RecommenderProfile,
  today: number,
): SportScore[] {
  const sports = profile.sports
  const matrix = profile.sportInteractions ?? {}

  // Load per sport over the balance window, for the even-split comparison.
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
    // --- recoveryDebt: what is still sitting on this sport's muscles ---
    let debt = 0
    for (const s of sessions) {
      const daysAgo = today - s.dayIndex
      if (daysAgo < 0 || daysAgo > FATIGUE_TIME_CONSTANT * 2) continue
      debt += residualFatigue(overlapWeight(sport, s.sport, matrix), s.rpe, daysAgo)
    }
    const recoveryDebt = Math.max(0, Math.min(debt, 1))

    // --- balanceDeficit: how far under an even split ---
    const loadShare = windowTotal > 0 ? (loadBySport.get(sport) ?? 0) / windowTotal : 0
    const balanceDeficit =
      evenShare > 0 ? Math.max(0, Math.min((evenShare - loadShare) / evenShare, 1)) : 0

    // --- freshness: days since last trained, saturating at a week ---
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

/** Which of the three contributed most to this sport's total. */
function drivingComponent(score: SportScore): DrivingComponent {
  const recovery = W_RECOVERY * (1 - score.recoveryDebt)
  const balance = W_BALANCE * score.balanceDeficit
  const freshness = W_FRESHNESS * score.freshness
  if (balance >= recovery && balance >= freshness) return 'balance'
  if (freshness >= recovery && freshness >= balance) return 'freshness'
  return 'recovery'
}

/* ------------------------------------------------------------------ */
/* 3. Allocation                                                      */
/* ------------------------------------------------------------------ */

/**
 * Realistic duration and intensity ranges per sport.
 *
 * The point of this table is that `load = minutes x rpe` has many solutions and
 * most of them are nonsense: 600 AU is a plausible 75 minutes at RPE 8, and also
 * an absurd 300 minutes at RPE 2 or a heroic 60 at RPE 10. Constraining RPE to
 * what the sport is usually done at, and duration to what a session of it
 * usually lasts, is what keeps a suggestion something an athlete could actually
 * go and do.
 */
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

/**
 * The smallest load a session of this sport can realistically carry — its
 * shortest sensible duration at its easiest sensible intensity.
 *
 * This is what bounds how many sessions a budget can be split into. A 140 AU
 * week (an athlete at CTL 20) cannot hold three sessions, because three sessions
 * of anything real already come to more than that; splitting it into three
 * anyway would produce a plan of seven-minute runs, which is arithmetic rather
 * than advice.
 */
function minSessionLoad(sport: string): number {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  return shape.minutes[0] * shape.rpe[0]
}

/** The largest load a session of this sport can realistically carry. */
function maxSessionLoad(sport: string): number {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  return shape.minutes[1] * shape.rpe[1]
}

/**
 * The closest realistic `(minutes, rpe)` pair whose product is `load`.
 *
 * Searches the sport's plausible RPE range, takes minutes to the nearest five,
 * clamps to the sport's plausible duration, and keeps whichever candidate lands
 * closest to the requested load — breaking ties toward the middle of the RPE
 * range, since a mid-range effort is the one an athlete is most likely to hit.
 */
export function shapeSession(
  sport: string,
  load: number,
): { durationMinutes: number; rpe: number; load: number } {
  const shape = SESSION_SHAPES[sport] ?? DEFAULT_SHAPE
  const [rpeLow, rpeHigh] = shape.rpe
  const [minLow, minHigh] = shape.minutes
  const midRpe = (rpeLow + rpeHigh) / 2

  let best: { durationMinutes: number; rpe: number; load: number } | null = null
  let bestKey = Number.POSITIVE_INFINITY

  for (let rpe = rpeLow; rpe <= rpeHigh; rpe++) {
    const raw = load / rpe
    const rounded = Math.max(minLow, Math.min(Math.round(raw / 5) * 5, minHigh))
    const actual = rounded * rpe
    // Distance from the requested load first; closeness to a mid-range effort
    // only as the tie-break, scaled small enough that it can never outrank a
    // genuinely better load match.
    const key = Math.abs(actual - load) + Math.abs(rpe - midRpe) * 0.01
    if (key < bestKey) {
      bestKey = key
      best = { durationMinutes: rounded, rpe, load: actual }
    }
  }

  // The loop always runs at least once for any valid shape, but a malformed
  // table entry would leave `best` null rather than crashing the plan.
  return best ?? { durationMinutes: minLow, rpe: rpeLow, load: minLow * rpeLow }
}

/** A placement decided before any load is allocated to it. */
interface Placement {
  sport: SportType
  dayIndex: number
  /** The overlapping session that forced it later, if any. */
  spacedFrom: Extract<DayBlock, { kind: 'overlap' }> | null
}

/** Why a day is unavailable. `occupied` carries no overlap to explain. */
type DayBlock =
  | { kind: 'occupied' }
  | { kind: 'overlap'; sport: SportType; dayIndex: number; level: number; gap: number }

/**
 * Is `sport` allowed on `day`, given history and what is already placed?
 *
 * Returns the binding constraint rather than a boolean, so a reason string can
 * name the session that actually did the constraining instead of asserting a
 * spacing rule in the abstract. "That day is already taken" is a separate kind:
 * it is a fact about the plan rather than about the matrix, and folding it in
 * with the overlaps would have the copy claim a level-0 clash — which is to say
 * no clash at all — as the thing that moved a session.
 */
function blockingConstraint(
  sport: SportType,
  day: number,
  history: DatedSession[],
  placed: Placement[],
  placedRpe: Map<number, number>,
  matrix: SportInteractions,
): DayBlock | null {
  // Nothing twice on one day, whatever the sports are.
  for (const p of placed) {
    if (p.dayIndex === day) return { kind: 'occupied' }
  }

  let binding: Extract<DayBlock, { kind: 'overlap' }> | null = null

  const consider = (otherSport: SportType, otherDay: number, rpe: number) => {
    const level = getInteractionLevel(sport, otherSport, matrix)
    const overlap = overlapWeight(sport, otherSport, matrix)
    const window = recoveryWindowDays(overlap, rpe)
    // The adjacency floor applies to genuinely conflicting pairs — level 2 and
    // up, the same bar the conflict engine warns from. Two sports the matrix
    // says barely interact may sit on consecutive days, which is what makes a
    // four-session week possible at all. The same sport repeating is governed by
    // its own window instead: the matrix scores that pair 0 by design, while
    // `overlapWeight` reads it as total overlap, so a hard session still blocks
    // a repeat without needing the level-based floor.
    const required = level >= 2 ? Math.max(window, MIN_CONFLICT_GAP_DAYS) : window
    if (required <= 0) return
    if (Math.abs(day - otherDay) >= required) return
    if (!binding || required > binding.gap) {
      binding = { kind: 'overlap', sport: otherSport, dayIndex: otherDay, level, gap: required }
    }
  }

  for (const s of history) {
    // Only the recent past can still be binding; older than the decay horizon
    // and `recoveryWindowDays` returns 0 anyway.
    if (day - s.dayIndex > MAX_RECOVERY_DAYS) continue
    consider(s.sport, s.dayIndex, s.rpe)
  }
  for (const p of placed) {
    consider(p.sport, p.dayIndex, placedRpe.get(p.dayIndex) ?? 0)
  }

  return binding
}

/**
 * Lay sessions out across the coming week.
 *
 * Placement happens **before** load is allocated, which is the ordering that
 * makes the budget arithmetic honest: the plan first works out how many sessions
 * it can legally fit, then divides the target across exactly those, so the
 * suggested loads always sum to the budget instead of a session being dropped
 * afterwards and taking its share of the week with it.
 *
 * Each candidate goes on the earliest day that clears every constraint. Sports
 * are tried in score order and a sport that cannot be placed anywhere in the
 * horizon is skipped rather than squeezed in against the matrix.
 */
function placeSessions(
  ranked: SportScore[],
  history: DatedSession[],
  matrix: SportInteractions,
  today: number,
  wanted: number,
): Placement[] {
  const placed: Placement[] = []
  // Intensity is not known until load is allocated, so spacing between two
  // *suggested* sessions assumes each will be a solidly hard effort. Assuming
  // the top of the range would space the week out on training that may never be
  // that hard; assuming the bottom would let a real clash through.
  const ASSUMED_RPE = 7
  const placedRpe = new Map<number, number>()

  // Cycle the ranked list so a two-sport athlete still gets four sessions rather
  // than the plan collapsing to the number of sports they picked.
  for (let i = 0; placed.length < wanted && i < wanted * ranked.length; i++) {
    const candidate = ranked[i % ranked.length]
    if (!candidate) break

    let day: number | null = null
    // What stood in the way on the first day tried — the reason this session
    // sits where it does rather than tomorrow. Captured on the way past, so the
    // explanation never has to be reconstructed after the fact.
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
      // Only credit the spacing when it actually moved the session. A session on
      // the first available day was not spaced away from anything.
      spacedFrom: day > today + 1 ? firstOverlap : null,
    })
    placedRpe.set(day, ASSUMED_RPE)
  }

  return placed.sort((a, b) => a.dayIndex - b.dayIndex)
}

/** "1 day", "3 days" — a count and its noun, agreeing. */
function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}

/**
 * One sentence, built only from figures this suggestion actually computed.
 *
 * Two rules govern everything here. Every number interpolated is one the caller
 * also receives on the returned object, so a reader can check the sentence
 * against the data. And no superlative is asserted without being tested for —
 * "lowest" is a claim about the whole set, so it is only used where this sport
 * genuinely holds the minimum, and a plainer wording stands in where it does
 * not. A recommendation that overstates its own reasoning is worse than one
 * that under-explains it.
 */
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
    // The matrix scores a sport against itself 0 — it does not *interfere* with
    // itself, it just is itself — so quoting a level here would read "level-0
    // overlap", which says the opposite of why the session moved. A repeat is
    // spaced on the fatigue it left behind, and that is what the sentence says.
    clauses.push(
      placement.spacedFrom.sport === score.sport
        ? `placed ${plural(gap, 'day')} after ${day}'s ${other} session so the same muscles get their recovery`
        : `placed ${plural(gap, 'day')} after ${day}'s ${other} session to clear their level-${placement.spacedFrom.level} overlap`,
    )
  }

  return `${clauses.join(', and ')}.`
}

/**
 * The coming week: a budget, and 3–4 sessions that spend it.
 *
 * See the file header for the shape of the system. The order here is the order
 * of the reasoning: how much to do, which sports deserve it, when they can
 * legally happen, and only then how each slice becomes a session somebody could
 * actually go and train.
 */
export function computeWeeklyPlan(input: RecommenderInput): WeeklyPlan {
  const blocked = guard(input.sessions)
  if (blocked) return blocked

  const now = input.now ?? new Date()
  const today = dayIndex(now)
  if (today === null) return guardFallback(input.sessions)

  const sessions = toDated(input.sessions)
  const budget = computeBudget(sessions, input.metrics, today)

  // A non-positive CTL means there is no maintenance week to reason about — the
  // whole budget collapses to zero and every figure below it would be a
  // fabrication. The training-day guard almost always catches this first; this
  // is the arithmetic backstop.
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

  // How many sessions the budget can actually hold. Four where it stretches,
  // fewer where it does not — the count follows the athlete's fitness rather
  // than a constant, because a fixed three would force a low-CTL week to be cut
  // into pieces too small to be worth logging.
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

  // `affordable` was computed from the *cheapest* sport; placement may well have
  // chosen dearer ones — a 45-minute combat session starts at 270 AU where a
  // 20-minute run starts at 80. So trim against what was actually placed,
  // dropping the lowest-ranked session until the week's unavoidable minimum fits
  // inside the budget. Trimming after placement rather than guessing before it
  // is what keeps the allocation honest for every sport mix, not just the ones
  // whose minimums happen to be similar.
  const scoreOf = new Map(scores.map((sc) => [sc.sport, sc]))
  const minimumOf = (list: Placement[]) => list.reduce((sum, p) => sum + minSessionLoad(p.sport), 0)

  while (placements.length > 1 && minimumOf(placements) > budget.target) {
    let weakest = placements[0]
    for (const p of placements) {
      if ((scoreOf.get(p.sport)?.total ?? 0) < (scoreOf.get(weakest.sport)?.total ?? 0)) weakest = p
    }
    placements = placements.filter((p) => p !== weakest)
  }

  // Both directions of "the sports cannot meet the budget". The floor binds when
  // one real session already costs more than the week; the ceiling binds when
  // every session that could legally be placed, at its longest and hardest, still
  // falls short.
  const capacityOf = (list: Placement[]) => list.reduce((sum, p) => sum + maxSessionLoad(p.sport), 0)
  const budgetFit: BudgetFit =
    minimumOf(placements) > budget.target
      ? 'below_minimum'
      : capacityOf(placements) < budget.target
        ? 'above_capacity'
        : 'on_target'

  // Split the target across the placements, weighted by score, so the better
  // ranked sport carries the bigger session. Weights are normalised over the
  // placements actually made, which is what keeps the sum equal to the target.
  const weights = placements.map((p) => Math.max(0.01, scoreOf.get(p.sport)?.total ?? 0.01))
  const weightTotal = weights.reduce((a, b) => a + b, 0)

  // Which sport genuinely holds the least outstanding overlap — checked, not
  // assumed, because the reason strings are allowed to say "lowest" only here.
  const lowestDebt = ranked.reduce(
    (min, sc) => Math.min(min, sc.recoveryDebt),
    Number.POSITIVE_INFINITY,
  )

  const suggestions: SuggestedSession[] = placements.map((placement, i) => {
    const share = (weights[i] / weightTotal) * budget.target
    const shaped = shapeSession(placement.sport, share)
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

  // One corrective pass. Rounding minutes to the nearest five inside each
  // sport's clamp leaves the total a little off the budget; nudging the largest
  // session — the one with the most room to absorb it — pulls the week back
  // without disturbing the shape of the rest.
  correctDrift(suggestions, budget.target)

  return {
    status: 'ok',
    budget,
    sessions: suggestions,
    scores: ranked,
    allocatedLoad: suggestions.reduce((sum, s) => sum + s.load, 0),
    budgetFit,
  }
}

/**
 * Pull the allocated total back toward the budget.
 *
 * Each session is shaped independently against its own share, and rounding
 * minutes to a five-minute grid inside the sport's duration clamp leaves the
 * week's total a little off the target. This walks the sessions largest first —
 * the biggest session has the most room to absorb a change, and adjusting it is
 * the least visible correction available — and re-shapes each toward its own
 * load plus whatever drift is still outstanding.
 *
 * Re-shaping rather than nudging the duration is what makes it work at the
 * edges. A session already sitting at its sport's shortest sensible duration
 * cannot get smaller by minutes at all, and a correction that only moved minutes
 * would give up there — precisely in the low-budget weeks where every session is
 * pinned to its floor and the drift is largest. Going back through
 * {@link shapeSession} lets it drop an RPE instead, which is the other axis the
 * load was built from.
 *
 * Two passes, because absorbing drift on one session can overshoot and leave a
 * smaller correction for the next; a second sweep picks that up. It converges or
 * it does not, and the caller sees the result either way in `allocatedLoad`.
 */
function correctDrift(suggestions: SuggestedSession[], target: number): void {
  if (suggestions.length === 0) return

  const byLoad = [...suggestions].sort((a, b) => b.load - a.load)

  for (let pass = 0; pass < 2; pass++) {
    let drift = target - suggestions.reduce((sum, s) => sum + s.load, 0)
    if (drift === 0) return

    for (const session of byLoad) {
      if (drift === 0) break
      const reshaped = shapeSession(session.sport, session.load + drift)
      if (reshaped.load === session.load) continue
      drift -= reshaped.load - session.load
      session.durationMinutes = reshaped.durationMinutes
      session.rpe = reshaped.rpe
      session.load = reshaped.load
    }
  }
}

/** Only reachable from an unparseable `now`; keeps the return type honest. */
function guardFallback(sessions: Session[]): InsufficientData {
  return {
    status: 'insufficient_data',
    trainingDays: countTrainingDays(sessions),
    required: RECOMMENDER_MIN_TRAINING_DAYS,
    reason: 'Could not resolve the current date, so no plan was computed.',
  }
}

/* ------------------------------------------------------------------ */
/* 4. Recovery status                                                 */
/* ------------------------------------------------------------------ */

/**
 * For each of the athlete's sports: trainable now, or the day it becomes
 * advisable and what is holding it back.
 *
 * The window is derived, never flat — see {@link recoveryWindowDays}. The
 * blocker returned is the session producing the *latest* ready date, which is
 * the one an athlete can actually act on: naming any other would have them wait
 * for a session that was never the binding constraint.
 */
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
            // The matrix's own level for the pair. Same-sport reads 0 there by
            // design, so it is reported as the full 3 it is treated as — see
            // `overlapWeight` for why the two differ.
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

/* ------------------------------------------------------------------ */
/* 5. Conflict resolution                                             */
/* ------------------------------------------------------------------ */

/**
 * Two ways out of a flagged session: move it, or swap it.
 *
 * Both preserve something the athlete wanted. Rescheduling preserves the
 * *session* and gives up the day; substituting preserves the *day* and its load
 * — so the week's total still lands on budget — and gives up the sport. Between
 * them they cover both reasons somebody planned that session in the first place,
 * which is why the answer is two options and not one instruction.
 */
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

  /** The worst unresolved constraint against `sport` on `day`. */
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

  // --- Option 1: move it to the nearest day that clears ---
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

  // --- Option 2: a different sport, same day, same load ---
  if (original) {
    const load =
      (plannedSession.durationMinutes ?? 0) * plannedSession.intensity ||
      Math.round(context.metrics.ctl * DAYS_PER_WEEK / MAX_PLAN_SESSIONS)

    const alternatives = context.profile.sports
      .filter((s) => s !== plannedSession.sport)
      .map((s) => ({ sport: s, overlap: overlapWeight(s, original.sport, matrix) }))
      // Only genuinely clear alternatives: anything the matrix rates 2 or 3
      // against the blocking session would simply move the clash to a different
      // pair of sports, which is not a resolution.
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
