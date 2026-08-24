/**
 * The live-session notification: FORMA's lock-screen dashboard.
 *
 * ## What this is
 *
 * An ongoing, silent notification carrying the same numbers the tracking screen
 * shows — elapsed, distance, pace, calories — re-presented in place a couple of
 * times a second's worth so the athlete can glance at a locked phone mid-run and
 * see where they are. This is the thing Strava has on Android and FORMA didn't.
 *
 * ## Why there are two notifications
 *
 * expo-location's `foregroundService` option builds and owns its own
 * notification, and exposes **no API to update its text after the service has
 * started** — `notificationTitle`/`notificationBody` are read once, when the task
 * is registered. Re-registering the task to change them tears down and rebuilds
 * the underlying location request, which drops fixes mid-run for a cosmetic
 * gain, and `LocationTaskConsumer.maybeStartForegroundService()` refuses to run
 * at all while the activity is paused — i.e. exactly when the lock screen is up
 * and the athlete would be reading it.
 *
 * So the division of labour is:
 *
 * - **expo-location's notification** keeps the process alive. It is pushed onto
 *   a `MIN`/`SECRET` channel with a one-word title so it sinks to the bottom of
 *   the shade and shows nothing on the lock screen.
 * - **This notification** carries the metrics, on a `LOW`/`PUBLIC` channel. `LOW`
 *   means no sound and no heads-up banner; `PUBLIC` is what actually puts the
 *   text on the lock screen rather than "FORMA: 1 new notification".
 *
 * ## Where the numbers come from
 *
 * Nowhere but {@link useLiveTrackingStore}. The caller passes metrics it has
 * already derived from `elapsedMsFrom()` and `gpsQualityFrom()` on its own 1 s
 * tick, so the shade and the screen are rendering the same instant of the same
 * state and cannot disagree. Nothing here reads a clock of its own, and nothing
 * here is driven by a location callback.
 *
 * ## KNOWN LIMITATION: the numbers freeze while the screen is off
 *
 * Updates are driven by the tracking screen's 1 s interval, and **React Native
 * stops JS timers on Android once the host activity pauses** — which is exactly
 * what happens when the screen goes off. `JavaTimerManager.onHostPause()` calls
 * `clearFrameCallback()`, and `TimerFrameCallback.doFrame()` returns early while
 * `isPaused` is set, so no `setInterval` fires (verified in
 * `react-native/ReactAndroid/.../core/JavaTimerManager.kt`, RN 0.86). The
 * foreground service keeps the *process* alive; it does not keep the RN host
 * resumed.
 *
 * So in practice this notification is live while FORMA is open, and shows the
 * last frame from just before the screen slept for as long as it stays asleep.
 * The clock catches up the moment the phone is woken (the AppState listener on
 * the tracking screen resyncs), and Pause/Resume tapped from the lock screen
 * redraw it immediately via {@link refreshLiveNotification}, because a
 * notification response is a native event rather than a timer.
 *
 * The only thing the OS reliably wakes mid-run is the location task. Driving the
 * notification from there would keep it ticking with the screen off, at GPS
 * cadence — but re-presenting from a location callback was ruled out for this
 * implementation, so this is a documented gap rather than an oversight. The
 * change, if it is ever wanted, is one throttled `refreshLiveNotification()` call
 * at the end of `ingestLocations`.
 *
 * ## The import style
 *
 * Deep `expo-notifications/build/…` imports, for the reason documented at length
 * in `notificationService.ts`: the package barrel throws at module scope in Expo
 * Go on Android. None of the leaf modules below pull in the offending
 * `DevicePushTokenAutoRegistration.fx`.
 */
