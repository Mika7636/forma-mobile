import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NavigatorScreenParams } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

// The auth flow is a native stack: Login ⇄ Register, plus Login → ForgotPassword
// (which may carry the address already typed on Login). Onboarding is gated by
// RootNavigator (shown only when a logged-in user hasn't finished onboarding),
// so it lives outside this stack.
export type AuthStackParamList = {
  Login: { registered?: boolean } | undefined
  Register: undefined
  ForgotPassword: { email?: string } | undefined
}

export type LoginScreenProps = NativeStackScreenProps<AuthStackParamList, 'Login'>
export type RegisterScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'Register'
>
export type ForgotPasswordScreenProps = NativeStackScreenProps<
  AuthStackParamList,
  'ForgotPassword'
>

// The main app is a bottom-tab navigator. The Log tab can receive a `date`
// (ISO YYYY-MM-DD) when opened from the Planner, pre-filling the session date
// and telling the screen to navigate back to the Planner after saving.
//
// `Admin` is registered only for a profile whose Firestore document carries
// `isAdmin: true`, so for everyone else the route does not exist and
// `navigate('Admin')` is a no-op. It stays in the param list because the type
// describes the navigator's full vocabulary, not one session's slice of it.
export type MainTabsParamList = {
  Dashboard: undefined
  Log: { date?: string } | undefined
  Planner: undefined
  Progress: undefined
  Settings: undefined
  Admin: undefined
}

export type LogScreenProps = BottomTabScreenProps<MainTabsParamList, 'Log'>
export type DashboardScreenProps = BottomTabScreenProps<MainTabsParamList, 'Dashboard'>
export type ProgressScreenProps = BottomTabScreenProps<MainTabsParamList, 'Progress'>
export type PlannerScreenProps = BottomTabScreenProps<MainTabsParamList, 'Planner'>
export type AdminScreenProps = BottomTabScreenProps<MainTabsParamList, 'Admin'>

// The whole tab UI is wrapped in a native stack so full-screen detail pages
// (currently Conflict History, reached from Settings) can push over the tabs.
export type AppStackParamList = {
  // Nested params so a tapped notification can jump straight to a tab, e.g.
  // navigate('MainTabs', { screen: 'Progress' }) for the weekly summary.
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined
  ConflictHistory: undefined
}

export type ConflictHistoryScreenProps = NativeStackScreenProps<
  AppStackParamList,
  'ConflictHistory'
>
