import { createBottomTabNavigator } from '@react-navigation/bottom-tabs'
import { Text } from 'react-native'
import DashboardScreen from '../screens/DashboardScreen'
import LogScreen from '../screens/LogScreen'
import PlannerScreen from '../screens/PlannerScreen'
import ProgressScreen from '../screens/ProgressScreen'
import SettingsScreen from '../screens/SettingsScreen'

const Tab = createBottomTabNavigator()

/** FORMA brand teal, used for the active tab tint. */
const FORMA_TEAL = '#1D9E75'

// Simple emoji icons for now; swap for lucide-react-native in Week 2.
const TAB_ICON: Record<string, string> = {
  Dashboard: '📊',
  Log: '➕',
  Planner: '🗓️',
  Progress: '📈',
  Settings: '⚙️',
}

export default function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: FORMA_TEAL,
        tabBarInactiveTintColor: '#9ca3af',
        tabBarIcon: ({ focused }) => (
          <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.6 }}>
            {TAB_ICON[route.name] ?? '•'}
          </Text>
        ),
      })}
    >
      <Tab.Screen name="Dashboard" component={DashboardScreen} />
      <Tab.Screen name="Log" component={LogScreen} />
      <Tab.Screen name="Planner" component={PlannerScreen} />
      <Tab.Screen name="Progress" component={ProgressScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  )
}
