// Bottom tab navigator, one error boundary per tab.

import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TAB_BAR_HEIGHT, TYPE } from '../theme/tokens'
import AdminScreen from '../screens/AdminScreen'
import DashboardScreen from '../screens/DashboardScreen'
import LogScreen from '../screens/LogScreen'
import PlannerScreen from '../screens/PlannerScreen'
import ProgressScreen from '../screens/ProgressScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { withScreenBoundary } from '../components/ui/withScreenBoundary'
import TabIcon, { type TabIconName } from '../components/ui/TabIcon'
import {
  ensureHydrated as ensureLiveTrackingHydrated,
  hasActiveSession,
  useLiveTrackingStore,
} from '../store/liveTrackingStore'
import { useAuthStore } from '../store/authStore'
import { useToastStore } from '../store/toastStore'
import { haptics } from '../utils/haptics'
import { consumeLandingTab } from './landingTab'
import type { AppStackParamList, MainTabsParamList } from './types'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../theme/ThemeProvider'

const Tab = createBottomTabNavigator<MainTabsParamList>()

const DashboardTab = withScreenBoundary(DashboardScreen, 'Dashboard')
const LogTab = withScreenBoundary(LogScreen, 'Log Session')
const PlannerTab = withScreenBoundary(PlannerScreen, 'Planner')
const ProgressTab = withScreenBoundary(ProgressScreen, 'Progress')
const SettingsTab = withScreenBoundary(SettingsScreen, 'Settings')
const AdminTab = withScreenBoundary(AdminScreen, 'Admin')

const TAB_ICON: Record<string, TabIconName> = {
  Dashboard: 'activity',
  Log: 'plus',
  Planner: 'calendar',
  Progress: 'trending',
  Settings: 'sliders',
  Admin: 'shield',
}

export default function MainTabs() {
  const { colors } = useTheme()

  const isAdmin = useAuthStore((s) => s.profile?.isAdmin === true)

  const insets = useSafeAreaInsets()
  const setBottomOffset = useToastStore((s) => s.setBottomOffset)
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList, 'MainTabs'>>()

  useEffect(() => {
    setBottomOffset(TAB_BAR_HEIGHT)
    return () => setBottomOffset(0)
  }, [setBottomOffset])

  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureLiveTrackingHydrated()
      if (cancelled) return
      if (hasActiveSession(useLiveTrackingStore.getState())) {
        navigation.navigate('MainTabs', { screen: 'Log' })
        return
      }
      const landing = consumeLandingTab()
      if (landing) navigation.navigate('MainTabs', { screen: landing })
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
          borderTopWidth: 1,
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: TYPE.caption,
          fontWeight: '600',
          marginTop: Platform.OS === 'android' ? -2 : 0,
        },
        tabBarIcon: ({ color, focused }) => (
          <TabIcon name={TAB_ICON[route.name] ?? 'activity'} color={color} focused={focused} />
        ),
      })}
      screenListeners={{
        tabPress: () => haptics.light(),
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardTab} />
      <Tab.Screen name="Log" component={LogTab} /> 
      <Tab.Screen name="Planner" component={PlannerTab} />
      <Tab.Screen name="Progress" component={ProgressTab} />
      <Tab.Screen name="Settings" component={SettingsTab} />
      {isAdmin ? <Tab.Screen name="Admin" component={AdminTab} /> : null}
    </Tab.Navigator>
  )
}

//<Tab.Screen name="Log" component={LogTab} options={{ tabBarLabel: 'Record' }} /> to change the label of the Log tab to "Record"