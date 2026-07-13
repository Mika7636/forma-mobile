import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// The auth flow is a native stack: Login ⇄ Register. Onboarding is gated by
// RootNavigator (shown only when a logged-in user hasn't finished onboarding),
// so it lives outside this stack.
export type AuthStackParamList = {
  Login: { registered?: boolean } | undefined
  Register: undefined
}

export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>
export type RegisterScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'Register'
>