import Constants from 'expo-constants'
import { Platform } from 'react-native'
import { scheduleNotificationAsync } from 'expo-notifications/build/scheduleNotificationAsync'
import { dismissNotificationAsync } from 'expo-notifications/build/dismissNotificationAsync'
import { setNotificationCategoryAsync } from 'expo-notifications/build/setNotificationCategoryAsync'
import { setNotificationChannelAsync } from 'expo-notifications/build/setNotificationChannelAsync'
import { DEFAULT_ACTION_IDENTIFIER } from 'expo-notifications/build/NotificationsEmitter'
import {
  AndroidImportance,
  AndroidNotificationVisibility,
} from 'expo-notifications/build/NotificationChannelManager.types'
import type { NotificationResponse } from 'expo-notifications/build/Notifications.types'
import {
  LIVE_LOCATION_TASK,
  elapsedMsFrom,
  ensureHydrated,
  gpsQualityFrom,
  hasBackgroundPermission,
  pauseSession,
  resumeSession,
  stopSession,
  useLiveTrackingStore,
  type GpsQuality,
} from '../store/liveTrackingStore'

/* ------------------------------------------------------------------ */
/* Identity                                                            */
/* ------------------------------------------------------------------ */

/**
 * Fixed identifier for the metrics notification.
 *
 * This is the whole update mechanism: presenting again with the same identifier
 * replaces the existing notification in place (Android reuses the tag), so a
 * 45-minute run leaves exactly one entry in the shade rather than 1,350 of them.
 * Nothing here ever generates an id.
 */
export const LIVE_NOTIFICATION_ID = 'forma-live-session'

/** The rich channel: LOW importance (silent, no heads-up), PUBLIC on the lock screen. */
export const LIVE_SESSION_CHANNEL_ID = 'forma-live-session'

/**
 * The channel expo-location's foreground-service notification lands on.
 *
 * **This id is not ours to choose.** `LocationTaskService` derives it natively as
 * `"${appScopeKey}:${taskName}"`, and in a bare/standalone app `appScopeKey` is
 * the Android package name (`ConstantsService.appScopeKey` → `context.packageName`).
 * It then calls `prepareChannel()`, which creates the channel **only if it does
 * not already exist** — so the one lever we have is to get there first and create
 * it ourselves with the settings we want. Android does not allow an app to lower
 * a channel's importance or visibility after creation, so first-run ordering is
 * the entire game: {@link setupTrackingChannels} must run before the location
 * feed ever starts.
 *
 * If the package name can't be resolved we fall back to a literal id. That
 * channel then goes unused (expo-location will create its own with default
 * settings), which costs us a tidier shade and nothing else.
 */
export const LOCATION_SERVICE_CHANNEL_ID = (() => {
  const pkg = Constants.expoConfig?.android?.package
  return pkg ? `${pkg}:${LIVE_LOCATION_TASK}` : 'forma-location-service'
})()

/**
 * Action categories. Two of them, because an Android notification's buttons come
 * from its category and a category's actions are fixed at registration — there
 * is no way to swap one button's label on a live notification. Presenting with a
 * different `categoryIdentifier` is how the Pause button becomes Resume.
 */
export const TRACKING_CATEGORY_ID = 'forma-tracking'
export const TRACKING_CATEGORY_PAUSED_ID = 'forma-tracking-paused'

export const TRACKING_ACTION = {
  pause: 'forma-pause',
  resume: 'forma-resume',
  stop: 'forma-stop',
} as const

/** Routing payload read by the response listener; see `useNotificationObserver`. */
export const LIVE_NOTIFICATION_SCREEN = 'live-tracker'

const COLOR_ACTIVE = '#22C55E'
const COLOR_PAUSED = '#F59E0B'

/**
 * Minimum gap between re-presents.
 *
 * The caller ticks once a second; every other tick is dropped. Two seconds is
 * slow enough that the notification manager isn't doing IPC work on a phone in
 * someone's pocket for an hour, and fast enough that a glance at the lock screen
 * never shows a stale second. Structural changes (pause, signal lost) bypass it
 * — see {@link updateLiveNotification}.
 */
const UPDATE_INTERVAL_MS = 2000

/* ------------------------------------------------------------------ */
/* Channel + category setup                                            */
/* ------------------------------------------------------------------ */

