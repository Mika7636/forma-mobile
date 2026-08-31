// A one-shot request for which tab the app should open on.
//
// ## Why a module-level variable and not navigation state
//
// The screen that needs this — onboarding's final step — is not inside the tab
// navigator. It is not even inside `AppStack`: `RootNavigator` swaps onboarding
// *out* and the whole app shell *in* when `onboardingCompleted` flips, so there
// is no navigator alive at the moment the request is made and nothing to
// `navigate()` on. `navigationRef` has the same problem for the same reason.
//
// So the intent is parked here and collected by `MainTabs` when it mounts, a
// beat later. Deliberately consume-once: a second mount (a sign-out and back in,
// say) must not re-route the user to a tab they asked for in a previous life.
import type { MainTabsParamList } from './types'

let pending: keyof MainTabsParamList | null = null

/** Ask the app shell to open on `tab` the next time it mounts. */
export function requestLandingTab(tab: keyof MainTabsParamList): void {
  pending = tab
}

/** Take the pending request, clearing it. Returns null when there is none. */
export function consumeLandingTab(): keyof MainTabsParamList | null {
  const tab = pending
  pending = null
  return tab
}
