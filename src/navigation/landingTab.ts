// A one-shot request for which tab the app should open on.

import type { MainTabsParamList } from './types'

let pending: keyof MainTabsParamList | null = null

export function requestLandingTab(tab: keyof MainTabsParamList): void {
  pending = tab
}

export function consumeLandingTab(): keyof MainTabsParamList | null {
  const tab = pending
  pending = null
  return tab
}
