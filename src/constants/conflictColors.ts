// Single source of truth for how a training conflict looks — everywhere it
// appears (dashboard banner, post-log modal, planner day indicators + chips,
// conflict history, settings). Never hardcode a conflict red/amber elsewhere;
// import from here so the whole "coach" experience stays visually consistent and
// colour-blind safe (every colour is always paired with an icon + text).
import { COLORS } from './theme'
import { PALETTE } from '../theme/tokens'
import type { Conflict } from '../types/conflict'

export type ConflictSeverity = 'warning' | 'danger'

export interface SeverityStyle {
  severity: ConflictSeverity
  /** Primary solid colour — icons, left rails, dots, borders. */
  solid: string
  /**
   * The severity as *type*, printed on {@link softBg}.
   *
   * On the light theme this was a darker shade of `solid` (amber → `#B45309`).
   * On dark it has to go the other way: `softBg` is now a dark tint, so legible
   * type on it is a *lighter* amber. The name is kept because every call site
   * already says `style.deep` and they all mean the same thing — "the readable
   * one" — but it is no longer literally deeper.
   */
  deep: string
  /** Background tint for cards/rows. A dark tint, one step off the surface. */
  softBg: string
  /** Border tint that reads against the soft background. */
  softBorder: string
  /** Two-stop gradient for filled banners. */
  gradient: readonly [string, string]
  /** Emoji carrying the meaning alongside the colour. */
  icon: string
  /** Banner/modal headline for this severity. */
  title: string
}

export const CONFLICT_SEVERITY: Record<ConflictSeverity, SeverityStyle> = {
  warning: {
    severity: 'warning',
    solid: COLORS.warning,
    deep: COLORS.warningDeep,
    softBg: COLORS.warningSoft,
    softBorder: COLORS.warningBorder,
    gradient: [COLORS.warningSoft, COLORS.warningBorder],
    icon: '⚠️',
    title: 'Training Conflict',
  },
  danger: {
    severity: 'danger',
    solid: COLORS.danger,
    deep: COLORS.dangerDeep,
    softBg: COLORS.dangerSoft,
    softBorder: COLORS.dangerBorder,
    gradient: [COLORS.dangerSoft, COLORS.dangerBorder],
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
  { value: 0, label: 'None', color: PALETTE.slate, hint: "These sports don't interfere." },
  { value: 1, label: 'Low', color: PALETTE.green, hint: 'Minor overlap — no warnings.' },
  { value: 2, label: 'Medium', color: CONFLICT_SEVERITY.warning.solid, hint: 'Moderate fatigue overlap.' },
  { value: 3, label: 'High', color: CONFLICT_SEVERITY.danger.solid, hint: 'Significant conflict risk.' },
]
