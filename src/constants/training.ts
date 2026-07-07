import type { SportType } from '../types/session'
import type { ConflictSensitivity, ExperienceLevel } from '../types/user'

export interface SportOption {
  value: SportType
  label: string
  icon: string
  /** Accent color used for the selected state of the sport card. */
  accent: string
}

// Selection-UI accents for the sport cards (onboarding + settings).
export const SPORT_OPTIONS: SportOption[] = [
  { value: 'running', label: 'Running', icon: '🏃', accent: '#22c55e' },
  { value: 'swimming', label: 'Swimming', icon: '🏊', accent: '#0ea5e9' },
  { value: 'combat', label: 'Combat Sports', icon: '🥊', accent: '#ef4444' },
  { value: 'football', label: 'Football', icon: '⚽', accent: '#f59e0b' },
  { value: 'cycling', label: 'Cycling', icon: '🚴', accent: '#8b5cf6' },
  { value: 'gym', label: 'Gym / Strength', icon: '💪', accent: '#6b7280' },
  { value: 'strength', label: 'Strength Training', icon: '🏋️', accent: '#b45309' },
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
