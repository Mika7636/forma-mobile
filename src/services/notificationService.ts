// Local notifications: permissions, scheduling and routing.

import { setNotificationHandler } from 'expo-notifications/build/NotificationsHandler'
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync'
import { cancelScheduledNotificationAsync } from 'expo-notifications/build/cancelScheduledNotificationAsync'
import { cancelAllScheduledNotificationsAsync } from 'expo-notifications/build/cancelAllScheduledNotificationsAsync'
import {
  getPermissionsAsync,
  requestPermissionsAsync,
} from 'expo-notifications/build/NotificationPermissions'
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync'
import {
  addNotificationResponseReceivedListener,
  getLastNotificationResponseAsync,
} from 'expo-notifications/build/NotificationsEmitter'
import { SchedulableTriggerInputTypes } from 'expo-notifications/build/Notifications.types'
import { AndroidImportance } from 'expo-notifications/build/NotificationChannelManager.types'
import type { EventSubscription } from 'expo-modules-core'
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types'
import { Platform } from 'react-native'
import { calculateStreak } from '../utils/streak'
import { localISODate } from '../utils/dates'
import { NOTIFICATION_ACCENT } from '../theme/tokens'
import {
  STREAK_MILESTONES,
  STREAK_REMINDER_HOUR,
  STREAK_REMINDER_MIN_DAYS,
  type NotificationKind,
  type NotificationPreferences,
} from '../types/notifications'
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'
import { LIVE_NOTIFICATION_SCREEN } from './liveNotification'

export const NOTIFICATION_IDS = {
  dailyReminder: 'forma-daily-reminder',
  weeklySummary: 'forma-weekly-summary',
  streakReminder: 'forma-streak-reminder',
} as const

const CHANNEL_ID = 'forma-default'

interface NotificationPayload extends Record<string, unknown> {
  kind: NotificationKind
}

export function configureNotificationHandler(): void {
  setNotificationHandler({
    handleNotification: async (notification) => {
      const data = notification.request.content.data as { screen?: unknown } | undefined
      if (data?.screen === LIVE_NOTIFICATION_SCREEN) {
        return {
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: false,
          shouldSetBadge: false,
        }
      }
      return {
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: true,
      }
    },
  })
}

let channelReady = false
let channelChecked = false

export async function ensureAndroidChannel(): Promise<boolean> {
  if (Platform.OS !== 'android') return false
  if (channelChecked) return channelReady
  channelChecked = true
  try {
    await setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Training reminders',
      importance: AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: NOTIFICATION_ACCENT,
    })
    channelReady = true
  } catch {
    channelReady = false
    console.log(
      '[FORMA] Custom notification channel unavailable (expected in Expo Go) — ' +
        'falling back to the default channel. Notifications still deliver.',
    )
  }
  return channelReady
}

function channelTarget(): { channelId?: string } {
  return channelReady ? { channelId: CHANNEL_ID } : {}
}

export type PermissionState = 'granted' | 'denied' | 'undetermined'

export async function getPermissionState(): Promise<PermissionState> {
  const { status } = await getPermissionsAsync()
  if (status === 'granted') return 'granted'
  if (status === 'denied') return 'denied'
  return 'undetermined'
}

export async function requestPermissions(): Promise<boolean> {
  const existing = await getPermissionsAsync()
  if (existing.status === 'granted') {
    await ensureAndroidChannel()
    return true
  }
  await requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  })

  const after = await getPermissionsAsync()
  const granted = after.status === 'granted'
  if (granted) await ensureAndroidChannel()
  return granted
}

export function hasTrainedOn(sessions: Session[], day: Date = new Date()): boolean {
  const key = localISODate(day)
  return sessions.some((s) => localISODate(new Date(s.date)) === key)
}

export function dailyReminderBody(trainedToday: boolean, form: number): string {
  if (trainedToday) return "Nice work today! Rest up and recover well."
  if (form < -10) return 'Your fatigue is high — consider a lighter session or a rest day.'
  if (form > 5) return "You're fresh and recovered. Great day to train."
  return "Your body's ready. Time to train."
}

export function weeklySummaryBody(weekSessions: Session[], form: number): string {
  if (weekSessions.length === 0) {
    return 'No sessions logged this week. A fresh week starts tomorrow — make it count.'
  }
  const hours = weekSessions.reduce((sum, s) => sum + s.durationMinutes, 0) / 60
  const calories = weekSessions.reduce((sum, s) => sum + (s.estimatedCalories ?? 0), 0)
  const trend = form > 5 ? 'trending up' : form < -10 ? 'building through fatigue' : 'steady'
  const hoursLabel = hours >= 10 ? Math.round(hours) : hours.toFixed(1)
  const sessionLabel = weekSessions.length === 1 ? 'session' : 'sessions'
  return `You trained ${hoursLabel} hours across ${weekSessions.length} ${sessionLabel}, burning ${Math.round(calories).toLocaleString()} calories. Your fitness is ${trend}.`
}

export interface ScheduleContext {
  sessions: Session[]
  weekSessions: Session[]
  form: number
}

