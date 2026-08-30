import { useEffect, useState, type ReactNode } from 'react'
import { Pressable, Text, View, type ViewStyle } from 'react-native'
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
import type { FormTone, HeroPanel, Tint } from '../../theme/tokens'
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

  const { status, message, color } = getFormStatus(form)
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
          borderRadius: 24,
          overflow: 'hidden',
          // The hairline is what separates this card from the page now. On dark
          // a drop shadow has almost nothing to fall on, so it is kept mainly
          // for Android's elevation ordering rather than for visible depth.
          borderWidth: 1,
          borderColor: style.border,
          shadowColor: colors.shadow,
          shadowOpacity: 0.45,
          shadowRadius: 18,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
        cardStyle,
      ]}
    >
      <LinearGradient
        colors={[style.gradient[0], style.gradient[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 22 }}
      >
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

          {/* Right: stacked fitness / fatigue mini-cards. */}
          <View style={{ marginLeft: 14, justifyContent: 'center' }}>
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
 * token, because what is behind it is the hero, not the page. On dark that tone
 * is an opaque hue (the two readouts stay distinguishable against a wash); on
 * light it is translucent white over the saturated fill.
 *
 * The labels use `heroLabel` for the same reason — `textMuted` here was a grey
 * chosen to sit on a white page, printed on green.
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
          color: colors.heroLabel,
        }}
      >
        {label}
      </Text>
      <CountUp
        value={value}
        style={{ fontSize: 26, fontWeight: '800', color: tone.text, marginTop: 1 }}
      />
      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.heroLabel }}>
        {sublabel}
      </Text>
    </View>
  )
}
