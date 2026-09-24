// One-time moment after an athlete's first saved session.

import { Modal, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import PrimaryButton from '../ui/PrimaryButton'
import { PROGRESS_UNLOCK_SESSIONS } from '../../utils/calibration'
import { sportVisual } from '../../utils/sportMeta'
import type { Session } from '../../types/session'
import { MOTION, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface FirstSessionModalProps {
  session: Session | null
  onDismiss: () => void
}

export default function FirstSessionModal({ session, onDismiss }: FirstSessionModalProps) {
  const { colors } = useTheme()

  if (!session) return null

  const { icon, label } = sportVisual(session.sport, colors)
  const remaining = Math.max(0, PROGRESS_UNLOCK_SESSIONS - 1)

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          alignItems: 'center',
          justifyContent: 'center',
          padding: SPACING.lg,
        }}
      >
        <Animated.View
          entering={FadeIn.duration(MOTION.slow)}
          style={{
            width: '100%',
            maxWidth: 380,
            backgroundColor: colors.surface,
            borderRadius: RADIUS.xl,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.lg,
            ...colors.shadowFloating,
          }}
        >
          <Text
            style={{
              fontSize: TYPE.caption,
              fontWeight: WEIGHT.heavy,
              letterSpacing: 1.6,
              color: colors.accentText,
            }}
          >
            FIRST SESSION LOGGED
          </Text>

          <Text
            style={{
              marginTop: SPACING.sm,
              fontSize: TYPE.heading,
              fontWeight: WEIGHT.heavy,
              color: colors.text,
            }}
          >
            {icon} {label} · {session.durationMinutes} min
          </Text>

          <Animated.View
            entering={FadeInDown.delay(120).duration(MOTION.slow)}
            style={{
              marginTop: SPACING.base,
              alignItems: 'center',
              paddingVertical: SPACING.lg,
              borderRadius: RADIUS.lg,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'baseline' }}>
              <Text
                style={{
                  fontSize: TYPE.hero,
                  fontWeight: WEIGHT.heavy,
                  color: colors.accentText,
                  lineHeight: TYPE.hero + 6,
                }}
              >
                {session.loadScore}
              </Text>
              <Text
                style={{
                  marginLeft: 6,
                  fontSize: TYPE.subtitle,
                  fontWeight: WEIGHT.bold,
                  color: colors.accentText,
                }}
              >
                AU
              </Text>
            </View>
            <Text
              style={{
                marginTop: 2,
                fontSize: TYPE.micro,
                fontWeight: WEIGHT.bold,
                letterSpacing: 0.6,
                color: colors.textMuted,
              }}
            >
              TRAINING LOAD
            </Text>
          </Animated.View>

          <Text
            style={{
              marginTop: SPACING.base,
              fontSize: TYPE.body,
              lineHeight: 21,
              color: colors.textBody,
            }}
          >
            Training load is how long you went multiplied by how hard it felt —{' '}
            {session.durationMinutes} minutes at RPE {session.rpe} — so an easy hour and a
            brutal half-hour can finally be compared on one scale.
          </Text>

          <View
            style={{
              marginTop: SPACING.base,
              paddingLeft: SPACING.md,
              borderLeftWidth: 3,
              borderLeftColor: colors.accent,
            }}
          >
            <Text style={{ fontSize: TYPE.small, lineHeight: 19, color: colors.textMuted }}>
              <Text style={{ fontWeight: WEIGHT.heavy, color: colors.text }}>Next up:</Text> log{' '}
              {remaining} more session{remaining === 1 ? '' : 's'} and Progress will show
              your sustainable range — how much your training can absorb in a week.
            </Text>
          </View>

          <View style={{ marginTop: SPACING.lg }}>
            <PrimaryButton label="Got it" onPress={onDismiss} />
          </View>

          <Pressable
            onPress={onDismiss}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Close"
            style={{ alignSelf: 'center', marginTop: SPACING.md }}
          >
            <Text
              style={{
                fontSize: TYPE.micro,
                fontWeight: WEIGHT.semibold,
                color: colors.textSubtle,
              }}
            >
              You&apos;ll only see this once
            </Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  )
}
