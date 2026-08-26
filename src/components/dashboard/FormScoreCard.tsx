import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
} from 'react-native-reanimated'
import CountUp from './CountUp'
import FormInfoModal from './FormInfoModal'
import { getFormStatus } from '../../algorithms/formScore'
import { COLORS } from '../../constants/theme'
import { TINT } from '../../theme/tokens'

interface HeroStyle {
  /** Two-stop gradient across the card's tinted surface. Deep, not saturated. */
  gradient: readonly [string, string]
  /** The hue as type: the score itself, and the status pill's label. */
  ink: string
  /** Hairline around the card, and the pill's border. */
  border: string
  /** Emoji shown in the status pill. */
  emoji: string
  /** Animated sheen overlay — the Peaked state only. */
  shimmer?: boolean
}

/**
 * How each form state looks.
 *
 * Keyed by the colour name `getFormStatus()` returns, so the thresholds live in
 * the algorithm and this file only decides how each state *looks*.
 *
 * ## Tinted surfaces, not saturated fills
 *
 * This card used to be a bold gradient block — `#15803d → #22c55e` for a healthy
 * form — with white text on it. That was designed against a white page, where a
 * saturated card is the natural way to make a hero stand out. On the dark theme
 * it inverts: the card became the single brightest object on the screen, glaring
 * out of a dark dashboard, and its white-on-green numerals sat at about 2.6:1.
 *
 * So each state is now a *deep* wash of its hue, with the hue returning as the
 * numerals — the score is the brightest thing on the card, which is what a
 * dashboard hero is actually for. See `tokens.tint`.
 */
const HERO_STYLES: Record<string, HeroStyle> = {
  red: {
    gradient: [TINT.red.bg, COLORS.surface],
    ink: TINT.red.text,
    border: TINT.red.border,
    emoji: '🥵',
  },
  orange: {
    gradient: [TINT.orange.bg, COLORS.surface],
    ink: TINT.orange.text,
    border: TINT.orange.border,
    emoji: '🔥',
  },
  yellow: {
    gradient: [TINT.amber.bg, COLORS.surface],
    ink: TINT.amber.text,
    border: TINT.amber.border,
    emoji: '📈',
  },
  lightgreen: {
    gradient: [TINT.teal.bg, COLORS.surface],
    ink: TINT.teal.text,
    border: TINT.teal.border,
    emoji: '⚖️',
  },
  green: {
    gradient: [TINT.green.bg, COLORS.surface],
    ink: TINT.green.text,
    border: TINT.green.border,
    emoji: '⚡',
  },
  brightgreen: {
    gradient: [TINT.green.bg, COLORS.surface],
    ink: TINT.green.text,
    border: TINT.green.border,
    emoji: '🚀',
    shimmer: true,
  },
}

interface FormScoreCardProps {
  form: number
  ctl: number
  atl: number
}

/**
 * The dashboard's hero. A tinted card whose hue and mood track the athlete's
 * current Form (CTL − ATL), with fitness/fatigue readouts alongside.
 */
export default function FormScoreCard({ form, ctl, atl }: FormScoreCardProps) {
  const { status, message, color } = getFormStatus(form)
  const style = HERO_STYLES[color] ?? HERO_STYLES.green
  const rounded = Math.round(form)
  const [infoOpen, setInfoOpen] = useState(false)

  // Settle-in: a subtle scale-up so the hero feels like it lands on the screen.
  const scale = useSharedValue(0.96)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })
  }, [scale])
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  // Peaked only: a light band sweeping across the card, on a slow loop.
  const sheen = useSharedValue(-1)
  useEffect(() => {
    if (!style.shimmer) return
    sheen.value = withDelay(
      600,
      withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false),
    )
  }, [style.shimmer, sheen])
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sheen.value * 420 }, { rotate: '18deg' }],
  }))

  return (
    <Animated.View
      style={[
        {
          borderRadius: 24,
          overflow: 'hidden',
          // The hairline is what separates this card from the page now. On dark
          // a drop shadow has almost nothing to fall on, so it is kept mainly
          // for Android's elevation ordering rather than for visible depth.
          borderWidth: 1,
          borderColor: style.border,
          shadowColor: COLORS.shadow,
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        cardStyle,
      ]}
    >
      <LinearGradient
        colors={style.gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 22 }}
      >
        {style.shimmer ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -40,
                bottom: -40,
                width: 70,
                left: -70,
                backgroundColor: 'rgba(74,222,128,0.10)',
              },
              sheenStyle,
            ]}
          />
        ) : null}

        {/* Info affordance, top-right. */}
        <Pressable
          onPress={() => setInfoOpen(true)}
          hitSlop={12}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}
        >
          <Text style={{ fontSize: 18 }}>ℹ️</Text>
        </Pressable>

        <View style={{ flexDirection: 'row' }}>
          {/* Left: the headline score + status. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 1.6,
                color: COLORS.muted,
              }}
            >
              FORM SCORE
            </Text>

            <CountUp
              value={rounded}
              // Always signed: "+8" reads as form, "8" reads as a bare stat.
              format={(v) => {
                const n = Math.round(v)
                return n > 0 ? `+${n}` : String(n)
              }}
              style={{
                fontSize: 64,
                fontWeight: '800',
                // The hue, as the numerals. This is the accent-coloured figure
                // the tinted surface exists to carry.
                color: style.ink,
                lineHeight: 70,
                marginTop: 2,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: COLORS.surfaceAlt,
                borderWidth: 1,
                borderColor: style.border,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: style.ink }}>
                {status}
              </Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{style.emoji}</Text>
            </View>

            <Text
              style={{
                marginTop: 10,
                fontSize: 13,
                fontWeight: '600',
                color: COLORS.body,
                lineHeight: 18,
              }}
            >
              {message}
            </Text>
          </View>

          {/* Right: stacked fitness / fatigue mini-cards. */}
          <View style={{ marginLeft: 14, justifyContent: 'center' }}>
            <MiniStat label="FITNESS" sublabel="CTL" value={ctl} tone={TINT.sky} />
            <MiniStat label="FATIGUE" sublabel="ATL" value={atl} tone={TINT.red} />
          </View>
        </View>
      </LinearGradient>

      <FormInfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Animated.View>
  )
}

/**
 * A fitness/fatigue readout.
 *
 * Took a translucent white `tint` before, which only works over a saturated
 * fill — over a deep wash it turns into an indistinct grey smear. It now takes a
 * whole tint tone and builds an opaque tile from it, so the two stats stay
 * legible and stay visibly *different from each other*.
 */
function MiniStat({
  label,
  sublabel,
  value,
  tone,
}: {
  label: string
  sublabel: string
  value: number
  tone: { bg: string; border: string; text: string }
}) {
  return (
    <View
      style={{
        width: 104,
        backgroundColor: tone.bg,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: tone.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginVertical: 4,
      }}
    >
      <Text
        style={{
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 1.1,
          color: COLORS.muted,
        }}
      >
        {label}
      </Text>
      <CountUp
        value={value}
        style={{ fontSize: 26, fontWeight: '800', color: tone.text, marginTop: 1 }}
      />
      <Text style={{ fontSize: 10, fontWeight: '600', color: COLORS.subtle }}>
        {sublabel}
      </Text>
    </View>
  )
}
