// Native stack wrapping the main tab UI. The tabs are the root screen; detail
// pages that should cover the whole screen (Conflict History, reached from
// Settings) push on top with a native slide + back gesture.
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { withScreenBoundary } from '../components/ui/withScreenBoundary'
import { useLastActiveHeartbeat } from '../hooks/useLastActiveHeartbeat'
import ConflictHistoryScreen from '../screens/ConflictHistoryScreen'
import MainTabs from './MainTabs'
import type { AppStackParamList } from './types'
import { useTheme } from '../theme/ThemeProvider'

const Stack = createNativeStackNavigator<AppStackParamList>()

const ConflictHistoryTab = withScreenBoundary(ConflictHistoryScreen, 'Conflict History')

export default function AppStack() {
  const { colors } = useTheme()

  // Records that this athlete is using the app, at most once an hour, on their
  // own profile document. Mounted here rather than in `App` because this is the
  // first thing rendered for a signed-in, onboarded user — which is exactly the
  // population "last active" means anything about. It backs the Admin screen's
  // user list; nothing in the athlete's own UI reads it.
  useLastActiveHeartbeat()

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        // Explicit rather than left to `default`: a pushed detail page slides in
        // from the right on both platforms, matching the back-swipe direction.
        // The native stack runs this on the UI thread at the platform's own
        // ~300ms curve, so it stays smooth while the screen is still fetching.
        animation: 'slide_from_right',
        // Without this the gap between screens flashes the window background
        // (black on Android) for a frame mid-transition.
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="ConflictHistory" component={ConflictHistoryTab} />
    </Stack.Navigator>
  )
}