/** Memoised: channels and categories are idempotent but not free. */
let setupPromise: Promise<boolean> | null = null
/**
 * Whether the rich channel actually exists. When it doesn't (Expo Go can't
 * create channels at all — see `notificationService.ensureAndroidChannel`) the
 * notification is presented without a channel target, which lands it on the
 * default channel: still visible, just without our lock-screen guarantee.
 */
let channelReady = false

export function setupTrackingChannels(): Promise<boolean> {
  if (!setupPromise) setupPromise = runSetup()
  return setupPromise
}

async function runSetup(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    // Categories are still worth registering on iOS, where they drive the
    // long-press actions. Channels are an Android-only concept.
    await registerCategories()
    return false
  }

  try {
    await setNotificationChannelAsync(LIVE_SESSION_CHANNEL_ID, {
      name: 'Live session',
      description: 'Shows your time, distance and pace while a workout is recording.',
      // LOW, not DEFAULT: this notification re-presents every two seconds for an
      // hour. At DEFAULT importance Android would treat each one as new and pop a
      // heads-up banner over whatever the athlete is doing.
      importance: AndroidImportance.LOW,
      // The line that makes this feature work. Without PUBLIC, Android replaces
      // the content on the lock screen with "FORMA · Notification" and the
      // athlete has to unlock the phone to read their own pace.
      lockscreenVisibility: AndroidNotificationVisibility.PUBLIC,
      sound: null,
      enableVibrate: false,
      showBadge: false,
      lightColor: COLOR_ACTIVE,
    })
    channelReady = true
  } catch (err) {
    channelReady = false
    console.log(
      '[liveNotification] live-session channel unavailable (expected in Expo Go) — ' +
        'falling back to the default channel.',
      err,
    )
  }

  try {
    // Created here purely to pre-empt expo-location: see LOCATION_SERVICE_CHANNEL_ID.
    // Nothing of ours is ever posted to it.
    await setNotificationChannelAsync(LOCATION_SERVICE_CHANNEL_ID, {
      name: 'Location service',
      description: 'Keeps GPS running while a workout records. No alerts.',
      importance: AndroidImportance.MIN,
      lockscreenVisibility: AndroidNotificationVisibility.SECRET,
      sound: null,
      enableVibrate: false,
      showBadge: false,
    })
  } catch (err) {
    console.log('[liveNotification] location-service channel unavailable', err)
  }

  await registerCategories()
  return channelReady
}

async function registerCategories(): Promise<void> {
  // `opensAppToForeground: false` on Pause/Resume is the point of having them:
  // the athlete taps Pause at a crossing and the phone stays on the lock screen,
  // rather than FORMA jumping to the foreground in their hand.
  //
  // The documented caveat — a `false` action is dropped if the app has been
  // *killed* — does not bite here: a session in progress is holding a foreground
  // service, which is precisely what keeps the process (and this JS runtime)
  // alive. If the OS did tear it down anyway, the tap is a no-op and the
  // notification keeps counting, which is a visible, recoverable failure rather
  // than a silently lost workout.
  //
  // Stop is deliberately the opposite: ending a workout means going to the
  // summary to rate and save it, so it should bring FORMA forward.
  const stop = {
    identifier: TRACKING_ACTION.stop,
    buttonTitle: 'Stop',
    options: { opensAppToForeground: true, isDestructive: true },
  }
  try {
    await setNotificationCategoryAsync(TRACKING_CATEGORY_ID, [
      {
        identifier: TRACKING_ACTION.pause,
        buttonTitle: 'Pause',
        options: { opensAppToForeground: false },
      },
      stop,
    ])
    await setNotificationCategoryAsync(TRACKING_CATEGORY_PAUSED_ID, [
      {
        identifier: TRACKING_ACTION.resume,
        buttonTitle: 'Resume',
        options: { opensAppToForeground: false },
      },
      stop,
    ])
  } catch (err) {
    // Categories are unavailable in Expo Go for the same reason channels are.
    // The notification still presents; it just has no buttons.
    console.log('[liveNotification] notification categories unavailable', err)
  }
}

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */

