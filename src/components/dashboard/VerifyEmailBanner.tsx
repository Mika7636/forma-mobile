// "Verify your email" — the one piece of account hygiene FORMA asks for.
//
// ## Informational, not a warning
//
// The obvious thing to reach for here is the amber the conflict banner uses, and
// it would be wrong. Nothing is broken while an address is unverified: every
// screen works, sessions log, the model runs. An amber slab under the greeting
// says *something has gone wrong with your training* — which on this particular
// dashboard is a sentence with a specific meaning — and a new user would read it
// as their first impression of the app.
//
// So this is the `info` family: a blue wash, a hairline, and a shield. It reads
// as a note, sits below the conflict banners in the scroll order, and never
// competes with them for attention. Colour is doing the same job it does
// everywhere else in FORMA — saying what kind of thing this is, never carrying
// the message on its own. The words do that.
//
// ## And dismissible, because it is not urgent
//
// The × is the difference between a nudge and a nag. Dismissal is session-scoped
// (see `verificationDismissed` in the auth store) so it comes back tomorrow, and
// Settings shows the same state permanently for anyone who wants it back sooner.
import { ActivityIndicator, Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated'
import TabIcon from '../ui/TabIcon'
import { haptics } from '../../utils/haptics'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface VerifyEmailBannerProps {
  /** True while a send is in flight. */
  sending: boolean
  /** Seconds until another send is allowed; 0 when the button is live. */
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
      // `status`, not `alert`. An alert interrupts a screen reader mid-sentence,
      // which is the correct rudeness for an injury-risk warning and the wrong
      // one for a housekeeping note.
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
            // The countdown greys the border as well as the label. A live-looking
            // button that does nothing for another forty seconds is worse than a
            // visibly-waiting one.
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
        // Generous slop rather than a 44pt box: the glyph is small on purpose —
        // a dismiss control the size of the resend button would read as the
        // banner's primary action.
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
