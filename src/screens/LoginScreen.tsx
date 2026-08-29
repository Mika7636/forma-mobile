import { useEffect, useRef, useState } from 'react'
import {
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
import type { LoginScreenProps } from '../navigation/types'
import { useTheme } from '../theme/ThemeProvider'

export default function LoginScreen({ navigation, route }: LoginScreenProps) {
  const { colors } = useTheme()

  const signIn = useAuthStore((s) => s.signIn)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Success banner shown after registering (RegisterScreen redirects here).
  const justRegistered = route.params?.registered === true

  const passwordRef = useRef<TextInput>(null)

  // Clear any stale error when the screen mounts so a previous failed attempt
  // doesn't linger.
  useEffect(() => {
    clearError()
  }, [clearError])

  const handleLogin = async () => {
    if (submitting) return
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
              <Text style={{ color: colors.accent, fontSize: 15, fontWeight: '700' }}>
                Register
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
