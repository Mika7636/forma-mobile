// Where the verification state lives permanently.
//
// The Dashboard banner is a nudge that can be dismissed and that disappears the
// moment the address is confirmed; this is the answer to "is my email actually
// verified?" asked at any point afterwards, which is a question with a home in
// Settings and nowhere else. It is also the only route back to a resend for
// somebody who dismissed the banner earlier in the session.
//
// Shares every piece of state with the banner through `useEmailVerification`,
// including the cooldown — tapping Resend here and then walking to the Dashboard
// shows a countdown already running, not a second button offering an email
// Firebase would refuse to send.
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
            {/* Stated in the `info` family, not in `warn`. An unverified address
                is a thing still to do, not a fault — and a Settings screen that
                puts an amber chip next to somebody's email on day one is telling
                them their account is broken when it is working perfectly. */}
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

            {/* No resend on the demo handset. The demo account's inbox belongs
                to whoever is running the pitch, not to the stranger holding the
                phone, and a button that mails a third party is not something to
                leave within reach. The state itself is left visible — reading it
                costs nothing and hiding it would be its own small mystery. */}
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
