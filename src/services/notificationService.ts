// FORMA's local notification layer — the "coach checking in" that the web app
// structurally cannot do.
//
// ── Why everything here is LOCAL ────────────────────────────────────────────
// Remote (push) notifications were removed from Expo Go on Android in SDK 53,
// so a push-token flow would be undemoable on this project's target. Every
// FORMA notification is instead scheduled on-device with expo-notifications,
// which works in Expo Go on both platforms and on the emulator. Nothing is lost:
// all four use cases are derived from data the device already has.
//
// ── The one real tradeoff ───────────────────────────────────────────────────
// A repeating local notification's TEXT is fixed at schedule time — the OS just
// replays the payload, it cannot call back into JS to recompute a body. So the
// daily reminder and weekly summary read from a snapshot taken the last time
// the app synced (launch, a settings change, or logging a session). We re-sync
// at each of those moments to keep the copy honest; see syncScheduledNotifications.
// Notifications that ARE fully live (conflicts, streak milestones) fire
// immediately from JS while the app is running, so their text is always exact.
// ── Why these imports reach into `expo-notifications/build/…` ───────────────
// `import from 'expo-notifications'` CRASHES THE APP AT STARTUP in Expo Go on
// Android, and it does so even though FORMA never touches remote push. The
// barrel (build/index.js) re-exports `DevicePushTokenAutoRegistration.fx`,
// whose module scope calls `addPushTokenListener(...)`; that runs
// `warnOfExpoGoPushUsage()`, which `throw`s on Android under Expo Go from SDK
// 53 onward. The throw happens while the module graph is still loading, so it
// surfaces as a bare `[runtime not ready]` red screen with no useful frame —
// exactly the failure this project has been bitten by before.
//
// Importing the leaf modules skips that side effect entirely. Verified against
// expo-notifications@57.0.9: only `index.js` and `getExpoPushTokenAsync.js`
// pull in the `.fx` module, and none of the modules below touch either.
//
// Tradeoff: these are internal paths with no `exports` map guarding them, so a
// future expo-notifications release could move them. They are deliberately
// confined to this one file — every other module imports from here — so a break
// is a compile error in a single place. Revisit if the app ever moves to a
// development build, where the plain barrel import works fine.
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
// The live tracking notification is presented by `liveNotification.ts`, but the
// foreground-presentation decision above is centralised here, so this file needs
// to recognise it. Import direction is one-way (that module never imports this
// one), so there is no cycle.
import { LIVE_NOTIFICATION_SCREEN } from './liveNotification'

/**
 * Stable identifiers for the repeating schedules. Re-scheduling with the same
 * id replaces the previous entry, which is what stops the "toggle a setting five
 * times, get five reminders" duplicate bug — we never rely on
 * cancelAllScheduledNotificationsAsync to clean up after ourselves.
 */
export const NOTIFICATION_IDS = {
  dailyReminder: 'forma-daily-reminder',
  weeklySummary: 'forma-weekly-summary',
  streakReminder: 'forma-streak-reminder',
} as const

/** Android channel. Without one, Android 8+ silently drops every notification. */
const CHANNEL_ID = 'forma-default'

/** Payload attached to every notification so a tap can route to a screen. */
interface NotificationPayload extends Record<string, unknown> {
  kind: NotificationKind
}

/* ------------------------------------------------------------------ */
/* Setup                                                               */
/* ------------------------------------------------------------------ */

/**
 * How a notification behaves when it arrives while FORMA is in the foreground.
 * We still show it — a conflict warning the user never sees is worthless.
 *
 * Note the field names: SDK 57 splits the old `shouldShowAlert` into
 * `shouldShowBanner` (the heads-up) and `shouldShowList` (the shade entry).
 * `shouldShowAlert` still typechecks but is deprecated.
 *
 * ── The live-session exception ──────────────────────────────────────────────
 * On Android this handler decides whether a notification presented while the app
 * is foregrounded gets shown at all, so the live tracking notification has to
 * come through it too — otherwise the shade would be empty for the entire time
 * the athlete had FORMA open, and the metrics would only appear once they
 * backgrounded it. But it re-presents every two seconds for an hour, so it must
 * come through *silently*: sound and badge off. It is on a LOW-importance
 * channel, which is what stops `shouldShowBanner: true` from turning into a
 * heads-up banner every two seconds; the flag is only what makes it visible.
 */
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

