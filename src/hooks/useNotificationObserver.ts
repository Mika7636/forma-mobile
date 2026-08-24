// Routes a tapped notification to the screen it's about, and applies the
// tracking notification's action buttons.
//
// Two paths matter and both are handled:
//  · warm tap — app already running, delivered via the response listener.
//  · cold tap — app was killed and launched BY the notification, in which case
//    the listener never fires and the response is only available from
//    getLastNotificationResponse().
//
// Everything goes through notificationService rather than expo-notifications
// directly; see that file's header for why the package can't be imported
// normally in Expo Go on Android.
import { useEffect } from 'react'
import { navigateToTab } from '../navigation/navigationRef'
import {
  addNotificationResponseListener,
  getLastNotificationResponse,
  kindFromResponse,
  type NotificationResponse,
} from '../services/notificationService'
import {
  handleTrackingAction,
  isLiveNotificationResponse,
} from '../services/liveNotification'
import type { MainTabsParamList } from '../navigation/types'
import type { NotificationKind } from '../types/notifications'

/** Where each notification type should land. */
const DESTINATION: Record<NotificationKind, keyof MainTabsParamList> = {
  daily_reminder: 'Log',
  weekly_summary: 'Progress',
  conflict: 'Dashboard',
  streak: 'Dashboard',
  test: 'Dashboard',
}

export function useNotificationObserver(): void {
  useEffect(() => {
    let cancelled = false

    const route = (response: NotificationResponse | null) => {
      if (cancelled || !response) return

      // The live-session notification comes first, and is handled here rather
      // than on the tracking screen on purpose: its buttons have to work when
      // that screen isn't mounted at all — phone locked, FORMA backgrounded,
      // possibly relaunched headlessly since the run began. This hook sits above
      // the navigator and is the only listener guaranteed to exist.
      if (isLiveNotificationResponse(response)) {
        // Pause/Resume are applied in place and stop here — they deliberately
        // don't foreground the app, so there is nothing to navigate to.
        if (handleTrackingAction(response)) return
        // A body tap, or Stop (which does open the app): put the athlete back on
        // their workout. LogScreen restores live mode from the store on focus.
        navigateToTab('Log')
        return
      }

      const kind = kindFromResponse(response)
      if (!kind) return
      navigateToTab(DESTINATION[kind] ?? 'Dashboard')
    }

    // Cold start: the app was opened by tapping a notification.
    void getLastNotificationResponse().then(route)

    // Warm taps for the rest of the session.
    const subscription = addNotificationResponseListener(route)

    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])
}
