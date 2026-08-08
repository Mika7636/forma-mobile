// Notification preferences, persisted on the user profile at /users/{uid}.
//
// Every FORMA notification is a LOCAL notification scheduled on-device — there
// is no push server and no Expo push token. That's a deliberate constraint:
// remote push is unavailable in Expo Go on Android from SDK 53 onward, while
// local scheduling works everywhere including the emulator. All four of our use
// cases (reminders, conflict alerts, weekly summaries, streaks) are things the
// device already knows about, so nothing is lost.

/** Which screen a tapped notification should open. Stored in the payload. */
export type NotificationKind =
  | 'daily_reminder'
  | 'weekly_summary'
  | 'conflict'
  | 'streak'
  | 'test'

export interface DailyReminderPrefs {
  enabled: boolean
  /** Local hour, 0–23. */
  hour: number
  /** Local minute, 0–59. */
  minute: number
}

export interface WeeklySummaryPrefs {
  enabled: boolean
  /** Local hour, 0–23. Always fires on Sunday. */
  hour: number
}

export interface NotificationPreferences {
  /** Master switch. When false nothing is scheduled, whatever the sub-toggles say. */
  enabled: boolean
  dailyReminder: DailyReminderPrefs
  conflictAlerts: boolean
  weeklySummary: WeeklySummaryPrefs
  streakCelebrations: boolean
  streakReminders: boolean
}

/**
 * Defaults applied when a user first grants permission. Deliberately gentle: a
 * single evening reminder, conflict alerts (the safety-critical one), and the
 * weekly summary. Streak nudges are on but only ever fire for a streak worth
 * protecting (see STREAK_REMINDER_MIN_DAYS).
 */
export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  dailyReminder: { enabled: true, hour: 18, minute: 0 },
  conflictAlerts: true,
  weeklySummary: { enabled: true, hour: 19 },
  streakCelebrations: true,
  streakReminders: true,
}

/** Everything off — stored when the user picks "Maybe later". */
export const DISABLED_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  dailyReminder: { enabled: false, hour: 18, minute: 0 },
  conflictAlerts: false,
  weeklySummary: { enabled: false, hour: 19 },
  streakCelebrations: false,
  streakReminders: false,
}

/** Streak lengths worth celebrating. */
export const STREAK_MILESTONES = [3, 5, 7, 14, 30] as const

/** Below this, a streak isn't established enough to nag about protecting. */
export const STREAK_REMINDER_MIN_DAYS = 3

/** Hour the "don't break your streak" nudge fires, if the streak is at risk. */
export const STREAK_REMINDER_HOUR = 20

/** Fill in any missing fields so older profiles read as a complete object. */
export function withPreferenceDefaults(
  prefs: Partial<NotificationPreferences> | undefined,
): NotificationPreferences {
  const d = DEFAULT_NOTIFICATION_PREFERENCES
  return {
    enabled: prefs?.enabled ?? d.enabled,
    dailyReminder: { ...d.dailyReminder, ...prefs?.dailyReminder },
    conflictAlerts: prefs?.conflictAlerts ?? d.conflictAlerts,
    weeklySummary: { ...d.weeklySummary, ...prefs?.weeklySummary },
    streakCelebrations: prefs?.streakCelebrations ?? d.streakCelebrations,
    streakReminders: prefs?.streakReminders ?? d.streakReminders,
  }
}
