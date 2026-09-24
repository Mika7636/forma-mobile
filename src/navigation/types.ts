// Navigator param lists and screen prop types.

import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs'
import type { NavigatorScreenParams } from '@react-navigation/native'
import type { NativeStackScreenProps } from '@react-navigation/native-stack'

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

export type AppStackParamList = {
  MainTabs: NavigatorScreenParams<MainTabsParamList> | undefined
  ConflictHistory: undefined
}

export type ConflictHistoryScreenProps = NativeStackScreenProps<
  AppStackParamList,
  'ConflictHistory'
>
