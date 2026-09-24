// App root: providers, navigation and startup side effects.

import './global.css'

import {
  NavigationContainer,
  DarkTheme,
  DefaultTheme,
  type Theme,
} from '@react-navigation/native'
import { useMemo } from 'react'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import DemoChrome from './src/components/ui/DemoBanner'
import ErrorBoundary from './src/components/ui/ErrorBoundary'
import OfflineBanner from './src/components/ui/OfflineBanner'
import ThemedStatusBar from './src/components/ui/ThemedStatusBar'
import ToastContainer from './src/components/ui/ToastContainer'
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider'
import { db } from './src/config/firebase'
import { useNotificationObserver } from './src/hooks/useNotificationObserver'
import { navigationRef } from './src/navigation/navigationRef'
import RootNavigator from './src/navigation/RootNavigator'
import { reconcileLiveTrackingOnStart } from './src/services/liveLocationTask'
import { reconcileLiveNotificationOnStart } from './src/services/liveNotification'
import { configureNotificationHandler } from './src/services/notificationService'

console.log(
  '[FORMA] Firebase initialized — Firestore project:',
  db.app.options.projectId,
  '· local cache:',
  typeof globalThis.indexedDB !== 'undefined' ? 'persistent' : 'memory (AsyncStorage mirror in use)',
)

configureNotificationHandler()

reconcileLiveTrackingOnStart()

void reconcileLiveNotificationOnStart()

SplashScreen.preventAutoHideAsync().catch(() => {})

if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({ duration: 300, fade: true })
}

export default function App() {
  return (
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Root />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  )
}

function Root() {
  const { colors, scheme } = useTheme()

  useNotificationObserver()

  const navTheme = useMemo<Theme>(() => {
    const base = scheme === 'dark' ? DarkTheme : DefaultTheme
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.accent,
        background: colors.bg,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    }
  }, [colors, scheme])

  return (
    <>
      <ErrorBoundary
        name="Root"
        title="FORMA hit a problem"
        message="The app ran into an unexpected error. Your training data is saved — restarting the screen usually clears it."
        retryLabel="Reload FORMA"
      >
        <DemoChrome>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </DemoChrome>
      </ErrorBoundary>

      <OfflineBanner />
      <ToastContainer />

      <ThemedStatusBar />
    </>
  )
}
