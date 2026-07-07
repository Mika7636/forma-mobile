import './global.css'

import { NavigationContainer } from '@react-navigation/native'
import { StatusBar } from 'expo-status-bar'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import { db } from './src/config/firebase'
import RootNavigator from './src/navigation/RootNavigator'

// Importing firebase.ts initializes the Firebase app on startup. Log the
// Firestore instance's project id to confirm it wired up without errors.
console.log('[FORMA] Firebase initialized — Firestore project:', db.app.options.projectId)

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <NavigationContainer>
          <RootNavigator />
        </NavigationContainer>
        <StatusBar style="auto" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
