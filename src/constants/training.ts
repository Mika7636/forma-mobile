import type { SportType } from '../types/session'
import type { ConflictSensitivity, ExperienceLevel } from '../types/user'
export interface SportOption {
  value: SportType
  label: string
  icon: string
}

/**
 * The sports the pickers offer, in display order.
 *
 * Deliberately colourless. Each sport's accent lives in the palette
 * (`colors.sport`) because it has to differ between light and dark — the dark
 * set is tuned to sit on near-black and is unreadable on white. A colour baked
 * into this array would be frozen at import time and would be wrong in one of
 * the two themes.
 *
 * Read the accent with `sportVisual(sport, colors)`, which is also the single
 * place the assignment is defined. This file and `utils/sportMeta.ts` used to
 * carry two *different* colour lists — running was green in one and orange in
 * the other — so the same run showed up in two colours depending on the screen.
 */
export const SPORT_OPTIONS: SportOption[] = [
  { value: 'running', label: 'Running', icon: '🏃' },
  { value: 'swimming', label: 'Swimming', icon: '🏊' },
  { value: 'combat', label: 'Combat Sports', icon: '🥊' },
  { value: 'football', label: 'Football', icon: '⚽' },
  { value: 'cycling', label: 'Cycling', icon: '🚴' },
  { value: 'gym', label: 'Gym / Strength', icon: '💪' },
  { value: 'strength', label: 'Strength Training', icon: '🏋️' },
]

export interface ExperienceOption {
  value: ExperienceLevel
  label: string
  description: string
  icon: string
  /** Multiplier applied to weekly minutes when seeding the fitness baseline. */
  multiplier: number
}

export const EXPERIENCE_OPTIONS: ExperienceOption[] = [
  {
    value: 'beginner',
    label: 'Beginner',
    description: 'New to structured training. Less than 1 year experience.',
    icon: '🌱',
    multiplier: 4,
  },
  {
    value: 'intermediate',
    label: 'Intermediate',
    description: 'Train consistently. 1–3 years of structured training.',
    icon: '🌿',
    multiplier: 5,
  },
  {
    value: 'advanced',
    label: 'Advanced',
    description: 'Compete or train at high intensity. 3+ years.',
    icon: '🌳',
    multiplier: 6,
  },
]

export interface ConflictOption {
  value: ConflictSensitivity
  label: string
  description: string
}

export const CONFLICT_OPTIONS: ConflictOption[] = [
  { value: 'relaxed', label: 'Relaxed', description: 'Only warn me about extreme overload' },
  { value: 'balanced', label: 'Balanced', description: 'Recommended for most athletes' },
  { value: 'strict', label: 'Strict', description: 'Warn me at the slightest fatigue risk' },
]

export interface BudgetTier {
  label: string
  /** Inclusive lower bound (hours/week) at which this tier becomes active. */
  min: number
}

// Ordered low → high; the active tier is the last one whose `min` <= value.
export const BUDGET_TIERS: BudgetTier[] = [
  { label: 'Casual', min: 2 },
  { label: 'Active', min: 6 },
  { label: 'Serious', min: 11 },
  { label: 'Elite', min: 19 },
]

export const BUDGET_MIN = 2
export const BUDGET_MAX = 30
export const DEFAULT_BUDGET_HOURS = 8

export function getBudgetTier(hours: number): BudgetTier {
  return [...BUDGET_TIERS].reverse().find((tier) => hours >= tier.min) ?? BUDGET_TIERS[0]
}

const EXPERIENCE_MULTIPLIER: Record<ExperienceLevel, number> = {
  beginner: 4,
  intermediate: 5,
  advanced: 6,
}

/** Seed the starting weekly training load (AU) from budget + experience. */
export function calculateBaselineWeeklyLoad(
  weeklyBudgetHours: number,
  experience: ExperienceLevel,
): number {
  return Math.round(weeklyBudgetHours * 60 * EXPERIENCE_MULTIPLIER[experience])
}

type BudgetBand = 'low' | 'medium' | 'high' | 'elite'

// Budget tiers map onto the CTL-baseline bands: Casual(2–5)=low, Active(6–10)=
// medium, Serious(11–18)=high, Elite(19+)=elite.
const BUDGET_BAND: Record<string, BudgetBand> = {
  Casual: 'low',
  Active: 'medium',
  Serious: 'high',
  Elite: 'elite',
}

// Starting CTL ("fitness") by experience × budget band. Bold cells are the
// product-specified values; the rest are extrapolated to keep every row/column
// monotonic (a fitter profile never seeds a lower baseline).
//   beginner     low 20  medium 30  (high/elite extrapolated)
//   intermediate low 35  medium 45  high 55  (elite extrapolated)
//   advanced     medium 60  high 75  elite 90  (low extrapolated)
const BASELINE_CTL: Record<ExperienceLevel, Record<BudgetBand, number>> = {
  beginner: { low: 20, medium: 30, high: 40, elite: 45 },
  intermediate: { low: 35, medium: 45, high: 55, elite: 65 },
  advanced: { low: 50, medium: 60, high: 75, elite: 90 },
}

/**
 * Seed the starting CTL ("fitness") from budget + experience so a brand-new
 * user's Form Score isn't dragged deeply negative before the 42-day CTL average
 * has real data. Consumed by {@link calculateCTL}'s baseline blend.
 */
export function calculateBaselineCTL(
  weeklyBudgetHours: number,
  experience: ExperienceLevel,
): number {
  const band = BUDGET_BAND[getBudgetTier(weeklyBudgetHours).label] ?? 'low'
  return BASELINE_CTL[experience][band]
}

/**
 * Pairwise sport-conflict weights seeded onto every new user. Keys are
 * underscore-joined sport pairs; higher values mean stronger interference.
 */
export const DEFAULT_SPORT_INTERACTIONS: Record<string, number> = {
  combat_football: 3,
  combat_running: 3,
  combat_swimming: 1,
  cycling_running: 2,
  cycling_swimming: 1,
  football_running: 2,
  football_swimming: 1,
  running_swimming: 1,
  gym_running: 2,
  gym_combat: 2,
  gym_football: 2,
  gym_cycling: 1,
  gym_swimming: 1,
  // Strength training overlaps heavily with the gym and loads the same muscle
  // groups as the impact sports. Keys are alphabetically sorted to match the
  // canonical pairKey() lookup in conflictDetector.
  gym_strength: 3,
  running_strength: 2,
  combat_strength: 2,
  football_strength: 2,
  cycling_strength: 1,
  strength_swimming: 1,
}
