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