export async function scheduleDailyReminder(
  hour: number,
  minute: number,
  context: ScheduleContext,
): Promise<string> {
  await cancelById(NOTIFICATION_IDS.dailyReminder)
  const trainedToday = hasTrainedOn(context.sessions)
  return scheduleNotificationAsync({
    identifier: NOTIFICATION_IDS.dailyReminder,
    content: {
      title: "Ready for today's session? 💪",
      body: dailyReminderBody(trainedToday, context.form),
      data: { kind: 'daily_reminder' } satisfies NotificationPayload,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DAILY,
      ...channelTarget(),
      hour,
      minute,
    },
  })
}

export async function scheduleWeeklySummary(
  hour: number,
  context: ScheduleContext,
): Promise<string> {
  await cancelById(NOTIFICATION_IDS.weeklySummary)
  return scheduleNotificationAsync({
    identifier: NOTIFICATION_IDS.weeklySummary,
    content: {
      title: 'Your week in review 📊',
      body: weeklySummaryBody(context.weekSessions, context.form),
      data: { kind: 'weekly_summary' } satisfies NotificationPayload,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.WEEKLY,
      ...channelTarget(),
      weekday: 1,
      hour,
      minute: 0,
    },
  })
}

export async function scheduleStreakReminder(context: ScheduleContext): Promise<void> {
  await cancelById(NOTIFICATION_IDS.streakReminder)
  const streak = calculateStreak(context.sessions)
  if (streak < STREAK_REMINDER_MIN_DAYS) return
  if (hasTrainedOn(context.sessions)) return

  await scheduleNotificationAsync({
    identifier: NOTIFICATION_IDS.streakReminder,
    content: {
      title: `Don't break your ${streak}-day streak! 🔥`,
      body: 'Log a session today to keep it alive.',
      data: { kind: 'streak' } satisfies NotificationPayload,
    },
    trigger: {
      type: SchedulableTriggerInputTypes.DAILY,
      ...channelTarget(),
      hour: STREAK_REMINDER_HOUR,
      minute: 0,
    },
  })
}

async function sendNow(
  title: string,
  body: string,
  kind: NotificationKind,
): Promise<string> {
  return scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { kind } satisfies NotificationPayload,
    },
    trigger: null,
  })
}

export async function sendConflictNotification(
  conflict: Conflict,
  prefs: NotificationPreferences,
): Promise<void> {
  if (!prefs.enabled || !prefs.conflictAlerts) return
  const title = conflict.severity === 'danger' ? '🚨 High Injury Risk' : '⚠️ Training Conflict'
  await sendNow(title, conflict.message, 'conflict')
}

export async function checkAndNotifyStreak(
  sessions: Session[],
  prefs: NotificationPreferences,
): Promise<number | null> {
  if (!prefs.enabled || !prefs.streakCelebrations) return null
  const streak = calculateStreak(sessions)
  if (!STREAK_MILESTONES.includes(streak as (typeof STREAK_MILESTONES)[number])) return null

  await sendNow(
    `🔥 ${streak}-day streak!`,
    `You've trained ${streak} days in a row. Keep the momentum going!`,
    'streak',
  )
  return streak
}

export async function sendTestNotification(): Promise<void> {
  await ensureAndroidChannel()
  await sendNow(
    'FORMA is watching your back 👊',
    "That's what a conflict warning will look like. Notifications are working.",
    'test',
  )
}

async function cancelById(identifier: string): Promise<void> {
  try {
    await cancelScheduledNotificationAsync(identifier)
  } catch {
  }
}

export async function cancelAllNotifications(): Promise<void> {
  await cancelAllScheduledNotificationsAsync()
}

export async function syncScheduledNotifications(
  prefs: NotificationPreferences,
  context: ScheduleContext,
): Promise<void> {
  const permission = await getPermissionState()
  if (!prefs.enabled || permission !== 'granted') {
    await cancelAllNotifications()
    return
  }

  await ensureAndroidChannel()

  if (prefs.dailyReminder.enabled) {
    await scheduleDailyReminder(
      prefs.dailyReminder.hour,
      prefs.dailyReminder.minute,
      context,
    )
  } else {
    await cancelById(NOTIFICATION_IDS.dailyReminder)
  }

  if (prefs.weeklySummary.enabled) {
    await scheduleWeeklySummary(prefs.weeklySummary.hour, context)
  } else {
    await cancelById(NOTIFICATION_IDS.weeklySummary)
  }

  if (prefs.streakReminders) {
    await scheduleStreakReminder(context)
  } else {
    await cancelById(NOTIFICATION_IDS.streakReminder)
  }
}

export function kindFromResponse(
  response: NotificationResponse,
): NotificationKind | null {
  const data = response.notification.request.content.data as
    | Partial<NotificationPayload>
    | undefined
  return (data?.kind as NotificationKind | undefined) ?? null
}

export type { NotificationResponse }

export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
): EventSubscription {
  return addNotificationResponseReceivedListener(listener)
}

export function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  return getLastNotificationResponseAsync()
}
