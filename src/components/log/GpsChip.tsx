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
import { COLOR, TINT } from '../../theme/tokens'
import type { GpsQuality } from '../../store/liveTrackingStore'

const DOT_GREEN = COLOR.accent
const DOT_AMBER = COLOR.warn
const DOT_RED = COLOR.danger
const DOT_GREY = COLOR.textMuted

// The chip's *type* colours. Deliberately a tint lighter than the dot beside
// them: the dot is the signal and the words are the caption, and a saturated
// accent at 12pt on a dark ground vibrates. These are the accent, warn and
// danger hues lifted toward the page's text colour until they read as calm
// labels rather than as alerts — all above 7:1 on `surfaceAlt`.
const LIGHT_ACCENT = TINT.green.text
const LIGHT_WARN = TINT.amber.text
const LIGHT_DANGER = TINT.red.text

interface Appearance {
  dot: string
  label: string
  /** Text colour — deliberately dimmer than the dot; this is a status, not an alarm. */
  text: string
}

const TRACKING: Record<GpsQuality, Appearance> = {
  acquiring: { dot: DOT_GREY, label: 'GPS searching', text: COLOR.textMuted },
  good: { dot: DOT_GREEN, label: 'GPS good', text: LIGHT_ACCENT },
  weak: { dot: DOT_AMBER, label: 'GPS weak', text: LIGHT_WARN },
  lost: { dot: DOT_RED, label: 'GPS lost', text: LIGHT_DANGER },
}

/** Pre-start wording: the question there is "can I go yet?", not "is it right?". */
const WARMUP: Record<GpsQuality, Appearance> = {
  acquiring: { dot: DOT_GREY, label: 'Finding GPS…', text: COLOR.textMuted },
  good: { dot: DOT_GREEN, label: 'GPS ready', text: LIGHT_ACCENT },
  weak: { dot: DOT_AMBER, label: 'GPS weak', text: LIGHT_WARN },
  lost: { dot: DOT_RED, label: 'No GPS signal', text: LIGHT_DANGER },
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
        backgroundColor: COLOR.surfaceAlt,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: text }}>
        {label}
      </Text>
    </View>
  )
}
