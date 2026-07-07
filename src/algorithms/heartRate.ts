/**
 * RPE → heart-rate-zone estimation.
 *
 * Borg/ACSM research maps perceived effort (RPE 1–10) onto a percentage of max
 * heart rate. We bucket every two RPE points into one of five training zones
 * and turn the %max band into a concrete bpm range using the user's max HR.
 */

export interface HRZone {
  zone: number
  name: string
  /** e.g. "152 - 171 bpm" */
  hrRange: string
  color: string
  description: string
}

/** Fallback max heart rate (bpm) when the user hasn't set theirs. */
export const DEFAULT_MAX_HR = 190

interface ZoneDef {
  zone: number
  name: string
  lowerPct: number
  upperPct: number
  color: string
  description: string
}

/**
 * The five zones, low → high. Colours are the single source of truth for HR
 * zone colour across the whole app — import {@link hrZoneColor} elsewhere so
 * the dashboard, planner and log preview all agree.
 */
const ZONE_DEFS: ZoneDef[] = [
  { zone: 1, name: 'Recovery', lowerPct: 0.5, upperPct: 0.6, color: '#6b7280', description: 'Very light — active recovery' },
  { zone: 2, name: 'Endurance', lowerPct: 0.6, upperPct: 0.7, color: '#0ea5e9', description: 'Easy aerobic base building' },
  { zone: 3, name: 'Aerobic', lowerPct: 0.7, upperPct: 0.8, color: '#22c55e', description: 'Moderate — improves aerobic capacity' },
  { zone: 4, name: 'Threshold', lowerPct: 0.8, upperPct: 0.9, color: '#f59e0b', description: 'Hard — lactate threshold work' },
  { zone: 5, name: 'Max', lowerPct: 0.9, upperPct: 1.0, color: '#ef4444', description: 'Maximal — short, very hard efforts' },
]

/** Consistent HR-zone colours keyed by zone number. */
export const HR_ZONE_COLORS: Record<number, string> = Object.fromEntries(
  ZONE_DEFS.map((z) => [z.zone, z.color]),
)

/** The colour for a zone number (defaults to Zone 1 grey if out of range). */
export function hrZoneColor(zone: number): string {
  return HR_ZONE_COLORS[zone] ?? ZONE_DEFS[0].color
}

/** Display metadata for a zone, used by the dashboard chart & session rows. */
export interface HRZoneInfo {
  zone: number
  name: string
  description: string
  color: string
}

/** The five zones as display metadata, low → high (single source of truth). */
export const HR_ZONES: HRZoneInfo[] = ZONE_DEFS.map((z) => ({
  zone: z.zone,
  name: z.name,
  description: z.description,
  color: z.color,
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
    color: def.color,
    description: def.description,
  }
}
