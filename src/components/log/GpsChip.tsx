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
import { useTheme } from '../../theme/ThemeProvider'
import type { Palette } from '../../theme/tokens'


// The chip's *type* colours. Deliberately a tint lighter than the dot beside
// them: the dot is the signal and the words are the caption, and a saturated
// accent at 12pt on a dark ground vibrates. These are the accent, warn and
// danger hues lifted toward the page's text colour until they read as calm
// labels rather than as alerts — all above 7:1 on `surfaceAlt`.

interface Appearance {
  dot: string
  label: string
  /** Text colour — deliberately dimmer than the dot; this is a status, not an alarm. */
  text: string
}

function tracking(colors: Palette): Record<GpsQuality, Appearance> {
  return {
    acquiring: { dot: colors.textMuted, label: 'GPS searching', text: colors.textMuted },
    good: { dot: colors.accent, label: 'GPS good', text: colors.tint.green.text },
    weak: { dot: colors.warn, label: 'GPS weak', text: colors.tint.amber.text },
    lost: { dot: colors.danger, label: 'GPS lost', text: colors.tint.red.text },
  }
}

/** Pre-start wording: the question there is "can I go yet?", not "is it right?". */
function warmup(colors: Palette): Record<GpsQuality, Appearance> {
  return {
    acquiring: { dot: colors.textMuted, label: 'Finding GPS…', text: colors.textMuted },
    good: { dot: colors.accent, label: 'GPS ready', text: colors.tint.green.text },
    weak: { dot: colors.warn, label: 'GPS weak', text: colors.tint.amber.text },
    lost: { dot: colors.danger, label: 'No GPS signal', text: colors.tint.red.text },
  }
}

export default function GpsChip({
  quality,
  variant = 'tracking',
}: {
  quality: GpsQuality
  /** `warmup` uses the pre-start wording; the colours are identical. */
  variant?: 'tracking' | 'warmup'
}) {
  const { colors } = useTheme()

  const { dot, label, text } = (variant === 'warmup' ? warmup(colors) : tracking(colors))[quality]
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
        backgroundColor: colors.surfaceAlt,
      }}
    >
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: dot }} />
      <Text style={{ marginLeft: 6, fontSize: 12, fontWeight: '700', color: text }}>
        {label}
      </Text>
    </View>
  )
}
