// Keeps scheduled OS notifications in step with saved preferences.

import { useEffect, useRef } from 'react'
import { useAuthStore } from '../store/authStore'
import { useMetricsStore } from '../store/metricsStore'
import { useSessionsStore } from '../store/sessionsStore'
import { syncScheduledNotifications } from '../services/notificationService'
import { withPreferenceDefaults } from '../types/notifications'

export function useNotificationSync(): void {
  const uid = useAuthStore((s) => s.user?.uid)
  const prefs = useAuthStore((s) => s.profile?.notificationPreferences)

  const subscribe = useSessionsStore((s) => s.subscribe)
  const sessions = useSessionsStore((s) => s.sessions)
  const weekSessions = useSessionsStore((s) => s.weekSessions)
  const loadedUid = useSessionsStore((s) => s.loadedUid)
  const form = useMetricsStore((s) => s.form)

  useEffect(() => {
    if (!uid) return
    return subscribe(uid)
  }, [uid, subscribe])

  const signature = JSON.stringify({ uid, prefs, count: sessions.length })
  const lastSignature = useRef<string | null>(null)

  useEffect(() => {
    if (!uid || prefs === undefined) return
    if (loadedUid !== uid) return
    if (lastSignature.current === signature) return
    lastSignature.current = signature

    void syncScheduledNotifications(withPreferenceDefaults(prefs), {
      sessions,
      weekSessions,
      form,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loadedUid, uid, prefs])
}
