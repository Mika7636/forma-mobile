import './global.css'

import { NavigationContainer } from '@react-navigation/native'
import Constants, { ExecutionEnvironment } from 'expo-constants'
import { StatusBar } from 'expo-status-bar'
import * as SplashScreen from 'expo-splash-screen'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import { SafeAreaProvider } from 'react-native-safe-area-context'
import ErrorBoundary from './src/components/ui/ErrorBoundary'
import OfflineBanner from './src/components/ui/OfflineBanner'
import ToastContainer from './src/components/ui/ToastContainer'
import { db } from './src/config/firebase'
import { useNotificationObserver } from './src/hooks/useNotificationObserver'
import { navigationRef } from './src/navigation/navigationRef'
import RootNavigator from './src/navigation/RootNavigator'
import { reconcileLiveTrackingOnStart } from './src/services/liveLocationTask'
import { reconcileLiveNotificationOnStart } from './src/services/liveNotification'
import { configureNotificationHandler } from './src/services/notificationService'

// Importing firebase.ts initializes the Firebase app on startup. Log the
// Firestore instance's project id to confirm it wired up without errors.
console.log('[FORMA] Firebase initialized — Firestore project:', db.app.options.projectId)

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
  // Routes notification taps. Lives here (above the navigator) because it needs
  // to catch a cold start where the app was launched by the notification.
  useNotificationObserver()

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
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
          <NavigationContainer ref={navigationRef}>
            <RootNavigator />
          </NavigationContainer>
        </ErrorBoundary>

        {/* Both of these are app-global on purpose. Mounted here — outside the
            navigator — they survive every screen change, so a toast fired just
            before a navigation still lands, and the offline strip doesn't have
            to be re-implemented on each screen. */}
        <OfflineBanner />
        <ToastContainer />

        {/* Per-screen <StatusBar> components override this; it's the default for
            anything that doesn't declare one. */}
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  )
}
