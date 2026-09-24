// The Dashboard's Form Score hero card.

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
const HERO_EMOJI: Record<FormTone, string> = {
  red: '🥵',
  orange: '🔥',
  yellow: '📈',
  lightgreen: '⚖️',
  green: '⚡',
  brightgreen: '🚀',
}

const SHIMMER_TONE: FormTone = 'brightgreen'

interface FormScoreCardProps {
  form: number
  ctl: number
  atl: number
}

export default function FormScoreCard({ form, ctl, atl }: FormScoreCardProps) {
  const { colors } = useTheme()

  const { status, message, color } = getFormStatus(form, ctl)
  const style = colors.hero[color] ?? colors.hero.green
  const emoji = HERO_EMOJI[color] ?? HERO_EMOJI.green
  const shimmer = color === SHIMMER_TONE
  const rounded = Math.round(form)
  const [infoOpen, setInfoOpen] = useState(false)

  const scale = useSharedValue(0.96)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })
  }, [scale])
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

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

        <Pressable
          onPress={() => setInfoOpen(true)}
          hitSlop={12}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}
        >
          <Text style={{ fontSize: 18 }}>ℹ️</Text>
        </Pressable>

        <View style={{ flexDirection: 'row' }}>
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
                format={(v) => {
                  const n = Math.round(v)
                  return n > 0 ? `+${n}` : String(n)
                }}
                style={{
                  fontSize: 64,
                  fontWeight: '800',
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
          color: colors.heroStatChrome.label,
        }}
      >
        {label}
      </Text>
      <CountUp
        value={value}
        style={{ fontSize: 26, fontWeight: '800', color: tone.text, marginTop: 1 }}
      />
      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.heroStatChrome.label }}>
        {sublabel}
      </Text>
    </View>
  )
}