// Whether our own channel exists. See ensureAndroidChannel — in Expo Go it
// can't be created, and triggers must then omit `channelId` entirely rather
// than point at a channel the OS doesn't have.
let channelReady = false
let channelChecked = false

/**
 * Try to create the Android channel. Returns whether we actually got one.
 *
 * ── Expo Go limitation ──────────────────────────────────────────────────────
 * Channel management is NOT available in Expo Go: the host app ships without a
 * `NotificationsChannelsProvider`, so the native call rejects with
 * `java.lang.NullPointerException: null cannot be cast to non-null type
 * expo.modules.notifications.notifications.channels.NotificationsChannelsProvider`.
 * That is a hard limitation of Expo Go, not a bug here — it resolves itself in
 * a development build, where the config plugin's channel/icon/colour apply.
 *
 * Failing softly matters: this used to throw out of requestPermissions(), which
 * the permission screen caught and rendered as "notifications are blocked" even
 * though permission had just been granted. Notifications still work fine in
 * Expo Go, they just land on Expo Go's default channel.
 */
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

/**
 * Spread into a trigger to target our channel, but only when it exists —
 * naming a channel the OS never created would drop the notification.
 */
function channelTarget(): { channelId?: string } {
  return channelReady ? { channelId: CHANNEL_ID } : {}
}

export type PermissionState = 'granted' | 'denied' | 'undetermined'

/** Current permission without prompting — used to reconcile state on launch. */
export async function getPermissionState(): Promise<PermissionState> {
  const { status } = await getPermissionsAsync()
  if (status === 'granted') return 'granted'
  if (status === 'denied') return 'denied'
  return 'undetermined'
}

/**
 * Ask for notification permission. Returns whether it ended up granted.
 *
 * Deliberately NOT gated on `Device.isDevice`: local notifications work fine on
 * the Android emulator, and the usual `if (!Device.isDevice) return` guard
 * copied from push-token tutorials would break exactly the environment this
 * project demos on.
 */
export async function requestPermissions(): Promise<boolean> {
  const existing = await getPermissionsAsync()
  if (existing.status === 'granted') {
    await ensureAndroidChannel()
    return true
  }
  // On Android 13+ this surfaces the POST_NOTIFICATIONS system dialog.
  await requestPermissionsAsync({
    ios: { allowAlert: true, allowBadge: true, allowSound: true },
  })

  // Re-read instead of trusting what the request resolved to.
  //
  // expo-notifications forwards `permissions[Platform.OS]` to the native module,
  // so on Android it passes `undefined` (the documented example object only has
  // an `ios` key) and the resolved status comes back stale. Observed on SDK 57 /
  // Android 16: the system dialog was accepted and `dumpsys package` reported
  // `POST_NOTIFICATIONS: granted=true`, yet the returned status was not
  // 'granted', so the UI wrongly showed "notifications are blocked".
  // getPermissionsAsync reflects the real OS state, so it decides.
  const after = await getPermissionsAsync()
  const granted = after.status === 'granted'
  if (granted) await ensureAndroidChannel()
  return granted
}

/* ------------------------------------------------------------------ */
/* Copy                                                                */
/* ------------------------------------------------------------------ */

/** Did the athlete already train on the given local calendar day? */
export function hasTrainedOn(sessions: Session[], day: Date = new Date()): boolean {
  const key = localISODate(day)
  return sessions.some((s) => localISODate(new Date(s.date)) === key)
}

/**
 * Body copy for the daily reminder. A coach, not a nag: if they've already
 * trained we congratulate instead of prodding, and if Form is deeply negative
 * we suggest backing off rather than pushing.
 */
export function dailyReminderBody(trainedToday: boolean, form: number): string {
  if (trainedToday) return "Nice work today! Rest up and recover well."
  if (form < -10) return 'Your fatigue is high — consider a lighter session or a rest day.'
  if (form > 5) return "You're fresh and recovered. Great day to train."
  return "Your body's ready. Time to train."
}

/** Weekly summary body, computed from the week's real sessions. */
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

/* ------------------------------------------------------------------ */
/* Scheduling                                                          */
/* ------------------------------------------------------------------ */

