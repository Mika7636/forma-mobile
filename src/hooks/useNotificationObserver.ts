// Routes a tapped notification to the screen it's about.
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
