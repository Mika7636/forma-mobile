// Dashboard hero while the account is still building its baseline.

import { useEffect, useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import FormInfoModal from './FormInfoModal'
import { type BaselineState } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface CalibratingFormCardProps {
  baseline: BaselineState
  onLogSession: () => void
}

export default function CalibratingFormCard({
  baseline,
  onLogSession,
}: CalibratingFormCardProps) {
  const { colors } = useTheme()

  const [infoOpen, setInfoOpen] = useState(false)
  const { sessionsLogged, daysCovered, target, daysRemaining, fraction } = baseline

  const scale = useSharedValue(0.96)
  useEffect(() => {
    scale.value = withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) })
  }, [scale])
  const cardStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }))

  return (
    <Animated.View
      style={[
        {
          backgroundColor: colors.surface,
          borderRadius: RADIUS.lg,
          borderWidth: 1,
          borderColor: colors.border,
          padding: 22,
          ...colors.shadowCard,
        },
        cardStyle,
      ]}
    >
      <Pressable
        onPress={() => setInfoOpen(true)}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="What is the Form Score?"
        style={{ position: 'absolute', top: 16, right: 16, zIndex: 2 }}
      >
        <Text style={{ fontSize: 18 }}>ℹ️</Text>
      </Pressable>

      <View
        style={{
          alignSelf: 'flex-start',
          backgroundColor: colors.accentSoft,
          borderRadius: RADIUS.pill,
          paddingHorizontal: 14,
          paddingVertical: 6,
        }}
      >
        <Text
          style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.accentText }}
        >
          Building your baseline
        </Text>
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 14 }}>
        <Text
          style={{
            fontSize: 40,
            fontWeight: WEIGHT.heavy,
            color: colors.accentText,
            lineHeight: 46,
          }}
        >
          {daysCovered}
        </Text>
        <Text
          style={{
            marginLeft: 6,
            fontSize: TYPE.subtitle,
            fontWeight: WEIGHT.bold,
            color: colors.textMuted,
          }}
        >
          of {target} training days
        </Text>
      </View>

      <View
        style={{
          height: 8,
          marginTop: SPACING.md,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.border,
          overflow: 'hidden',
        }}
      >
        <View
          style={{
            width: `${fraction * 100}%`,
            height: '100%',
            borderRadius: RADIUS.pill,
            backgroundColor: colors.accent,
          }}
        />
      </View>

      <Text style={{ marginTop: SPACING.sm, fontSize: TYPE.micro, color: colors.textMuted }}>
        {sessionsLogged} session{sessionsLogged === 1 ? '' : 's'} logged
        {daysRemaining > 0
          ? ` · ${daysRemaining} training day${daysRemaining === 1 ? '' : 's'} to go`
          : ''}
      </Text>

      <Pressable
        onPress={onLogSession}
        accessibilityRole="button"
        style={{
          marginTop: SPACING.base,
          alignSelf: 'flex-start',
          paddingHorizontal: SPACING.base,
          paddingVertical: 10,
          borderRadius: RADIUS.pill,
          backgroundColor: colors.surfaceAlt,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <Text style={{ fontSize: TYPE.small, fontWeight: WEIGHT.heavy, color: colors.text }}>
          Log a session
        </Text>
      </Pressable>

      <FormInfoModal building visible={infoOpen} onClose={() => setInfoOpen(false)} />
    </Animated.View>
  )
}
