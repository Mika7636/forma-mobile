/**
 * RPE → heart-rate-zone estimation.
 *
 * Borg/ACSM research maps perceived effort (RPE 1–10) onto a percentage of max
 * heart rate. We bucket every two RPE points into one of five training zones
 * and turn the %max band into a concrete bpm range using the user's max HR.
 */
import type { Palette } from '../theme/tokens'

export interface HRZone {
  zone: number
  name: string
  /** e.g. "152 - 171 bpm" */
  hrRange: string
  description: string
}

/** Fallback max heart rate (bpm) when the user hasn't set theirs. */
export const DEFAULT_MAX_HR = 190

interface ZoneDef {
  zone: number
  name: string
  lowerPct: number
  upperPct: number
  description: string
}

/**
 * The five zones, low → high. Thresholds and wording only — {@link hrZoneColor}
 * is the single source of truth for what a zone looks like, so the dashboard,
 * planner and log preview all agree.
 */
const ZONE_DEFS: ZoneDef[] = [
  { zone: 1, name: 'Recovery', lowerPct: 0.5, upperPct: 0.6, description: 'Very light — active recovery' },
  { zone: 2, name: 'Endurance', lowerPct: 0.6, upperPct: 0.7, description: 'Easy aerobic base building' },
  { zone: 3, name: 'Aerobic', lowerPct: 0.7, upperPct: 0.8, description: 'Moderate — improves aerobic capacity' },
  { zone: 4, name: 'Threshold', lowerPct: 0.8, upperPct: 0.9, description: 'Hard — lactate threshold work' },
  { zone: 5, name: 'Max', lowerPct: 0.9, upperPct: 1.0, description: 'Maximal — short, very hard efforts' },
]

/**
 * The colour for a zone number, in the active theme.
 *
 * Takes the palette rather than owning a colour list. The zone hues have to
 * differ between light and dark — the dark set is tuned for a near-black ground
 * and washes out on white — so a module-level map here would be frozen at
 * import time and wrong in one of the two themes. `colors.zone` is indexed
 * 0-based; zones are numbered from 1.
 */
export function hrZoneColor(zone: number, colors: Palette): string {
  return colors.zone[Math.min(Math.max(zone, 1), colors.zone.length) - 1]
}

/** Display metadata for a zone, used by the dashboard chart & session rows. */
export interface HRZoneInfo {
  zone: number
  name: string
  description: string
}

/** The five zones as display metadata, low → high (single source of truth). */
export const HR_ZONES: HRZoneInfo[] = ZONE_DEFS.map((z) => ({
  zone: z.zone,
  name: z.name,
  description: z.description,
}))

/** Name + description + colour for a zone number (defaults to Zone 1). */
export function hrZoneInfo(zone: number): HRZoneInfo {
  return HR_ZONES.find((z) => z.zone === zone) ?? HR_ZONES[0]
}

/** Map an RPE (1–10) onto its zone definition. */
function zoneForRpe(rpe: number): ZoneDef {
  const index = Math.min(ZONE_DEFS.length - 1, Math.max(0, Math.ceil(rpe / 2) - 1))
  return ZONE_DEFS[index]
}

/**
 * Estimate the heart-rate zone for a given RPE. Uses the user's max HR to turn
 * the zone's %max band into a bpm range; defaults to 190 bpm when unknown.
 */
export function estimateHRZone(rpe: number, maxHR?: number): HRZone {
  const max = maxHR && maxHR > 0 ? maxHR : DEFAULT_MAX_HR
  const def = zoneForRpe(rpe)
  const lower = Math.round(max * def.lowerPct)
  const upper = Math.round(max * def.upperPct)
  return {
    zone: def.zone,
    name: def.name,
    hrRange: `${lower} - ${upper} bpm`,
    description: def.description,
  }
}
