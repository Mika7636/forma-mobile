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
import { StatusBar } from 'expo-status-bar'
import { haptics } from '../utils/haptics'
import FormInput from '../components/ui/FormInput'
import FormaLogo from '../components/ui/FormaLogo'
import PrimaryButton from '../components/ui/PrimaryButton'
import { COLORS } from '../constants/theme'
import { useAuthStore } from '../store/authStore'
import type { RegisterScreenProps } from '../navigation/types'

// Basic email shape check so we can give a friendly message before hitting
// Firebase.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function RegisterScreen({ navigation }: RegisterScreenProps) {
  const signUp = useAuthStore((s) => s.signUp)
  const error = useAuthStore((s) => s.error)
  const clearError = useAuthStore((s) => s.clearError)

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const emailRef = useRef<TextInput>(null)
  const passwordRef = useRef<TextInput>(null)

  useEffect(() => {
    clearError()
  }, [clearError])

  const validate = (): string | null => {
    if (!name.trim()) return 'Please enter your name.'
    if (!EMAIL_RE.test(email.trim())) return 'That email address looks invalid.'
    if (password.length < 6) return 'Password should be at least 6 characters.'
    return null
  }

  const handleRegister = async () => {
    if (submitting) return
    clearError()

    const validationError = validate()
    if (validationError) {
      useAuthStore.setState({ error: validationError })
      haptics.error()
      return
    }

    setSubmitting(true)
    try {
      await signUp(email, password, name)
      haptics.success()
      // Spec: do NOT auto-login. Send the user to Login with a success banner.
      navigation.navigate('Login', { registered: true })
    } catch {
      haptics.error()
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.pageBg }}>
      {/* White page — dark status-bar content is what stays legible. */}
      <StatusBar style="light" />
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
          <View style={{ marginBottom: 32, alignItems: 'center' }}>
            <FormaLogo />
            <Text style={{ marginTop: 12, fontSize: 17, color: COLORS.muted }}>
              Create your account
            </Text>
          </View>

          <FormInput
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            autoCapitalize="words"
            autoComplete="name"
            textContentType="name"
            returnKeyType="next"
            autoFocus
            onSubmitEditing={() => emailRef.current?.focus()}
          />

          <FormInput
            ref={emailRef}
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
            onSubmitEditing={() => passwordRef.current?.focus()}
          />

          <FormInput
            ref={passwordRef}
            label="Password"
            value={password}
            onChangeText={setPassword}
            placeholder="At least 6 characters"
            password
            autoCapitalize="none"
            autoComplete="password-new"
            textContentType="newPassword"
            returnKeyType="go"
            onSubmitEditing={handleRegister}
          />

          {error ? (
            <Text
              style={{
                color: COLORS.dangerText,
                fontSize: 14,
                marginTop: 2,
                marginBottom: 8,
              }}
            >
              {error}
            </Text>
          ) : null}

          <PrimaryButton
            label="Register"
            onPress={handleRegister}
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
            <Text style={{ color: COLORS.muted, fontSize: 15 }}>
              Already have an account?{' '}
            </Text>
            <Pressable
              onPress={() => {
                clearError()
                navigation.navigate('Login')
              }}
              hitSlop={8}
            >
              <Text style={{ color: COLORS.teal, fontSize: 15, fontWeight: '700' }}>
                Log in
              </Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}
