import { createNativeStackNavigator } from '@react-navigation/native-stack'
import LoginScreen from '../screens/LoginScreen'
import RegisterScreen from '../screens/RegisterScreen'
import type { AuthStackParamList } from './types'
import { useTheme } from '../theme/ThemeProvider'
const Stack = createNativeStackNavigator<AuthStackParamList>()

// Onboarding is NOT part of this stack — RootNavigator gates it separately
// (shown only when a logged-in user hasn't completed onboarding).
export default function AuthStack() {
  const { colors } = useTheme()

  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
        contentStyle: { backgroundColor: colors.bg },
      }}
    >
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  )
}
