// Single source of truth for how a training conflict looks — everywhere it
// appears (dashboard banner, post-log modal, planner day indicators + chips,
// conflict history, settings). Never hardcode a conflict red/amber elsewhere;
// import from here so the whole "coach" experience stays visually consistent and
// colour-blind safe (every colour is always paired with an icon + text).
//
// Everything colour-bearing here is a *function of the active palette* rather
// than a constant. A module-level `CONFLICT_SEVERITY` would freeze whichever
// theme happened to be current when this module was first evaluated, which is
// precisely the "one banner kept its old colour after switching to light" bug.
import type { Palette } from '../theme/tokens'
import type { Conflict } from '../types/conflict'

export type ConflictSeverity = 'warning' | 'danger'

export interface SeverityStyle {
  severity: ConflictSeverity
  /** Primary solid colour — icons, left rails, dots, borders. */
  solid: string
  /**
   * The severity as *type*, printed on {@link softBg}.
   *
   * On the light theme this is a darker shade of `solid` (amber → `#B45309`).
   * On dark it goes the other way: `softBg` is a dark tint there, so legible
   * type on it is a *lighter* amber. The name is kept because every call site
   * already says `style.deep` and they all mean the same thing — "the readable
   * one" — but it is not literally deeper in both themes.
   */
  deep: string
  /** Background tint for cards/rows. One step off the surface. */
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

/** Both severities in the given theme. */
export function conflictSeverities(colors: Palette): Record<ConflictSeverity, SeverityStyle> {
  return {
    warning: {
      severity: 'warning',
      solid: colors.warn,
      deep: colors.warnText,
      softBg: colors.warnSoft,
      softBorder: colors.warnBorder,
      gradient: [colors.warnSoft, colors.warnBorder],
      icon: '⚠️',
      title: 'Training Conflict',
    },
    danger: {
      severity: 'danger',
      solid: colors.danger,
      deep: colors.dangerText,
      softBg: colors.dangerSoft,
      softBorder: colors.dangerBorder,
      gradient: [colors.dangerSoft, colors.dangerBorder],
      icon: '🚨',
      title: 'High Injury Risk',
    },
  }
}

/** Style for a severity, defaulting to the gentler "warning" for anything odd. */
export function severityStyle(
  severity: ConflictSeverity | undefined,
  colors: Palette,
): SeverityStyle {
  const styles = conflictSeverities(colors)
  return styles[severity ?? 'warning'] ?? styles.warning
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

export function interactionLevels(colors: Palette): InteractionLevel[] {
  const severities = conflictSeverities(colors)
  return [
    {
      value: 0,
      label: 'None',
      color: colors.palette.slate,
      hint: "These sports don't interfere.",
    },
    {
      value: 1,
      label: 'Low',
      color: colors.palette.green,
      hint: 'Minor overlap — no warnings.',
    },
    {
      value: 2,
      label: 'Medium',
      color: severities.warning.solid,
      hint: 'Moderate fatigue overlap.',
    },
    {
      value: 3,
      label: 'High',
      color: severities.danger.solid,
      hint: 'Significant conflict risk.',
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Planned conflicts                                                   */
/* ------------------------------------------------------------------ */

/**
 * How a **planned** conflict is drawn, as a delta on its logged sibling.
 *
 * ## The problem this solves
 *
 * The two things mean different things and must not be confused. "Training
 * conflict" is a report on training the athlete has already done — it is a fact,
 * and the only thing left to do is manage the recovery. "Planned conflict" is a
 * prediction about a week that hasn't happened, and it is *free to fix*: drag
 * one session, and it's gone. Painting them identically would make the second
 * read as an accusation about something the athlete hasn't even done yet.
 *
 * ## Why it keeps the severity hue
 *
 * The obvious move is a third colour, and it is the wrong one. Severity is the
 * information the colour carries everywhere else in the app — amber is "watch
 * this", red is "this one hurts" — and a planned danger is still a danger. Give
 * planned conflicts their own hue and severity stops being legible in half the
 * places it appears.
 *
 * So the hue stays and the *chrome* changes: a dashed edge rather than a solid
 * one (the visual language of "provisional" everywhere from Figma to Gantt
 * charts), a calendar glyph rather than a warning triangle, and a title that
 * says the word. Three non-colour channels, which is also what keeps it working
 * for a colour-blind athlete and in greyscale.
 *
 * The redundancy is load-bearing rather than belt-and-braces: Android silently
 * renders `borderStyle: 'dashed'` as solid whenever the view also has a border
 * radius, which is every surface here. The glyph and the word are what survive
 * that, so no planned-conflict surface may rely on the dashes alone.
 */
export interface PlannedSeverityStyle extends SeverityStyle {
  /** Dash pattern for borders and strokes. Solid conflicts pass no dashes. */
  dash: readonly [number, number]
}

export function plannedSeverityStyle(
  severity: ConflictSeverity | undefined,
  colors: Palette,
): PlannedSeverityStyle {
  const base = severityStyle(severity, colors)
  return {
    ...base,
    // 📅 rather than ⚠️/🚨: the glyph itself says "this is about the calendar".
    icon: '📅',
    title: base.severity === 'danger' ? 'Planned Conflict — High Risk' : 'Planned Conflict',
    dash: [4, 3],
  }
}
