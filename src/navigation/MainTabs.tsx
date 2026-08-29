import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { useNavigation } from '@react-navigation/native'
import { useEffect } from 'react'
import { Platform } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { TYPE } from '../theme/tokens'
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
import { useToastStore } from '../store/toastStore'
import { haptics } from '../utils/haptics'
import type { AppStackParamList, MainTabsParamList } from './types'
import type { NativeStackNavigationProp } from '@react-navigation/native-stack'
import { useTheme } from '../theme/ThemeProvider'

const Tab = createBottomTabNavigator<MainTabsParamList>()

// Each tab gets its own error boundary, built once at module scope so the
// screens aren't remounted on every render of the navigator. A crash in one tab
// now shows a retry card in that tab instead of taking the app down with it.
const DashboardTab = withScreenBoundary(DashboardScreen, 'Dashboard')
const LogTab = withScreenBoundary(LogScreen, 'Log Session')
const PlannerTab = withScreenBoundary(PlannerScreen, 'Planner')
const ProgressTab = withScreenBoundary(ProgressScreen, 'Progress')
const SettingsTab = withScreenBoundary(SettingsScreen, 'Settings')

// Drawn, not emoji — see components/ui/TabIcon.
const TAB_ICON: Record<string, TabIconName> = {
  Dashboard: 'activity',
  Log: 'plus',
  Planner: 'calendar',
  Progress: 'trending',
  Settings: 'sliders',
}

/** Bar height above the safe-area inset. */
const TAB_BAR_HEIGHT = 58

export default function MainTabs() {
  const { colors } = useTheme()

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
        // The bar is the page ground, not a colour of its own.
        //
        // It was white once, then hardcoded dark when the app went dark. Both
        // were the same mistake: a bar pinned to the bottom of every screen in a
        // colour the screens don't share reads as a piece of a different app,
        // and it is the most visible seam in the whole UI. Taking `bg` and
        // `border` from the palette makes it the bottom edge of whatever page
        // is above it, in either theme.
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: {
          height: TAB_BAR_HEIGHT + insets.bottom,
          // Lift the labels clear of the gesture bar / home indicator.
          paddingBottom: insets.bottom,
          paddingTop: 6,
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
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
        // `color` is the navigator's own active/inactive tint. The emoji this
        // replaced could not accept it, so the inactive state was faked with
        // opacity — which dimmed a full-colour glyph toward grey rather than
        // toward the bar's muted colour, and looked like a rendering fault.
        tabBarIcon: ({ color, focused }) => (
          <TabIcon name={TAB_ICON[route.name] ?? 'activity'} color={color} focused={focused} />
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
