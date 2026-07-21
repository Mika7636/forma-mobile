import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
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

// The main app is a bottom-tab navigator. The Log tab can receive a `date`
// (ISO YYYY-MM-DD) when opened from the Planner, pre-filling the session date
// and telling the screen to navigate back to the Planner after saving.
export type MainTabsParamList = {
  Dashboard: undefined
  Log: { date?: string } | undefined
  Planner: undefined
  Progress: undefined
  Settings: undefined
}

export type LogScreenProps = BottomTabScreenProps<MainTabsParamList, 'Log'>
export type DashboardScreenProps = BottomTabScreenProps<MainTabsParamList, 'Dashboard'>
export type ProgressScreenProps = BottomTabScreenProps<MainTabsParamList, 'Progress'>
export type PlannerScreenProps = BottomTabScreenProps<MainTabsParamList, 'Planner'>
