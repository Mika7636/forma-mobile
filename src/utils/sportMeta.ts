import { SPORT_OPTIONS } from '../constants/training'
import type { SportType } from '../types/session'
import { PALETTE } from '../theme/tokens'

interface SportMeta {
  label: string
  icon: string
  color: string
}

export const SPORT_META: Record<SportType, SportMeta> = {
  // Shared verbatim with `constants/training.ts`. See the note there.
  running: { label: 'Running', icon: '🏃', color: PALETTE.orange },
  swimming: { label: 'Swimming', icon: '🏊', color: PALETTE.sky },
  combat: { label: 'Combat Sports', icon: '🥊', color: PALETTE.red },
  football: { label: 'Football', icon: '⚽', color: PALETTE.green },
  cycling: { label: 'Cycling', icon: '🚴', color: PALETTE.violet },
  gym: { label: 'Gym / Strength', icon: '💪', color: PALETTE.slate },
  strength: { label: 'Strength Training', icon: '🏋️', color: PALETTE.bronze },
}

/** Fallback for a sport string that isn't in the palette (older/web-written docs). */
const UNKNOWN_SPORT = { color: PALETTE.slate, icon: '🏅', label: 'Training' }

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
