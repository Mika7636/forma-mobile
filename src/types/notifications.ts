// Notification preference shapes, and their defaults.

export type NotificationKind =
  | 'daily_reminder'
  | 'weekly_summary'
  | 'conflict'
  | 'streak'
  | 'test'

export interface DailyReminderPrefs {
  enabled: boolean
  hour: number
  minute: number
}

export interface WeeklySummaryPrefs {
  enabled: boolean
  hour: number
}

export interface NotificationPreferences {
  enabled: boolean
  dailyReminder: DailyReminderPrefs
  conflictAlerts: boolean
  weeklySummary: WeeklySummaryPrefs
  streakCelebrations: boolean
  streakReminders: boolean
}

export const DEFAULT_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: true,
  dailyReminder: { enabled: true, hour: 18, minute: 0 },
  conflictAlerts: true,
  weeklySummary: { enabled: true, hour: 19 },
  streakCelebrations: true,
  streakReminders: true,
}

export const DISABLED_NOTIFICATION_PREFERENCES: NotificationPreferences = {
  enabled: false,
  dailyReminder: { enabled: false, hour: 18, minute: 0 },
  conflictAlerts: false,
  weeklySummary: { enabled: false, hour: 19 },
  streakCelebrations: false,
  streakReminders: false,
}

export const STREAK_MILESTONES = [3, 5, 7, 14, 30] as const

export const STREAK_REMINDER_MIN_DAYS = 3

export const STREAK_REMINDER_HOUR = 20

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
