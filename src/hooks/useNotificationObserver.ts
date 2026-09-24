// Routes a tapped notification to the screen it's about.

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

      if (isLiveNotificationResponse(response)) {
        if (handleTrackingAction(response)) return
        navigateToTab('Log')
        return
      }

      const kind = kindFromResponse(response)
      if (!kind) return
      navigateToTab(DESTINATION[kind] ?? 'Dashboard')
    }

    void getLastNotificationResponse().then(route)

    const subscription = addNotificationResponseListener(route)

    return () => {
      cancelled = true
      subscription.remove()
    }
  }, [])
}
