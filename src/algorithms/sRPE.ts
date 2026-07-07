export function calculateLoadScore(durationMinutes: number, rpe: number): number {
  if (durationMinutes <= 0) {
    throw new Error('durationMinutes must be greater than 0')
  }
  if (rpe < 1 || rpe > 10) {
    throw new Error('rpe must be between 1 and 10')
  }
  return durationMinutes * rpe
}
