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

// Importing firebase.ts initializes the Firebase app on startup. Log the
// Firestore instance's project id to confirm it wired up without errors.
console.log(
  '[FORMA] Firebase initialized — Firestore project:',
  db.app.options.projectId,
  '· local cache:',
  // Which cache Firestore actually got. Worth a line in the log: it decides
  // whether an offline profile read can be served from Firestore at all, and on
  // React Native the answer is "no" — see src/config/firebase.ts.
  typeof globalThis.indexedDB !== 'undefined' ? 'persistent' : 'memory (AsyncStorage mirror in use)',
)

// Must run before any notification can arrive, so it's at module scope rather
// than in an effect: this is what makes a notification visible while FORMA is
// in the foreground instead of being swallowed silently.
configureNotificationHandler()

// Importing `liveLocationTask` above is what registers the background location
// task, and it has to happen here — at module scope — rather than in an effect:
// when the OS wakes FORMA in the background to hand over a batch of GPS fixes it
// evaluates this bundle *headlessly*, with no React tree ever mounted. A task
// defined inside a component would not exist in that context and the fixes would
// be dropped, which is precisely the bug this whole feature fixes.
//
// This call is the other half: it stops a foreground service (and its
// undismissable "tracking your run" notification) left behind by a workout that
// was already saved or discarded.
reconcileLiveTrackingOnStart()

// Same job for the rich live-session notification, plus creating the two Android
// channels it and the location service use — which has to happen before the
// location feed ever starts, because Android will not let an app lower a
// channel's importance after the channel exists.
//
// It is a reconcile, not a blind dismiss: relaunching mid-run is the normal case
// this whole feature exists for, and tearing the lock-screen readout off a
// workout that is still recording would be the exact opposite of the point. Only
// a notification with no session behind it — the residue of a crash — is cleared.
void reconcileLiveNotificationOnStart()

// Module scope, per the expo-splash-screen docs — by the time a component's
// effect runs, the splash has already auto-hidden and the flash has happened.
// RootNavigator is what eventually hides it, once auth has actually resolved.
// The rejection is swallowed: on a fast reload the splash can already be gone,
// which is harmless.
SplashScreen.preventAutoHideAsync().catch(() => {})

// Belt-and-braces for the native side. The JS BrandSplash overlay does the fade
// the user actually sees; this stops the native layer cutting out underneath it
// in a dev/production build.
//
// Expo Go can't customise its splash at all and warns on every launch if you
// try, so skip it there — the warning is pure noise during a demo, and there's
// nothing to configure anyway.
if (Constants.executionEnvironment !== ExecutionEnvironment.StoreClient) {
  SplashScreen.setOptions({ duration: 300, fade: true })
}

export default function App() {
  return (
    // Outermost, and above the root error boundary on purpose: the boundary's
    // fallback card is themed, so the provider has to be its ancestor for it to
    // have a palette to paint with. It renders nothing until the persisted mode
    // has been read, which is what stops a dark-theme user seeing a frame of
    // white on every cold start.
    <ThemeProvider>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <Root />
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ThemeProvider>
  )
}

/**
 * Everything that needs the palette.
 *
 * Split from `App` only because `useTheme` has to be called *below* the
 * provider, and `App` is where the provider is mounted.
 */
function Root() {
  const { colors, scheme } = useTheme()

  // Routes notification taps. Lives here (above the navigator) because it needs
  // to catch a cold start where the app was launched by the notification.
  useNotificationObserver()

  // React Navigation paints the gap between screens — the card behind a push
  // transition, and the flash between two screens during a stack swap — from
  // its own theme rather than from anything a screen renders. Left at the
  // default it uses React Navigation's white, so switching tabs on the dark
  // theme showed a white seam that no amount of screen styling could reach.
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
      {/* Last line of defence, below the per-screen boundaries in MainTabs /
          AppStack. It only catches what those can't: a failure in the
          navigator itself, or in the auth/onboarding screens that sit outside
          the tab navigator. In a release build there is no redbox, so without
          this an error here would blank the app entirely. */}
      <ErrorBoundary
        name="Root"
        title="FORMA hit a problem"
        message="The app ran into an unexpected error. Your training data is saved — restarting the screen usually clears it."
        retryLabel="Reload FORMA"
      >
        {/* Inside the boundary so a failure in the strip is caught like any
            other, and outside the navigator because it has to sit above every
            screen rather than inside one of them. It renders its children and
            nothing else unless the signed-in account is the demo account. */}
        <DemoChrome>
          <NavigationContainer ref={navigationRef} theme={navTheme}>
            <RootNavigator />
          </NavigationContainer>
        </DemoChrome>
      </ErrorBoundary>

      {/* Both of these are app-global on purpose. Mounted here — outside the
          navigator — they survive every screen change, so a toast fired just
          before a navigation still lands, and the offline strip doesn't have
          to be re-implemented on each screen. */}
      <OfflineBanner />
      <ToastContainer />

      {/* Per-screen <ThemedStatusBar>s override this; it's the default for
          anything that doesn't declare one. */}
      <ThemedStatusBar />
    </>
  )
}
