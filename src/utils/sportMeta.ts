import { SPORT_OPTIONS } from '../constants/training'
import type { SportType } from '../types/session'

interface SportMeta {
  label: string
  icon: string
  color: string
}

export const SPORT_META: Record<SportType, SportMeta> = {
  running: { label: 'Running', icon: '🏃', color: '#f97316' },
  swimming: { label: 'Swimming', icon: '🏊', color: '#0ea5e9' },
  combat: { label: 'Combat Sports', icon: '🥊', color: '#ef4444' },
  football: { label: 'Football', icon: '⚽', color: '#22c55e' },
  cycling: { label: 'Cycling', icon: '🚴', color: '#8b5cf6' },
  gym: { label: 'Gym / Strength', icon: '💪', color: '#6b7280' },
  strength: { label: 'Strength Training', icon: '🏋️', color: '#b45309' },
}

/** Fallback for a sport string that isn't in the palette (older/web-written docs). */
const UNKNOWN_SPORT = { color: '#6B7280', icon: '🏅', label: 'Training' }

/**
 * How a sport is drawn anywhere in the app: accent colour, emoji, display name.
 *
 * Colours come from {@link SPORT_OPTIONS} — the palette the sport pickers use —
 * so a calendar dot, a planner chip and a picker card all agree on what
 * "running green" means. {@link SPORT_META} is the fallback for anything the
 * picker doesn't list.
 */
export function sportVisual(sport: SportType) {
  const option = SPORT_OPTIONS.find((o) => o.value === sport)
  const meta = SPORT_META[sport]
  return {
    color: option?.accent ?? meta?.color ?? UNKNOWN_SPORT.color,
    icon: option?.icon ?? meta?.icon ?? UNKNOWN_SPORT.icon,
    label: option?.label ?? meta?.label ?? sport ?? UNKNOWN_SPORT.label,
  }
}
