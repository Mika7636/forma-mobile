/**
 * The GPS status chip: a coloured dot and two words, and nothing else.
 *
 * ## Why this replaced a full-screen "Searching for GPS…" state
 *
 * The old tracking screen treated a weak or missing signal as a *mode*: it hid
 * the numbers behind a searching message, which made an indoor session look
 * broken and, worse, made athletes stop and restart a run that was recording
 * their duration perfectly well the whole time.
 *
 * A session is a duration and an effort rating. GPS only adds distance and pace.
 * So signal quality is a *fact to display*, not a state to block on — hence a
 * chip that sits beside the distance figure, never covers anything, and never
 * has an opinion about whether the workout should continue.
 *
 * The same component is used before the run starts (the warm-up indicator on the
 * ready screen), so the colour language is identical on both sides of Start.
 */
import { Text, View } from 'react-native'
import type { GpsQuality } from '../../store/liveTrackingStore'

const DOT_GREEN = '#22c55e'
const DOT_AMBER = '#f59e0b'
const DOT_RED = '#ef4444'
const DOT_GREY = '#9ca3af'

interface Appearance {
  dot: string
  label: string
  /** Text colour — deliberately dimmer than the dot; this is a status, not an alarm. */
  text: string
}

const TRACKING: Record<GpsQuality, Appearance> = {
  acquiring: { dot: DOT_GREY, label: 'GPS searching', text: '#9ca3af' },
  good: { dot: DOT_GREEN, label: 'GPS good', text: '#86efac' },
  weak: { dot: DOT_AMBER, label: 'GPS weak', text: '#fcd34d' },
  lost: { dot: DOT_RED, label: 'GPS lost', text: '#fca5a5' },
}

/** Pre-start wording: the question there is "can I go yet?", not "is it right?". */
const WARMUP: Record<GpsQuality, Appearance> = {
  acquiring: { dot: DOT_GREY, label: 'Finding GPS…', text: '#9ca3af' },
  good: { dot: DOT_GREEN, label: 'GPS ready', text: '#86efac' },
  weak: { dot: DOT_AMBER, label: 'GPS weak', text: '#fcd34d' },
  lost: { dot: DOT_RED, label: 'No GPS signal', text: '#fca5a5' },
}

export default function GpsChip({
  quality,
  variant = 'tracking',
}: {
  quality: GpsQuality
  /** `warmup` uses the pre-start wording; the colours are identical. */
  variant?: 'tracking' | 'warmup'
}) {
  const { dot, label, text } = (variant === 'warmup' ? WARMUP : TRACKING)[quality]
  return (
    <View
      // No entering/exiting animation on purpose: this thing changes state every
      // few seconds on a marginal signal, and a chip that fades in and out next
      // to the distance figure reads as something going wrong.
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        alignSelf: 'center',
        paddingVertical: 4,
        paddingHorizontal: 10,
        borderRadius: 999,
        backgroundColor: '#1f2937',
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: text }}>
        {label}
      </Text>
    </View>
  )
}