/**
 * `M:SS` under an hour, `H:MM:SS` over it — the shade is narrow and a leading
 * `00:` in the title is two characters of nothing.
 */
export function formatNotificationClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

/** Everything the notification renders. All of it derived by the caller. */
export interface LiveNotificationMetrics {
  /** From `elapsedMsFrom(state)` — the same wall-clock value the timer shows. */
  elapsedMs: number
  distanceKm: number
  /** Pre-formatted pace/speed figure with no unit, e.g. `"5:32"` or `"24.3"`. */
  paceStr: string
  /**
   * Unit printed after {@link paceStr}. Defaults to `/km`; cycling passes
   * `km/h`, because "24.3 /km" would be a lie on a bike and the body copy is
   * the one place we can't hedge it.
   */
  paceUnit?: string
  calories: number
  isPaused: boolean
  /** From `gpsQualityFrom(state)`. Only `'lost'` changes what is rendered. */
  gpsQuality: GpsQuality
}

interface Rendered {
  title: string
  body: string
  color: string
  categoryIdentifier: string
}

function render(sport: string, m: LiveNotificationMetrics): Rendered {
  const clock = formatNotificationClock(m.elapsedMs)
  const title = m.isPaused ? `${sport} · PAUSED · ${clock}` : `${sport} · ${clock}`

  // With no signal there is no honest distance to show. Printing the last known
  // figure would leave a number frozen on the lock screen that the athlete is
  // still running past — the one reading worse than no reading. Calories come
  // from duration and RPE, so they stay true indoors.
  const body =
    m.gpsQuality === 'lost'
      ? `Indoor · ${Math.round(m.calories)} kcal`
      : `${m.distanceKm.toFixed(2)} km · ${m.paceStr} ${m.paceUnit ?? '/km'} · ` +
        `${Math.round(m.calories)} kcal`

  return {
    title,
    body,
    color: m.isPaused ? COLOR_PAUSED : COLOR_ACTIVE,
    categoryIdentifier: m.isPaused ? TRACKING_CATEGORY_PAUSED_ID : TRACKING_CATEGORY_ID,
  }
}

/* ------------------------------------------------------------------ */
/* Presentation                                                        */
/* ------------------------------------------------------------------ */

/** Sport label for the title; non-null exactly while the notification is live. */
let activeSport: string | null = null
/** Wall-clock ms of the last successful present, for the throttle. */
let lastUpdateAt = 0
/** What was last sent, so an unchanged second costs no native call at all. */
let lastRendered: Rendered | null = null
/**
 * The last metrics the caller supplied.
 *
 * Kept so {@link refreshLiveNotification} can redraw without a tick. Pace and
 * calories are carried over unchanged — neither lives in the store (calories
 * need the athlete's weight, pace needs the rolling window the screen owns), and
 * both were current as of a second ago, which is well inside what the shade can
 * show anyway.
 */
let lastMetrics: LiveNotificationMetrics | null = null

/**
 * Do two frames differ in a way the athlete must see immediately?
 *
 * Colour tracks paused/running, the category tracks which buttons are up, and an
 * "Indoor" body means the distance line has been withdrawn entirely. All three
 * are state changes rather than counter ticks, and holding one behind the
 * throttle reads as a button that didn't work.
 */
function isStructuralChange(next: Rendered, prev: Rendered | null): boolean {
  if (!prev) return true
  return (
    next.color !== prev.color ||
    next.categoryIdentifier !== prev.categoryIdentifier ||
    next.body.startsWith('Indoor ') !== prev.body.startsWith('Indoor ')
  )
}

