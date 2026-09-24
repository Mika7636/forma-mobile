// Calorie estimate from sport MET, duration, RPE and body weight.

import type { SportType } from '../types/session'

interface MetEntry {
  base: number
  perRPE: number
}

const MET_TABLE: Record<SportType, MetEntry> = {
  running: { base: 7, perRPE: 1.2 },
  cycling: { base: 4, perRPE: 1.0 },
  swimming: { base: 5, perRPE: 1.0 },
  combat: { base: 6, perRPE: 0.9 },
  football: { base: 5, perRPE: 0.8 },
  gym: { base: 3, perRPE: 0.6 },
  strength: { base: 3.5, perRPE: 0.6 },
}

export const DEFAULT_WEIGHT_KG = 70

export function estimateCalories(
  sport: SportType,
  durationMinutes: number,
  rpe: number,
  weightKg?: number,
): number {
  const entry = MET_TABLE[sport]
  if (!entry || durationMinutes <= 0) return 0

  const weight = weightKg && weightKg > 0 ? weightKg : DEFAULT_WEIGHT_KG
  const met = entry.base + (rpe - 1) * entry.perRPE
  const calories = met * weight * (durationMinutes / 60)
  return Math.round(calories)
}
