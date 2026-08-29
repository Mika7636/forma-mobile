import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import CountUp from './CountUp'
import FormInfoModal from './FormInfoModal'
import { CALIBRATION_SESSION_TARGET } from '../../utils/calibration'
import { useTheme } from '../../theme/ThemeProvider'
// Neutral teal — deliberately NOT the alarming red the negative Form state
// would otherwise use. During calibration the number is context, not a verdict.
//
// A deep wash rather than the saturated `#0e7490 → #14b8a6` fill this used to
// be, for the same reason as its sibling in `FormScoreCard`: on dark, a
// saturated hero is the brightest thing on the dashboard, and it is a strange
// thing for the *least* confident number in the app to be.

interface CalibratingFormCardProps {
  form: number
  ctl: number
  atl: number
  sessionsLogged: number
}

/**
 * The dashboard hero for a new user still in the calibration window. Leads with
 * "Building Your Baseline" and a progress meter rather than the raw Form Score,
 * so a handful of sessions never reads as a false "Overreaching" warning. The
 * Form number stays visible but demoted and labelled "estimated".
 */
export default function CalibratingFormCard({
  form,
  ctl,
  atl,
  sessionsLogged,
}: CalibratingFormCardProps) {
  const { colors } = useTheme()

  const [infoOpen, setInfoOpen] = useState(false)
  const rounded = Math.round(form)
  const target = CALIBRATION_SESSION_TARGET
  const logged = Math.min(sessionsLogged, target)
  const fraction = Math.max(0, Math.min(logged / target, 1))

  // Even with the seeded CTL/ATL baselines, a very heavy first week can still
  // blend to a sharply negative Form. During calibration we genuinely can't tell
  // "overreaching" from "not enough data yet", so we never say "Overreaching" —
  // we say "Adjusting…" and keep the calm teal treatment.
  const status = rounded < -20
    ? { label: 'Adjusting…', emoji: '🌀' }
    : { label: 'Building Your Baseline', emoji: '🌱' }

  // Settle-in scale, matching FormScoreCard so swapping heroes isn't jarring.
  const scale = useSharedValue(0.96)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })
  }, [scale])
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View
      style={[
        {
          borderRadius: 24,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.tint.teal.border,
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
        colors={[colors.tint.teal.bg, colors.surface] as const}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={{ padding: 22 }}
      >
        {/* Info affordance, top-right. */}
        <Pressable
          onPress={() => setInfoOpen(true)}
          hitSlop={12}
          style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}
        >
          <Text style={{ fontSize: 18 }}>ℹ️</Text>
        </Pressable>

        <View style={{ flexDirection: 'row' }}>
          {/* Left: status + demoted, estimated Form number. */}
          <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 1.6,
                color: colors.textMuted,
              }}
            >
              FORM SCORE
            </Text>

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                alignSelf: 'flex-start',
                backgroundColor: colors.surfaceAlt,
                borderWidth: 1,
                borderColor: colors.tint.teal.border,
                borderRadius: 999,
                paddingHorizontal: 14,
                paddingVertical: 6,
                marginTop: 8,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '800', color: colors.tint.teal.text }}>
                {status.label}
              </Text>
              <Text style={{ fontSize: 14, marginLeft: 6 }}>{status.emoji}</Text>
            </View>

            <CountUp
              value={rounded}
              format={(v) => {
                const n = Math.round(v)
                return n > 0 ? `+${n}` : String(n)
              }}
              style={{
                fontSize: 40,
                fontWeight: '800',
                color: colors.tint.teal.text,
                lineHeight: 46,
                marginTop: 12,
              }}
            />
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: colors.textMuted,
                marginTop: 2,
              }}
            >
              Estimated — improves with more data
            </Text>
          </View>

          {/* Right: fitness / fatigue, flagged as still calibrating. */}
          <View style={{ marginLeft: 6, justifyContent: 'center' }}>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '800',
                letterSpacing: 1,
                color: colors.textMuted,
                textAlign: 'right',
                marginBottom: 2,
              }}
            >
              CALIBRATING
            </Text>
            <MiniStat label="FITNESS" sublabel="CTL" value={ctl} tone={colors.tint.sky} />
            <MiniStat label="FATIGUE" sublabel="ATL" value={atl} tone={colors.tint.red} />
          </View>
        </View>

        {/* Progress meter — the real call to action for a calibrating user. */}
        <View style={{ marginTop: 18 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              marginBottom: 6,
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: colors.text }}>
              {logged} of {target} sessions logged
            </Text>
          </View>
          <View
            style={{
              height: 8,
              borderRadius: 999,
              // The unfilled track. Was a white scrim, which over a deep wash
              // would read as brighter than the fill it is supposed to sit
              // behind.
              backgroundColor: colors.surfaceAlt,
              overflow: 'hidden',
            }}
          >
            <View
              style={{
                width: `${fraction * 100}%`,
                height: '100%',
                borderRadius: 999,
                backgroundColor: colors.tint.teal.text,
              }}
            />
          </View>
          <Text
            style={{
              marginTop: 10,
              fontSize: 13,
              fontWeight: '600',
              color: colors.textBody,
              lineHeight: 18,
            }}
          >
            Your metrics are calibrating to your training level. They&apos;ll be fully
            accurate after 2–3 weeks of consistent logging.
          </Text>
        </View>
      </LinearGradient>

      <FormInfoModal visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Animated.View>
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
  tone: { bg: string; border: string; text: string }
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
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <CountUp
        value={value}
        style={{ fontSize: 26, fontWeight: '800', color: tone.text, marginTop: 1 }}
      />
      <Text style={{ fontSize: 10, fontWeight: '600', color: colors.textSubtle }}>
        {sublabel}
      </Text>
    </View>
  )
}
