// Native stack wrapping the tab UI, plus the detail screens.

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

  useLastActiveHeartbeat()

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="ConflictHistory" component={ConflictHistoryTab} />
    </Stack.Navigator>
  )
}
