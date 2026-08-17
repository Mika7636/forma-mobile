// Native stack wrapping the main tab UI. The tabs are the root screen; detail
// pages that should cover the whole screen (Conflict History, reached from
// Settings) push on top with a native slide + back gesture.
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import { COLORS } from '../constants/theme'
import { withScreenBoundary } from '../components/ui/withScreenBoundary'
import ConflictHistoryScreen from '../screens/ConflictHistoryScreen'
import MainTabs from './MainTabs'
import type { AppStackParamList } from './types'

const Stack = createNativeStackNavigator<AppStackParamList>()

const ConflictHistoryTab = withScreenBoundary(ConflictHistoryScreen, 'Conflict History')

export default function AppStack() {
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
        contentStyle: { backgroundColor: COLORS.pageBg },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="ConflictHistory" component={ConflictHistoryTab} />
    </Stack.Navigator>
  )
}