async function present(r: Rendered): Promise<void> {
  await scheduleNotificationAsync({
    identifier: LIVE_NOTIFICATION_ID,
    content: {
      title: r.title,
      body: r.body,
      color: r.color,
      categoryIdentifier: r.categoryIdentifier,
      // `sticky` is Android's `setOngoing`: the athlete can't swipe their own
      // workout away mid-run, and it can't be cleared by "Clear all".
      sticky: true,
      autoDismiss: false,
      // Belt and braces over the LOW channel, which already silences this.
      sound: false,
      vibrate: [],
      data: { screen: LIVE_NOTIFICATION_SCREEN },
    },
    // NOT `trigger: null`, despite that being the usual "present now" form.
    //
    // `parseTrigger(null)` returns null, and a null trigger carries no channel —
    // so the notification lands on the default channel and the PUBLIC lock-screen
    // visibility we configured above never applies. A `ChannelAwareTriggerInput`
    // is the only way expo-notifications lets a locally-presented notification
    // name its channel, and it presents immediately just the same. On iOS
    // `parseTrigger` reduces this to null anyway, so it is exactly `trigger: null`
    // there.
    trigger: channelReady ? { channelId: LIVE_SESSION_CHANNEL_ID } : null,
  })
}

/**
 * Put the notification up for a session that has just begun.
 *
 * The first frame is rendered from the store rather than from arguments, so the
 * shade is correct from second zero instead of blank until the first tick — and
 * so the very first thing the notification ever shows came from the same
 * `elapsedMsFrom` the screen is reading.
 */
export async function startLiveNotification(sport: string): Promise<void> {
  activeSport = sport
  lastUpdateAt = 0
  lastRendered = null
  lastMetrics = null
  try {
    await setupTrackingChannels()
    const s = useLiveTrackingStore.getState()
    const now = Date.now()
    const first = render(sport, {
      elapsedMs: elapsedMsFrom(s, now),
      distanceKm: s.distanceM / 1000,
      paceStr: '--:--',
      calories: 0,
      isPaused: s.status === 'paused',
      gpsQuality: gpsQualityFrom(s, now),
    })
    await present(first)
    lastUpdateAt = Date.now()
    lastRendered = first
  } catch (err) {
    // A missing notification costs the athlete a lock-screen readout. It must
    // never cost them the workout, so this is logged and dropped.
    console.warn('[liveNotification] could not start', err)
  }
}

/**
 * Re-present with fresh numbers. Fire-and-forget by design — the caller is a
 * `setInterval` on the render path and must not await IPC.
 *
 * Three gates, in order:
 *  1. No active session → nothing to draw.
 *  2. Identical text → skip entirely. A stationary athlete with the clock ticking
 *     still changes the title every second, but an athlete on the summary screen
 *     or standing at a light doesn't, and this makes those cost nothing.
 *  3. The 2 s throttle — **bypassed for structural changes.** Pausing must flip
 *     the title, colour and buttons *now*; making someone stare at a "PAUSED"
 *     button that hasn't taken effect for two seconds reads as a broken app.
 */
export function updateLiveNotification(metrics: LiveNotificationMetrics): void {
  const sport = activeSport
  if (!sport) return

  const r = render(sport, metrics)
  const prev = lastRendered
  if (prev && r.title === prev.title && r.body === prev.body && r.color === prev.color) {
    return
  }

  const now = Date.now()
  if (!isStructuralChange(r, prev) && now - lastUpdateAt < UPDATE_INTERVAL_MS) return

  lastUpdateAt = now
  lastRendered = r
  lastMetrics = metrics
  void present(r).catch((err) => {
    console.warn('[liveNotification] update failed', err)
    // Let the next tick retry rather than sitting on a frame that never landed.
    lastRendered = null
  })
}

/**
 * Redraw immediately from current store state, without waiting for a tick.
 *
 * This exists for one case, and it matters: the athlete taps **Pause on the lock
 * screen**. The action lands (a notification response is a native event, not a
 * timer), the store flips to paused — and then nothing redraws, because the JS
 * timer that drives every other update is stopped while the host is paused. The
 * notification would sit there saying the run is still going, and the button
 * would read as broken.
 *
 * The clock and the signal state are re-read from the store so they are exact;
 * everything else is carried over from the last tick.
 */
