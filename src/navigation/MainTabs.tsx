import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { useEffect } from 'react'
import { Platform, Text } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TYPE } from '../constants/theme'
import { COLOR } from '../theme/tokens'
import DashboardScreen from '../screens/DashboardScreen'
import LogScreen from '../screens/LogScreen'
import PlannerScreen from '../screens/PlannerScreen'
import ProgressScreen from '../screens/ProgressScreen'
import SettingsScreen from '../screens/SettingsScreen'
import { withScreenBoundary } from '../components/ui/withScreenBoundary'
import {
  ensureHydrated as ensureLiveTrackingHydrated,
  hasActiveSession,
  useLiveTrackingStore,
} from '../store/liveTrackingStore'
import { useToastStore } from '../store/toastStore'
import { haptics } from '../utils/haptics'
import type { AppStackParamList, MainTabsParamList } from './types'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'

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
  // MainTabs is a screen of AppStack, so this is the *stack's* navigator — which
  // is what can address a nested tab by name.
  const navigation = useNavigation<NativeStackNavigationProp<AppStackParamList, 'MainTabs'>>()

  // ToastContainer sits above the navigator and can't see the tab bar, so tell
  // it how much room to leave. Reset on unmount — auth and onboarding have no
  // tab bar, and a stale offset would float their toasts too high.
  useEffect(() => {
    setBottomOffset(TAB_BAR_HEIGHT)
    return () => setBottomOffset(0)
  }, [setBottomOffset])

  // Land on the workout when the app opens mid-run.
  //
  // Live tracking now keeps recording with FORMA closed, so a cold start can
  // happen while a run is in progress — most obviously when the athlete taps the
  // "FORMA is tracking your run" notification, whose content intent just relaunches
  // the app. Dropping them on the Dashboard there would look exactly like the bug
  // this feature fixes ("it stopped tracking"), so focus the Log tab, where
  // LogScreen restores the live screen.
  //
  // Deliberately mount-only rather than on every foreground: re-focusing the tab
  // each time the app resumes would yank the athlete off Progress or Settings
  // every time they glanced at another screen mid-run. A merely-backgrounded app
  // still has the tracking screen mounted and comes back to it on its own.
  useEffect(() => {
    let cancelled = false
    void (async () => {
      await ensureLiveTrackingHydrated()
      if (cancelled) return
      if (hasActiveSession(useLiveTrackingStore.getState())) {
        navigation.navigate('MainTabs', { screen: 'Log' })
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <Tab.Navigator
      // Tabs are siblings, not a hierarchy — a horizontal slide would imply an
      // order that doesn't exist. A short cross-fade reads as "switching view".
      screenOptions={({ route }) => ({
        headerShown: false,
        animation: 'fade',
        // Dark bar, app-wide.
        //
        // It used to be white. That was fine when every screen was FORMA's light
        // system, but live tracking, the finished-workout summary and the route
        // maps are all dark now, and a white slab pinned to the bottom of them
        // read as a piece of a different app — the single most visible seam in
        // the whole UI. A dark bar sits under both palettes; the light screens
        // keep their white cards and simply gain a grounded base.
        tabBarActiveTintColor: COLOR.accent,
        tabBarInactiveTintColor: COLOR.textMuted,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          // Lift the labels clear of the gesture bar / home indicator.
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: COLOR.bg,
          borderTopColor: COLOR.border,
          borderTopWidth: 1,
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
