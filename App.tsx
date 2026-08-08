import './global.css'

import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { db } from './src/config/firebase'
import { useNotificationObserver } from './src/hooks/useNotificationObserver'
import { navigationRef } from './src/navigation/navigationRef'
import RootNavigator from './src/navigation/RootNavigator'
import { configureNotificationHandler } from './src/services/notificationService'

// Importing firebase.ts initializes the Firebase app on startup. Log the
// Firestore instance's project id to confirm it wired up without errors.
console.log('[FORMA] Firebase initialized — Firestore project:', db.app.options.projectId)

// Must run before any notification can arrive, so it's at module scope rather
// than in an effect: this is what makes a notification visible while FORMA is
// in the foreground instead of being swallowed silently.
configureNotificationHandler()

export default function App() {
  // Routes notification taps. Lives here (above the navigator) because it needs
  // to catch a cold start where the app was launched by the notification.
  useNotificationObserver()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer ref={navigationRef}>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
