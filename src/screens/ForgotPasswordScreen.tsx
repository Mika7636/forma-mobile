import { useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import { haptics } from '../utils/haptics'
import FormInput from '../components/ui/FormInput'
import FormaLogo from '../components/ui/FormaLogo'
import PrimaryButton from '../components/ui/PrimaryButton'
import {
  resetCooldownRemaining,
  sendPasswordReset,
  type ResetOutcome,
} from '../services/passwordReset'
import { TYPE, WEIGHT } from '../theme/tokens'
import type { ForgotPasswordScreenProps } from '../navigation/types'
import { useTheme } from '../theme/ThemeProvider'

export default function ForgotPasswordScreen({ navigation, route }: ForgotPasswordScreenProps) {
  const { colors } = useTheme()

  // Carried over from Login so nobody has to type their address twice.
  const [email, setEmail] = useState(route.params?.email ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [sentAt, setSentAt] = useState<number | null>(null)
  const [errorText, setErrorText] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  // Countdown for "Send again". Recomputed from `sentAt` on every tick rather
  // than decremented, so an app that was backgrounded for 40 seconds comes back
  // reading 20, not whatever it said when it was suspended.
  useEffect(() => {
    if (sentAt == null) return
    setSecondsLeft(resetCooldownRemaining(sentAt))
    const id = setInterval(() => {
      const remaining = resetCooldownRemaining(sentAt)
      setSecondsLeft(remaining)
      if (remaining <= 0) clearInterval(id)
    }, 1000)
    return () => clearInterval(id)
  }, [sentAt])

  const handleSubmit = async () => {
    if (submitting) return
    setErrorText(null)

    const trimmed = email.trim()
    if (!trimmed) {
      setErrorText('Please enter your email.')
      haptics.error()
      return
    }

    // The button is already disabled during the countdown; this catches the
    // tap that lands in the same frame the timer is still settling.
    const remaining = resetCooldownRemaining(sentAt)
    let outcome: ResetOutcome
    if (remaining > 0) {
      outcome = { status: 'cooldown', secondsRemaining: remaining }
    } else {
      setSubmitting(true)
      try {
        outcome = await sendPasswordReset(trimmed)
      } finally {
        setSubmitting(false)
      }
    }

    switch (outcome.status) {
      case 'sent':
        haptics.success()
        setSentAt(Date.now())
        break
      case 'failed':
        haptics.error()
        setErrorText(outcome.message)
        break
      case 'cooldown':
        setSecondsLeft(outcome.secondsRemaining)
        break
    }
  }

  const coolingDown = secondsLeft > 0

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      <ThemedStatusBar />
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'padding'}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 28,
            paddingVertical: 32,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ marginBottom: 36, alignItems: 'center' }}>
            <FormaLogo />
            <Text
              style={{
                marginTop: 12,
                fontSize: 17,
                color: colors.textMuted,
              }}
            >
              Reset your password
            </Text>
          </View>

          {sentAt != null ? (
            <>
              {/* Worded conditionally on purpose: the service reports "sent"
                  for unknown addresses too, and this copy must not undo that
                  by confirming an account exists. */}
              <View
                style={{
                  backgroundColor: colors.accentSoft,
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 16,
                  marginBottom: 20,
                }}
              >
                <Text
                  style={{ color: colors.accentPressed, fontSize: 14, fontWeight: '600' }}
                >
                  If an account exists for {email.trim()}, a reset link is on its way.
                  Check your inbox and your spam folder.
                </Text>
              </View>

              <Pressable
                onPress={handleSubmit}
                disabled={coolingDown || submitting}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityState={{ disabled: coolingDown || submitting, busy: submitting }}
                style={{
                  alignSelf: 'center',
                  opacity: coolingDown || submitting ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: coolingDown ? colors.textMuted : colors.accentText,
                    fontSize: 15,
                    fontWeight: '700',
                  }}
                >
                  {coolingDown ? `Send again in ${secondsLeft}s` : 'Send again'}
                </Text>
              </Pressable>

              {errorText ? (
                <Text
                  style={{
                    color: colors.dangerText,
                    fontSize: 14,
                    marginTop: 12,
                    textAlign: 'center',
                  }}
                >
                  {errorText}
                </Text>
              ) : null}
            </>
          ) : (
            <>
              <FormInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                placeholder="you@example.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                autoComplete="email"
                textContentType="emailAddress"
                returnKeyType="go"
                autoFocus
                onSubmitEditing={handleSubmit}
              />

              {errorText ? (
                <Text
                  style={{
                    color: colors.dangerText,
                    fontSize: 14,
                    marginTop: 2,
                    marginBottom: 8,
                  }}
                >
                  {errorText}
                </Text>
              ) : null}

              <PrimaryButton
                label="Send reset link"
                onPress={handleSubmit}
                loading={submitting}
                style={{ marginTop: 12 }}
              />
            </>
          )}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              marginTop: 28,
            }}
          >
            <Pressable onPress={() => navigation.goBack()} hitSlop={8}>
              <Text
                style={{
                  color: colors.accentText,
                  fontSize: TYPE.bodyLg,
                  fontWeight: WEIGHT.bold,
                }}
              >
                Back to login
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
