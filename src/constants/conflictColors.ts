// Single source of truth for how a training conflict looks.

import type { Palette } from '../theme/tokens'
import type { Conflict } from '../types/conflict'

export type ConflictSeverity = 'warning' | 'danger'

export interface SeverityStyle {
  severity: ConflictSeverity
  solid: string
  deep: string
  softBg: string
  softBorder: string
  gradient: readonly [string, string]
  icon: string
  title: string
}

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

export function severityStyle(
  severity: ConflictSeverity | undefined,
  colors: Palette,
): SeverityStyle {
  const styles = conflictSeverities(colors)
  return styles[severity ?? 'warning'] ?? styles.warning
}

export function worstSeverity(conflicts: Pick<Conflict, 'severity'>[]): ConflictSeverity {
  return conflicts.some((c) => c.severity === 'danger') ? 'danger' : 'warning'
}

export interface InteractionLevel {
  value: 0 | 1 | 2 | 3
  label: string
  color: string
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

export interface PlannedSeverityStyle extends SeverityStyle {
  dash: readonly [number, number]
}

export function plannedSeverityStyle(
  severity: ConflictSeverity | undefined,
  colors: Palette,
): PlannedSeverityStyle {
  const base = severityStyle(severity, colors)
  return {
    ...base,
    icon: '📅',
    title: base.severity === 'danger' ? 'Planned Conflict — High Risk' : 'Planned Conflict',
    dash: [4, 3],
  }
}
