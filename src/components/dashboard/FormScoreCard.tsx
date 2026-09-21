import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native'
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
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, type FormTone, type HeroPanel, type Tint } from '../../theme/tokens'
/**
 * The emoji for each form state.
 *
 * All that is left of what used to be a full per-state style table with a
 * `scheme === 'light'` branch in the middle of it. The two themes paint this
 * card differently enough that the branch looked unavoidable — but the
 * difference is entirely in *values*, so it moved into `Palette.hero` where the
 * rest of the theme's differences live, and this component went back to having
 * one styling path. See the commentary on `hero` in `theme/tokens`.
 */
const HERO_EMOJI: Record<FormTone, string> = {
  red: '🥵',
  orange: '🔥',
  yellow: '📈',
  lightgreen: '⚖️',
  green: '⚡',
  brightgreen: '🚀',
}

/** The Peaked state alone gets the sweeping sheen. */
const SHIMMER_TONE: FormTone = 'brightgreen'

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
  const { colors } = useTheme()

  const { status, message, color } = getFormStatus(form, ctl)
  const style = colors.hero[color] ?? colors.hero.green
  const emoji = HERO_EMOJI[color] ?? HERO_EMOJI.green
  const shimmer = color === SHIMMER_TONE
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
    if (!shimmer) return
    sheen.value = withDelay(
      600,
      withRepeat(withTiming(1, { duration: 1800, easing: Easing.linear }), -1, false),
    )
  }, [shimmer, sheen])
  const sheenStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: sheen.value * 420 }, { rotate: '18deg' }],
  }))

  return (
    <Animated.View
      style={[
        {
          borderRadius: RADIUS.xl,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: style.border,
          // The palette's own floating elevation, not a hardcoded one. This was
          // `shadowOpacity: 0.45` in black — right on dark, where a shadow has
          // almost nothing to fall on and is mostly there for Android's z
          // ordering, and a visible smudge under the card on light. The two
          // themes need different numbers here, which is exactly what the token
          // is for.
          ...colors.shadowFloating,
        },
        cardStyle,
      ]}
    >
      <LinearGradient
        colors={[style.gradient[0], style.gradient[1]]}
        start={colors.heroGradient.start}
        end={colors.heroGradient.end}
        style={{ padding: 22 }}
      >
        {/* The static gloss: a diagonal wash of light across the whole card,
            under everything else. Two gradient stops a few percent apart make a
            rectangle; this is what makes the card read as a lit surface. Fully
            transparent on dark, where the fill is already a wash and a white
            gloss would only grey it — see `heroGloss`. */}
        <LinearGradient
          pointerEvents="none"
          colors={[colors.heroGloss[0], colors.heroGloss[1]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        {shimmer ? (
          <Animated.View
            pointerEvents="none"
            style={[
              {
                position: 'absolute',
                top: -40,
                bottom: -40,
                width: 70,
                left: -70,
                backgroundColor: colors.heroSheen,
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
            <Panel panel={colors.heroPanel} style={{ alignSelf: 'flex-start' }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  letterSpacing: 1.6,
                  color: colors.heroLabel,
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
                  // White on the scrim, not on the fill. See `HeroPanel`.
                  color: style.ink,
                  lineHeight: 70,
                  marginTop: 2,
                }}
              />
            </Panel>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: style.chipBg,
                borderWidth: 1,
                borderColor: style.chipBorder,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: style.chipInk }}>
                {status}
              </Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{emoji}</Text>
            </View>

            <Panel panel={colors.heroPanel} style={{ marginTop: 10, alignSelf: 'flex-start' }}>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.heroBody,
                  lineHeight: 18,
                }}
              >
                {message}
              </Text>
            </Panel>
          </View>

          {/* Right: stacked fitness / fatigue mini-cards.
              Top-aligned below the info affordance rather than vertically
              centred. Centring put the first tile's corner underneath the
              absolutely-positioned ℹ️ — invisible while the tiles were a dark
              scrim, and unmistakable now that they are frosted white. The
              offset is the button's own footprint plus its inset. */}
          <View style={{ marginLeft: 14, marginTop: 30 }}>
            <MiniStat label="FITNESS" sublabel="CTL" value={ctl} tone={colors.heroStat.fitness} />
            <MiniStat label="FATIGUE" sublabel="ATL" value={atl} tone={colors.heroStat.fatigue} />
          </View>
        </View>
      </LinearGradient>

      <FormInfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Animated.View>
  )
}

/**
 * The scrim a hero readout sits on.
 *
 * On light this is a dark wash that buys white type its contrast back over a
 * vibrant fill; on dark every value in `heroPanel` is zero or fully
 * transparent, so this renders as a bare `View` with no background, no border
 * and no inset — which is exactly what the dark card looked like before panels
 * existed. One code path, two appearances, no `scheme ===` branch.
 */
function Panel({
  panel,
  style,
  children,
}: {
  panel: HeroPanel
  style?: ViewStyle
  children: ReactNode
}) {
  return (
    <View
      style={[
        {
          backgroundColor: panel.bg,
          borderWidth: panel.borderWidth,
          borderColor: panel.border,
          borderRadius: panel.radius,
          paddingHorizontal: panel.pad,
          paddingVertical: panel.pad > 0 ? panel.pad - 4 : 0,
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/**
 * A fitness/fatigue readout, sitting *inside* the hero's fill.
 *
 * Takes its whole tone from `colors.heroStat` rather than reaching for a page
 * token, because what is behind it is the hero, not the page. In both themes
 * the tile is opaque and carries its own hue — sky for fitness, red for
 * fatigue — which is what lets the pair be told apart at a glance rather than
 * by reading their labels. Dark's is a darker panel on a dark wash, light's is
 * white paper on a vibrant one.
 *
 * The labels come from `heroStatChrome`, not `heroLabel`: `heroLabel` is picked
 * for the scrim the rest of the card sits on, and these tiles are not on it.
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
  tone: Tint
}) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        width: 104,
        backgroundColor: tone.bg,
        borderRadius: RADIUS.md,
        borderWidth: 1,
        borderColor: tone.border,
        paddingHorizontal: 12,
        paddingVertical: 10,
        marginVertical: 4,
        overflow: 'hidden',
      }}
    >
      {/* The inner highlight: a single lit pixel along the top edge, which is
          what separates a *translucent* tile from a hole cut in the card. RN
          has no inset shadow, so it is drawn as a hairline child. Both themes
          run opaque tiles now, so `highlight` is transparent in both and this
          renders as nothing — it stays because the frosted treatment is a
          plausible thing to want back, and then the pixel is not optional. */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 1,
          backgroundColor: colors.heroStatChrome.highlight,
        }}
      />
      <Text
        style={{
          fontSize: 10,
          fontWeight: '800',
          letterSpacing: 1.1,
          // Not `heroLabel`: that ink is picked for the dark scrim the rest of
          // the card sits on, and these tiles are an opaque surface of their
          // own. See `heroStatChrome`.
          color: colors.heroStatChrome.label,
        }}
      >
        {label}
      </Text>
      <CountUp
        value={value}
        style={{ fontSize: 26, fontWeight: '800', color: tone.text, marginTop: 1 }}
      />
      {/* Full strength, deliberately. Dimming this to 70% would look right and
          drop it under the floor — the audited token is the colour, and an
          opacity applied on top of it is outside what the gate can see. The
          label / value hierarchy is carried by size and weight instead. */}
      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.heroStatChrome.label }}>
        {sublabel}
      </Text>
    </View>
  )
}
