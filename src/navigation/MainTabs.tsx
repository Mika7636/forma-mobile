import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useEffect } from 'react'
import { Platform, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { COLORS, TYPE } from '../constants/theme'
import DashboardScreen from '../screens/DashboardScreen'
import LogScreen from '../screens/LogScreen'
import PlannerScreen from '../screens/PlannerScreen'
import ProgressScreen from '../screens/ProgressScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { withScreenBoundary } from '../components/ui/withScreenBoundary'
import { useToastStore } from '../store/toastStore'
import { haptics } from '../utils/haptics'
import type { MainTabsParamList } from './types'

const Tab = createBottomTabNavigator<MainTabsParamList>()

// Each tab gets its own error boundary, built once at module scope so the
// screens aren't remounted on every render of the navigator. A crash in one tab
// now shows a retry card in that tab instead of taking the app down with it.
const DashboardTab = withScreenBoundary(DashboardScreen, 'Dashboard')
const LogTab = withScreenBoundary(LogScreen, 'Log Session')
const PlannerTab = withScreenBoundary(PlannerScreen, 'Planner')
const ProgressTab = withScreenBoundary(ProgressScreen, 'Progress')
const SettingsTab = withScreenBoundary(SettingsScreen, 'Settings')

const TAB_ICON: Record<string, string> = {
  Dashboard: '📊',
  Log: '➕',
  Planner: '🗓️',
  Progress: '📈',
  Settings: '⚙️',
}

/** Bar height above the safe-area inset. */
const TAB_BAR_HEIGHT = 58

export default function MainTabs() {
  const insets = useSafeAreaInsets()
  const setBottomOffset = useToastStore((s) => s.setBottomOffset)

  // ToastContainer sits above the navigator and can't see the tab bar, so tell
  // it how much room to leave. Reset on unmount — auth and onboarding have no
  // tab bar, and a stale offset would float their toasts too high.
  useEffect(() => {
    setBottomOffset(TAB_BAR_HEIGHT)
    return () => setBottomOffset(0)
  }, [setBottomOffset])

  return (
    <Tab.Navigator
      // Tabs are siblings, not a hierarchy — a horizontal slide would imply an
      // order that doesn't exist. A short cross-fade reads as "switching view".
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        tabBarActiveTintColor: COLORS.teal,
        tabBarInactiveTintColor: COLORS.subtle,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          // Lift the labels clear of the gesture bar / home indicator.
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: COLORS.white,
          borderTopColor: COLORS.border,
          // Android draws its own shadow from `elevation`; on iOS the hairline
          // border is the whole separation, so no shadow either way.
          elevation: 0,
        },
        tabBarLabelStyle: {
          fontSize: TYPE.caption,
          fontWeight: '600',
          // Android's default label baseline sits too low inside a taller bar.
          marginTop: Platform.OS === 'android' ? -2 : 0,
        },
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.55 }}>
            {TAB_ICON[route.name] ?? '•'}
          </Text>
        ),
      })}
      // A light tick on every tab switch — the single most-used interaction in
      // the app, and the one where silence feels most like a dead button.
      screenListeners={{
        tabPress: () => haptics.light(),
      }}
    >
      <Tab.Screen name="Dashboard" component={DashboardTab} />
      <Tab.Screen name="Log" component={LogTab} />
      <Tab.Screen name="Planner" component={PlannerTab} />
      <Tab.Screen name="Progress" component={ProgressTab} />
      <Tab.Screen name="Settings" component={SettingsTab} />
    </Tab.Navigator>
  )
}
