import { useEffect, useRef, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import { haptics } from '../utils/haptics'
import FormInput from '../components/ui/FormInput'
import FormaLogo from '../components/ui/FormaLogo'
import PrimaryButton from '../components/ui/PrimaryButton'
import { useAuthStore } from '../store/authStore'
import { DEMO_AVAILABLE } from '../config/demo'
import { MIN_TOUCH, RADIUS, TYPE, WEIGHT } from '../theme/tokens'
import type { LoginScreenProps } from '../navigation/types'
import { useTheme } from '../theme/ThemeProvider'

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const { colors } = useTheme()

  const signIn = useAuthStore((s) => s.signIn)
  const signInDemo = useAuthStore((s) => s.signInDemo)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [demoSubmitting, setDemoSubmitting] = useState(false)

  // Success banner shown after registering (RegisterScreen redirects here).
  const justRegistered = route.params?.registered === true

  const passwordRef = useRef<TextInput>(null)

  // Clear any stale error when the screen mounts so a previous failed attempt
  // doesn't linger.
  useEffect(() => {
    clearError()
  }, [clearError])

  /**
   * Sign into the pre-seeded demo account.
   *
   * Kept entirely separate from {@link handleLogin} rather than reusing it with
   * arguments: this path must never read the email/password fields, so that
   * half-typed credentials left in them by a previous tester cannot end up being
   * submitted by a button labelled "Try Demo".
   */
  const handleDemo = async () => {
    if (submitting || demoSubmitting) return
    clearError()
    setDemoSubmitting(true)
    try {
      await signInDemo()
      // RootNavigator swaps to the app; DemoChrome puts the badge up.
    } catch {
      haptics.error()
    } finally {
      setDemoSubmitting(false)
    }
  }

  const handleLogin = async () => {
    if (submitting || demoSubmitting) return
    clearError()

    if (!email.trim() || !password) {
      useAuthStore.setState({ error: 'Please enter your email and password.' })
      haptics.error()
      return
    }

    setSubmitting(true)
    try {
      await signIn(email, password)
      // On success RootNavigator swaps to the app; nothing more to do here.
    } catch {
      // Error message is already in the store; buzz to signal failure.
      haptics.error()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}>
      {/* White page — dark status-bar content is what stays legible. */}
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
              Welcome back
            </Text>
          </View>

          {justRegistered ? (
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
                Account created! Please log in.
              </Text>
            </View>
          ) : null}

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
            returnKeyType="next"
            autoFocus
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <FormInput
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="Your password"
            password
            autoCapitalize="none"
            autoComplete="password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={handleLogin}
          />

          <Pressable
            onPress={() => {
              clearError()
              navigation.navigate('ForgotPassword', { email: email.trim() || undefined })
            }}
            hitSlop={8}
            accessibilityRole="link"
            style={{ alignSelf: 'flex-end', marginTop: -6, marginBottom: 10 }}
          >
            <Text
              style={{ color: colors.accentText, fontSize: TYPE.body, fontWeight: '700' }}
            >
              Forgot password?
            </Text>
          </Pressable>

          {error ? (
            <Text
              style={{
                color: colors.dangerText,
                fontSize: 14,
                marginTop: 2,
                marginBottom: 8,
              }}
            >
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            label="Log In"
            onPress={handleLogin}
            loading={submitting}
            style={{ marginTop: 12 }}
          />

          {/* Secondary, and visibly so: outlined rather than filled, under the
              real sign-in rather than beside it. It is an escape hatch for
              somebody who has been handed the phone, not a second front door —
              a returning athlete should never have to work out which of two
              equally weighted buttons is theirs.

              Absent entirely from a build that was compiled without the demo
              credentials, which is every ordinary build. See `config/demo`. */}
          {DEMO_AVAILABLE ? (
            <>
              <Pressable
                onPress={handleDemo}
                disabled={demoSubmitting || submitting}
                accessibilityRole="button"
                accessibilityLabel="Try the demo account"
                accessibilityState={{ disabled: demoSubmitting || submitting, busy: demoSubmitting }}
                style={{
                  marginTop: 12,
                  height: 52,
                  minHeight: MIN_TOUCH,
                  borderRadius: RADIUS.md,
                  borderWidth: 1.5,
                  borderColor: colors.accent,
                  alignItems: 'center',
                  justifyContent: 'center',
                  opacity: demoSubmitting || submitting ? 0.6 : 1,
                }}
              >
                {demoSubmitting ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <Text
                    style={{
                      color: colors.accentText,
                      fontSize: TYPE.subtitle,
                      fontWeight: WEIGHT.bold,
                    }}
                  >
                    Try Demo
                  </Text>
                )}
              </Pressable>
              <Text
                style={{
                  marginTop: 8,
                  textAlign: 'center',
                  fontSize: TYPE.micro,
                  color: colors.textSubtle,
                }}
              >
                Explore FORMA with twelve weeks of sample training data.
              </Text>
            </>
          ) : null}

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'center',
              marginTop: 28,
            }}
          >
            <Text style={{ color: colors.textMuted, fontSize: 15 }}>
              Don't have an account?{' '}
            </Text>
            <Pressable
              onPress={() => {
                clearError()
                navigation.navigate('Register')
              }}
              hitSlop={8}
            >
              <Text style={{ color: colors.accentText, fontSize: 15, fontWeight: '700' }}>
                Register
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
