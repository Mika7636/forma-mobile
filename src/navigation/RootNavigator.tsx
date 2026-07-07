import AuthStack from './AuthStack'
import MainTabs from './MainTabs'

// Week 2 will replace this with a real auth check (authStore + Firebase auth
// state). For now it's hardcoded to true so the main tab bar shows immediately.
const IS_LOGGED_IN = true

export default function RootNavigator() {
  return IS_LOGGED_IN ? <MainTabs /> : <AuthStack />
}
