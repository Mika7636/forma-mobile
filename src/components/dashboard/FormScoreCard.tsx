import { useEffect } from 'react'
import { Text, View } from 'react-native'
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
import { getFormStatus } from '../../algorithms/formScore'

interface HeroStyle {
  /** Two-stop gradient, tuned to the form state. */
  gradient: readonly [string, string]
  /** Emoji shown in the status pill. */
  emoji: string
  /** Animated sheen overlay — the Peaked state only. */
  shimmer?: boolean
}

// Keyed by the colour name getFormStatus() returns, so the thresholds live in
// the algorithm and this file only decides how each state *looks*. Matches the
// web app's dashboard hero.
const HERO_STYLES: Record<string, HeroStyle> = {
  red: { gradient: ['#7f1d1d', '#991b1b'], emoji: '🥵' },
  orange: { gradient: ['#7c2d12', '#c2410c'], emoji: '🔥' },
  yellow: { gradient: ['#a16207', '#d97706'], emoji: '📈' },
  lightgreen: { gradient: ['#0f766e', '#14b8a6'], emoji: '⚖️' },
  green: { gradient: ['#15803d', '#22c55e'], emoji: '⚡' },
  brightgreen: { gradient: ['#16a34a', '#4ade80'], emoji: '🚀', shimmer: true },
}

interface FormScoreCardProps {
  form: number
  ctl: number
  atl: number
}

/**
 * The dashboard's hero. A bold gradient card whose colour and mood track the
 * athlete's current Form (CTL − ATL), with fitness/fatigue readouts alongside.
 */
export default function FormScoreCard({ form, ctl, atl }: FormScoreCardProps) {
  const { status, message, color } = getFormStatus(form)
  const style = HERO_STYLES[color] ?? HERO_STYLES.green
  const rounded = Math.round(form)

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
          shadowColor: '#000',
          shadowOpacity: 0.28,
          shadowRadius: 22,
          shadowOffset: { width: 0, height: 12 },
          elevation: 10,
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
                backgroundColor: 'rgba(255,255,255,0.22)',
              },
              sheenStyle,
            ]}
          />
        ) : null}

        <View style={{ flexDirection: 'row' }}>
          {/* Left: the headline score + status. */}
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 1.6,
                color: 'rgba(255,255,255,0.75)',
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
                color: '#FFFFFF',
                lineHeight: 70,
                marginTop: 2,
              }}
            />

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: 'rgba(255,255,255,0.22)',
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
                marginTop: 10,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                {status}
              </Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{style.emoji}</Text>
            </View>

            <Text
              style={{
                marginTop: 10,
                fontSize: 13,
                fontWeight: '600',
                color: 'rgba(255,255,255,0.88)',
                lineHeight: 18,
              }}
            >
              {message}
            </Text>
          </View>

          {/* Right: stacked fitness / fatigue mini-cards. */}
          <View style={{ marginLeft: 14, justifyContent: 'center' }}>
            <MiniStat label="FITNESS" sublabel="CTL" value={ctl} tint="rgba(56,189,248,0.30)" />
            <MiniStat label="FATIGUE" sublabel="ATL" value={atl} tint="rgba(248,113,113,0.30)" />
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  )
}

function MiniStat({
  label,
  sublabel,
  value,
  tint,
}: {
  label: string
  sublabel: string
  value: number
  tint: string
}) {
  return (
    <View
      style={{
        width: 104,
        backgroundColor: tint,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.22)',
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
          color: 'rgba(255,255,255,0.8)',
        }}
      >
        {label}
      </Text>
      <CountUp
        value={value}
        style={{ fontSize: 26, fontWeight: '800', color: '#FFFFFF', marginTop: 1 }}
      />
      <Text style={{ fontSize: 10, fontWeight: '600', color: 'rgba(255,255,255,0.65)' }}>
        {sublabel}
      </Text>
    </View>
  )
}
