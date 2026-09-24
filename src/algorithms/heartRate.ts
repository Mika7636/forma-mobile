// RPE to heart-rate-zone estimation, and the zone table.

import type { Palette } from '../theme/tokens'

export interface HRZone {
  zone: number
  name: string
  hrRange: string
  description: string
}

export const DEFAULT_MAX_HR = 190

interface ZoneDef {
  zone: number
  name: string
  lowerPct: number
  upperPct: number
  description: string
}

const ZONE_DEFS: ZoneDef[] = [
  { zone: 1, name: 'Recovery', lowerPct: 0.5, upperPct: 0.6, description: 'Very light — active recovery' },
  { zone: 2, name: 'Endurance', lowerPct: 0.6, upperPct: 0.7, description: 'Easy aerobic base building' },
  { zone: 3, name: 'Aerobic', lowerPct: 0.7, upperPct: 0.8, description: 'Moderate — improves aerobic capacity' },
  { zone: 4, name: 'Threshold', lowerPct: 0.8, upperPct: 0.9, description: 'Hard — lactate threshold work' },
  { zone: 5, name: 'Max', lowerPct: 0.9, upperPct: 1.0, description: 'Maximal — short, very hard efforts' },
]

export function hrZoneColor(zone: number, colors: Palette): string {
  return colors.zone[Math.min(Math.max(zone, 1), colors.zone.length) - 1]
}

export interface HRZoneInfo {
  zone: number
  name: string
  description: string
}

export const HR_ZONES: HRZoneInfo[] = ZONE_DEFS.map((z) => ({
  zone: z.zone,
  name: z.name,
  description: z.description,
}))

export function hrZoneInfo(zone: number): HRZoneInfo {
  return HR_ZONES.find((z) => z.zone === zone) ?? HR_ZONES[0]
}

function zoneForRpe(rpe: number): ZoneDef {
  const index = Math.min(ZONE_DEFS.length - 1, Math.max(0, Math.ceil(rpe / 2) - 1))
  return ZONE_DEFS[index]
}

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