export function refreshLiveNotification(): void {
  if (!activeSport || !lastMetrics) return
  const s = useLiveTrackingStore.getState()
  const now = Date.now()
  updateLiveNotification({
    ...lastMetrics,
    elapsedMs: elapsedMsFrom(s, now),
    distanceKm: s.distanceM / 1000,
    isPaused: s.status === 'paused',
    gpsQuality: gpsQualityFrom(s, now),
  })
}

/** Take the notification down. Idempotent; safe to call when nothing is up. */
export async function stopLiveNotification(): Promise<void> {
  activeSport = null
  lastUpdateAt = 0
  lastRendered = null
  lastMetrics = null
  try {
    await dismissNotificationAsync(LIVE_NOTIFICATION_ID)
  } catch (err) {
    // Dismissing something that isn't there rejects on some devices. Nothing to
    // recover; the id is fixed, so the next start replaces it either way.
    console.warn('[liveNotification] dismiss failed', err)
  }
}

/**
 * Clear a notification left behind by a crash — called once on app launch.
 *
 * Deliberately a *reconcile*, not a blind dismiss. Relaunching mid-run is the
 * normal case this whole feature exists for (the OS kills FORMA's JS context and
 * restarts it to deliver GPS batches), and dismissing then would tear the
 * lock-screen readout off a workout that is still recording. So: only clear it
 * when there is no session behind it. A live session's own notification is
 * re-presented by the tracking screen as soon as it restores.
 */
export async function reconcileLiveNotificationOnStart(): Promise<void> {
  try {
    await setupTrackingChannels()
    await ensureHydrated()
    if (useLiveTrackingStore.getState().status !== 'idle') return
    await dismissNotificationAsync(LIVE_NOTIFICATION_ID)
  } catch (err) {
    console.warn('[liveNotification] launch reconcile failed', err)
  }
}

/* ------------------------------------------------------------------ */
/* Action handling                                                     */
/* ------------------------------------------------------------------ */

/**
 * Apply a Pause/Resume/Stop tapped in the shade.
 *
 * Routed straight into the same store actions the on-screen buttons call, so
 * there is exactly one implementation of what pausing a workout means.
 *
 * @returns true when this response was one of ours and has been handled, so the
 *   caller knows not to run it through the ordinary notification routing.
 */
export function handleTrackingAction(response: NotificationResponse): boolean {
  const data = response.notification.request.content.data as
    | { screen?: unknown }
    | undefined
  if (data?.screen !== LIVE_NOTIFICATION_SCREEN) return false

  // Both branches redraw straight after applying the action. `pauseSession` and
  // `resumeSession` write the store synchronously before their first `await`, so
  // the state is already correct by the time these run — no need to wait on the
  // feed teardown/rebuild that follows.
  switch (response.actionIdentifier) {
    case TRACKING_ACTION.pause:
      void pauseSession()
      refreshLiveNotification()
      return true
    case TRACKING_ACTION.resume:
      void hasBackgroundPermission().then((bg) => {
        void resumeSession(bg)
        refreshLiveNotification()
      })
      return true
    case TRACKING_ACTION.stop:
      // Not dismissed here: `stopSession` settles the clock, and the tracking
      // screen takes the notification down when it lands on the summary. Doing
      // it in both places would be harmless but this keeps one owner.
      void stopSession()
      // Falls through to routing — Stop opens the app, and it should open onto
      // the workout it just ended.
      return false
    case DEFAULT_ACTION_IDENTIFIER:
      // A tap on the body. Nothing to apply; the caller navigates.
      return false
    default:
      return false
  }
}

/** Is this response from the live-session notification (a tap or an action)? */
export function isLiveNotificationResponse(response: NotificationResponse): boolean {
  const data = response.notification.request.content.data as
    | { screen?: unknown }
    | undefined
  return data?.screen === LIVE_NOTIFICATION_SCREEN
}
