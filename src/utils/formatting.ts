export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = minutes % 60
  if (hours === 0) return `${mins}min`
  return `${hours}h ${mins}min`
}

export function formatNumber(value: number, decimals = 0): string {
  return value.toFixed(decimals)
}

export function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1)
}

/**
 * Group a number with thousands separators — "1240" → "1,240".
 *
 * Done by hand rather than via toLocaleString/Intl so the output is identical
 * on every device regardless of the JS engine's locale data.
 */
export function formatThousands(value: number): string {
  const rounded = Math.round(value)
  const sign = rounded < 0 ? '-' : ''
  return sign + String(Math.abs(rounded)).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

/** "1h 30m", "45m", "0m" — compact minutes label for the zone chart. */
export function formatZoneMinutes(minutes: number): string {
  const rounded = Math.round(minutes)
  const h = Math.floor(rounded / 60)
  const m = rounded % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate)
  const diffMinutes = Math.floor((Date.now() - date.getTime()) / (1000 * 60))

  if (diffMinutes < 1) return 'Just now'
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  if (diffDays === 1) return 'Yesterday'
  if (diffDays < 7) return `${diffDays}d ago`

  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}