/** Context the schedulers need to write accurate copy. */
export interface ScheduleContext {
  sessions: Session[]
  weekSessions: Session[]
  form: number
}

/**
 * Daily training reminder at the user's chosen time, repeating.
 *
 * "Skip it if they already trained today" can't be a fire-time condition for a
 * local notification, so we do the honest equivalent: the body flips to a
 * congratulatory line, and we re-schedule after every logged session. The user
 * never gets prodded to train on a day they've already trained.
 */
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

/**
 * Weekly review, every Sunday evening. `weekday: 1` is Sunday (1-indexed from
 * Sunday), matching both the iOS and Android trigger semantics.
 */
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

/**
 * "Don't break your streak" nudge at 8 PM. Only scheduled when there's actually
 * a streak worth protecting, and cancelled outright once they've trained today —
 * so it can never nag someone who already did the work.
 */
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

/* ------------------------------------------------------------------ */
/* Immediate notifications                                             */
/* ------------------------------------------------------------------ */

/** Fire now. `trigger: null` means "deliver immediately". */
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

/**
 * Conflict alert, fired the moment detection returns — in addition to the
 * in-app modal. The value is the backgrounded case: log a session, switch apps,
 * and the warning still reaches you.
 */
export async function sendConflictNotification(
  conflict: Conflict,
  prefs: NotificationPreferences,
): Promise<void> {
  if (!prefs.enabled || !prefs.conflictAlerts) return
  const title = conflict.severity === 'danger' ? '🚨 High Injury Risk' : '⚠️ Training Conflict'
  await sendNow(title, conflict.message, 'conflict')
}

/**
 * Celebrate a streak milestone. Returns the milestone hit, or null if this
 * streak length isn't a milestone (so callers can tell "nothing to say" from
 * "notifications are off").
 */
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

/** The advisor-demo button: an immediate, unmistakably real FORMA notification. */
export async function sendTestNotification(): Promise<void> {
  await ensureAndroidChannel()
  await sendNow(
    'FORMA is watching your back 👊',
    "That's what a conflict warning will look like. Notifications are working.",
    'test',
  )
}

/* ------------------------------------------------------------------ */
/* Cancellation & sync                                                 */
/* ------------------------------------------------------------------ */

/** Cancel one schedule, tolerating "it wasn't scheduled anyway". */
async function cancelById(identifier: string): Promise<void> {
  try {
    await cancelScheduledNotificationAsync(identifier)
  } catch {
    // Nothing scheduled under that id — the desired end state either way.
  }
}

/** Drop every scheduled FORMA notification (logout, or master toggle off). */
export async function cancelAllNotifications(): Promise<void> {
  await cancelAllScheduledNotificationsAsync()
}

/**
 * Make the OS's scheduled set match `prefs` exactly.
 *
 * This is the single entry point for "reconcile schedules" and is called on
 * launch, whenever a preference changes, and after a session is logged. Because
 * every schedule has a stable identifier, running it repeatedly is idempotent —
 * it can never accumulate duplicates.
 */
export async function syncScheduledNotifications(
  prefs: NotificationPreferences,
  context: ScheduleContext,
): Promise<void> {
  // Permission can be revoked in system settings while we still hold
  // `enabled: true` in the profile, so the OS state is the real gate.
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

/** Read the routing payload off a tapped notification. */
export function kindFromResponse(
  response: NotificationResponse,
): NotificationKind | null {
  const data = response.notification.request.content.data as
    | Partial<NotificationPayload>
    | undefined
  return (data?.kind as NotificationKind | undefined) ?? null
}

/* ------------------------------------------------------------------ */
/* Tap plumbing                                                        */
/* ------------------------------------------------------------------ */
// Re-exported through this module on purpose: it keeps every
// `expo-notifications/build/…` import in one file (see the header note), so the
// day those internal paths move, only this file fails to compile.

export type { NotificationResponse }

/** Subscribe to notification taps while the app is running. */
export function addNotificationResponseListener(
  listener: (response: NotificationResponse) => void,
): EventSubscription {
  return addNotificationResponseReceivedListener(listener)
}

/**
 * The tap that launched the app, if it was launched by one. Needed because the
 * response listener above is registered too late to catch a cold start.
 */
export function getLastNotificationResponse(): Promise<NotificationResponse | null> {
  return getLastNotificationResponseAsync()
}
