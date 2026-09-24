// Settings row showing and resending email verification.

import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import TabIcon from '../ui/TabIcon'
import { useEmailVerification } from '../../hooks/useEmailVerification'
import { haptics } from '../../utils/haptics'
import { useIsDemo } from '../../store/authStore'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function EmailVerificationRow() {
  const { colors } = useTheme()
  const isDemo = useIsDemo()
  const { verified, sending, cooldown, resend } = useEmailVerification()

  const waiting = cooldown > 0
  const disabled = sending || waiting

  return (
    <View style={{ marginBottom: SPACING.base }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: colors.textMuted }}>EMAIL STATUS</Text>

      <View
        style={{
          marginTop: SPACING.sm,
          flexDirection: 'row',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: SPACING.sm,
        }}
      >
        {verified ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderRadius: RADIUS.pill,
              backgroundColor: colors.accentSoft,
              borderWidth: 1,
              borderColor: colors.accentBorder,
            }}
          >
            <TabIcon name="check-circle" size={13} color={colors.accentText} focused />
            <Text
              style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.heavy, color: colors.accentText }}
            >
              Verified
            </Text>
          </View>
        ) : (
          <>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 5,
                paddingHorizontal: 10,
                paddingVertical: 5,
                borderRadius: RADIUS.pill,
                backgroundColor: colors.infoSoft,
                borderWidth: 1,
                borderColor: colors.infoBorder,
              }}
            >
              <TabIcon name="shield" size={13} color={colors.infoText} />
              <Text
                style={{ fontSize: TYPE.micro, fontWeight: WEIGHT.heavy, color: colors.infoText }}
              >
                Not verified
              </Text>
            </View>

            {isDemo ? null : (
              <Pressable
                onPress={() => {
                  if (disabled) return
                  haptics.light()
                  void resend()
                }}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityLabel={
                  waiting
                    ? `Resend verification link, available in ${cooldown} seconds`
                    : 'Resend verification link'
                }
                accessibilityState={{ disabled }}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: SPACING.sm,
                  minHeight: 32,
                  paddingHorizontal: 12,
                  borderRadius: RADIUS.pill,
                  borderWidth: 1,
                  borderColor: disabled ? colors.border : colors.infoBorder,
                  backgroundColor: colors.surface,
                }}
              >
                {sending ? <ActivityIndicator size="small" color={colors.infoText} /> : null}
                <Text
                  style={{
                    fontSize: TYPE.micro,
                    fontWeight: WEIGHT.heavy,
                    color: disabled ? colors.textMuted : colors.infoText,
                  }}
                >
                  {sending ? 'Sending…' : waiting ? `Resend in ${cooldown}s` : 'Resend link'}
                </Text>
              </Pressable>
            )}
          </>
        )}
      </View>

      {verified ? null : (
        <Text style={{ marginTop: SPACING.sm, fontSize: 12, lineHeight: 17, color: colors.textSubtle }}>
          Verifying secures password resets. Nothing in FORMA is locked until you do.
        </Text>
      )}
    </View>
  )
}
