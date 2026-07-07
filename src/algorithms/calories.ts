import type { SportType } from '../types/session'

/**
 * Per-sport MET (metabolic equivalent) model. `base` is the MET cost at RPE 1
 * (very easy); each RPE point above that adds `perRPE`. So a sport's MET scales
 * linearly with perceived effort, e.g. running spans 7 MET (RPE 1) → 18 MET
 * (RPE 10). Values are derived from the Compendium of Physical Activities.
 */
interface MetEntry {
  base: number
  perRPE: number
}

const MET_TABLE: Record<SportType, MetEntry> = {
  running: { base: 7, perRPE: 1.2 }, // 7–18 MET
  cycling: { base: 4, perRPE: 1.0 }, // 4–13 MET
  swimming: { base: 5, perRPE: 1.0 }, // 5–14 MET
  combat: { base: 6, perRPE: 0.9 }, // 6–14 MET (boxing/MMA)
  football: { base: 5, perRPE: 0.8 }, // 5–12 MET
  gym: { base: 3, perRPE: 0.6 }, // 3–9 MET
  strength: { base: 3.5, perRPE: 0.6 }, // 3.5–8.9 MET (resistance training)
}

/** Fallback body weight (kg) when the user hasn't shared theirs. */
export const DEFAULT_WEIGHT_KG = 70

/**
 * Estimate calories burned from sport, duration, RPE and body weight.
 *
 *   calories = MET × weight(kg) × hours
 *   MET      = base + (rpe − 1) × perRPE
 *
 * Higher RPE → higher MET → more calories. Defaults to 70 kg when weight is
 * unknown. Rounded to the nearest whole calorie.
 */
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
