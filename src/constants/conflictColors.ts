// Single source of truth for how a training conflict looks — everywhere it
// appears (dashboard banner, post-log modal, planner day indicators + chips,
// conflict history, settings). Never hardcode a conflict red/amber elsewhere;
// import from here so the whole "coach" experience stays visually consistent and
// colour-blind safe (every colour is always paired with an icon + text).
import type { Conflict } from '../types/conflict'

export type ConflictSeverity = 'warning' | 'danger'

export interface SeverityStyle {
  severity: ConflictSeverity
  /** Primary solid colour — icons, borders, accents. */
  solid: string
  /** Darker shade for gradient tops and deep accents. */
  deep: string
  /** Very light background tint for cards/rows. */
  softBg: string
  /** Mid-light border tint that reads against the soft background. */
  softBorder: string
  /** Two-stop gradient [deep → solid] for filled banners. */
  gradient: readonly [string, string]
  /** Emoji carrying the meaning alongside the colour. */
  icon: string
  /** Banner/modal headline for this severity. */
  title: string
}

export const CONFLICT_SEVERITY: Record<ConflictSeverity, SeverityStyle> = {
  warning: {
    severity: 'warning',
    solid: '#F59E0B',
    deep: '#B45309',
    softBg: '#FFFBEB',
    softBorder: '#FCD34D',
    gradient: ['#B45309', '#F59E0B'],
    icon: '⚠️',
    title: 'Training Conflict',
  },
  danger: {
    severity: 'danger',
    solid: '#DC2626',
    deep: '#7F1D1D',
    softBg: '#FEF2F2',
    softBorder: '#FCA5A5',
    gradient: ['#7F1D1D', '#DC2626'],
    icon: '🚨',
    title: 'High Injury Risk',
  },
}

/** Style for a severity, defaulting to the gentler "warning" for anything odd. */
export function severityStyle(severity: ConflictSeverity | undefined): SeverityStyle {
  return CONFLICT_SEVERITY[severity ?? 'warning'] ?? CONFLICT_SEVERITY.warning
}

/** The most serious severity among a set of conflicts (danger beats warning). */
export function worstSeverity(conflicts: Pick<Conflict, 'severity'>[]): ConflictSeverity {
  return conflicts.some((c) => c.severity === 'danger') ? 'danger' : 'warning'
}

/**
 * Sport-interaction matrix levels (0–3), colour-coded to line up with the
 * detector: level ≥ 2 raises a "warning" conflict, level 3 a "danger" one — so
 * Medium borrows the warning amber and High the danger red. None is grey (no
 * interference), Low a calm green (minor overlap, never itself a conflict).
 */
export interface InteractionLevel {
  value: 0 | 1 | 2 | 3
  label: string
  color: string
  /** One-line hint shown under the selector. */
  hint: string
}

export const INTERACTION_LEVELS: InteractionLevel[] = [
  { value: 0, label: 'None', color: '#9CA3AF', hint: "These sports don't interfere." },
  { value: 1, label: 'Low', color: '#22C55E', hint: 'Minor overlap — no warnings.' },
  { value: 2, label: 'Medium', color: CONFLICT_SEVERITY.warning.solid, hint: 'Moderate fatigue overlap.' },
  { value: 3, label: 'High', color: CONFLICT_SEVERITY.danger.solid, hint: 'Significant conflict risk.' },
]
