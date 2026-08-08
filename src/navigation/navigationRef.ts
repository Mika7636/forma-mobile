// Imperative navigation handle, used by code that lives OUTSIDE the navigator
// tree — specifically the notification-response listener, which has to route a
// tap from a native callback where no `useNavigation` context exists.
import { createNavigationContainerRef } from '@react-navigation/native'
import type { AppStackParamList } from './types'

export const navigationRef = createNavigationContainerRef<AppStackParamList>()

/**
 * Focus one of the bottom tabs, if the app stack is mounted.
 *
 * Silently no-ops when the container isn't ready or the user isn't in the app
 * shell yet (logged out, mid-onboarding). A tapped notification should never
 * crash or force a signed-out user into the tabs.
 */
export function navigateToTab(tab: keyof import('./types').MainTabsParamList): void {
  if (!navigationRef.isReady()) return
  try {
    navigationRef.navigate('MainTabs', { screen: tab })
  } catch {
    // The app stack isn't mounted (auth/onboarding). Nothing to focus.
  }
}
