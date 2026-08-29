import { SPORT_OPTIONS } from '../constants/training'
import type { SportType } from '../types/session'
import type { Palette } from '../theme/tokens'
interface SportMeta {
  label: string
  icon: string
}

export const SPORT_META: Record<SportType, SportMeta> = {
  running: { label: 'Running', icon: '🏃' },
  swimming: { label: 'Swimming', icon: '🏊' },
  combat: { label: 'Combat Sports', icon: '🥊' },
  football: { label: 'Football', icon: '⚽' },
  cycling: { label: 'Cycling', icon: '🚴' },
  gym: { label: 'Gym / Strength', icon: '💪' },
  strength: { label: 'Strength Training', icon: '🏋️' },
}

/** Fallback for a sport string we don't recognise (older/web-written docs). */
const UNKNOWN_SPORT = { icon: '🏅', label: 'Training' }

/**
 * How a sport is drawn anywhere in the app: accent colour, emoji, display name.
 *
 * The **one** place a sport's colour is resolved, so a calendar dot, a planner
 * chip and a picker card can never disagree. The colour comes from the active
 * palette rather than from a constant, because the sport hues differ between
 * light and dark — see `Palette.sport`.
 */
export function sportVisual(sport: SportType, colors: Palette) {
  const option = SPORT_OPTIONS.find((o) => o.value === sport)
  const meta = SPORT_META[sport]
  return {
    color: colors.sport[sport as keyof Palette['sport']] ?? colors.palette.slate,
    icon: option?.icon ?? meta?.icon ?? UNKNOWN_SPORT.icon,
    label: option?.label ?? meta?.label ?? sport ?? UNKNOWN_SPORT.label,
  }
}
