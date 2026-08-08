// Keeps the OS's scheduled notifications in step with the user's saved
// preferences and their real training data.
//
// Runs from RootNavigator so it's alive for the whole signed-in session. It
// owns its own sessions subscription because notifications must stay correct
// even on screens that don't read session history.
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

  // Share the store's single Firestore listener for as long as we're signed in.
  useEffect(() => {
    if (!uid) return
    return subscribe(uid)
  }, [uid, subscribe])

  // Re-sync only when something that changes the SCHEDULE changes. Session
  // count is included because it moves the streak and the reminder copy;
  // `form` deliberately is not, since it drifts continuously and would cause a
  // reschedule storm for a cosmetic wording difference.
  const signature = JSON.stringify({ uid, prefs, count: sessions.length })
  const lastSignature = useRef<string | null>(null)

  useEffect(() => {
    if (!uid || prefs === undefined) return
    // Wait for this user's real sessions, or the first sync would schedule a
    // reminder claiming they've trained nothing this week.
    if (loadedUid !== uid) return
    if (lastSignature.current === signature) return
    lastSignature.current = signature

    void syncScheduledNotifications(withPreferenceDefaults(prefs), {
      sessions,
      weekSessions,
      form,
    })
    // `sessions`/`weekSessions`/`form` are read as the latest values at run
    // time; `signature` is what decides whether a run is warranted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, loadedUid, uid, prefs])
}
