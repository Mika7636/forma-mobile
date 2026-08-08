// Native stack wrapping the main tab UI. The tabs are the root screen; detail
// pages that should cover the whole screen (Conflict History, reached from
// Settings) push on top with a native slide + back gesture.
import { createNativeStackNavigator } from '@react-navigation/native-stack'
import ConflictHistoryScreen from '../screens/ConflictHistoryScreen'
import MainTabs from './MainTabs'
import type { AppStackParamList } from './types'

const Stack = createNativeStackNavigator<AppStackParamList>()

export default function AppStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainTabs" component={MainTabs} />
      <Stack.Screen name="ConflictHistory" component={ConflictHistoryScreen} />
    </Stack.Navigator>
  )
}
