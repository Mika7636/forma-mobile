// Dashboard "verify your email" banner.

import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import TabIcon from '../ui/TabIcon'
import { haptics } from '../../utils/haptics'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface VerifyEmailBannerProps {
  sending: boolean
  cooldown: number
  onResend: () => void
  onDismiss: () => void
}

export default function VerifyEmailBanner({
  sending,
  cooldown,
  onResend,
  onDismiss,
}: VerifyEmailBannerProps) {
  const { colors } = useTheme()

  const waiting = cooldown > 0
  const disabled = sending || waiting
  const label = sending ? 'Sending…' : waiting ? `Resend in ${cooldown}s` : 'Resend link'

  return (
    <Animated.View
      entering={FadeInDown.duration(240)}
      exiting={FadeOutUp.duration(180)}
      accessibilityRole="summary"
      style={{
        marginTop: SPACING.base,
        borderRadius: RADIUS.lg,
        backgroundColor: colors.infoSoft,
        borderWidth: 1,
        borderColor: colors.infoBorder,
        padding: SPACING.md + 2,
        flexDirection: 'row',
        alignItems: 'flex-start',
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: RADIUS.pill,
          borderWidth: 1,
          borderColor: colors.infoBorder,
          alignItems: 'center',
          justifyContent: 'center',
          marginRight: SPACING.md,
        }}
      >
        <TabIcon name="shield" size={17} color={colors.infoText} />
      </View>

      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: TYPE.body, fontWeight: WEIGHT.heavy, color: colors.infoText }}>
          Verify your email to secure your account
        </Text>
        <Text
          style={{
            marginTop: 3,
            fontSize: TYPE.small,
            lineHeight: 18,
            color: colors.textBody,
          }}
        >
          We sent you a link. Everything in FORMA keeps working until you get to it.
        </Text>

        <Pressable
          onPress={() => {
            if (disabled) return
            haptics.light()
            onResend()
          }}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={
            waiting ? `Resend verification link, available in ${cooldown} seconds` : 'Resend verification link'
          }
          accessibilityState={{ disabled }}
          hitSlop={6}
          style={{
            alignSelf: 'flex-start',
            marginTop: SPACING.md - 2,
            flexDirection: 'row',
            alignItems: 'center',
            gap: SPACING.sm,
            minHeight: 34,
            paddingHorizontal: 14,
            borderRadius: RADIUS.pill,
            borderWidth: 1,
            borderColor: disabled ? colors.border : colors.infoBorder,
            backgroundColor: colors.surface,
          }}
        >
          {sending ? <ActivityIndicator size="small" color={colors.infoText} /> : null}
          <Text
            style={{
              fontSize: TYPE.small,
              fontWeight: WEIGHT.heavy,
              color: disabled ? colors.textMuted : colors.infoText,
            }}
          >
            {label}
          </Text>
        </Pressable>
      </View>

      <Pressable
        onPress={() => {
          haptics.light()
          onDismiss()
        }}
        accessibilityRole="button"
        accessibilityLabel="Dismiss email verification reminder"
        hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
        style={{
          marginLeft: SPACING.sm,
          width: 24,
          height: 24,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18, lineHeight: 20, color: colors.textMuted }}>×</Text>
      </Pressable>
    </Animated.View>
  )
}
