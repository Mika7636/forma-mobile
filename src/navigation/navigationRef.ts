// Imperative navigation handle for code outside the navigator.

import { createNavigationContainerRef } from '@react-navigation/native'
import type { AppStackParamList } from './types'

export const navigationRef = createNavigationContainerRef<AppStackParamList>()

export function navigateToTab(tab: keyof import('./types').MainTabsParamList): void {
  if (!navigationRef.isReady()) return
  try {
    navigationRef.navigate('MainTabs', { screen: tab })
  } catch {
  }
}
