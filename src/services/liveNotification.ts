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
 * ## Two refresh paths, because one of them stops when the screen does
 *
 * **Screen on — the timer tick.** The tracking screen mirrors its rendered
 * values here on its 1 s interval, via {@link updateLiveNotification}. While the
 * app is visible this is the path, and it is the better one: it forwards
 * literally what is on screen, so the two surfaces cannot disagree.
 *
 * **Screen off — the location feed.** That interval stops dead the moment the
 * screen does. **React Native halts JS timers on Android once the host activity
 * pauses**: `JavaTimerManager.onHostPause()` calls `clearFrameCallback()`, and
 * `TimerFrameCallback.doFrame()` returns early while `isPaused` is set, so no
 * `setInterval` fires (verified in
 * `react-native/ReactAndroid/.../core/JavaTimerManager.kt`, RN 0.86). The
 * foreground service keeps the *process* alive; it does not keep the RN host
 * resumed. Left at that, the notification would freeze at whatever frame the
 * phone went dark on — precisely when the lock screen is the only way to read it.
 *
 * So the location feed becomes the heartbeat instead. A GPS batch is one of the
 * few things the OS still wakes us for, and `ingestLocations` calls the store's
 * ingest observer, which is {@link refreshLiveNotification} (registered at the
 * bottom of this file). At the 1 Hz sampling the tracker asks for, that redraws
 * at the same 2 s cadence the timer path does — the throttle in
 * {@link updateLiveNotification} is shared by both, so neither can outrun it.
 *
 * The consequence worth knowing: with the screen off, **updates arrive with the
 * fixes**. A workout with no signal at all (indoors, tunnel) has no heartbeat,
 * so its clock stops advancing in the shade until the phone is woken or a fix
 * lands. The distance was never going to move in that case, and the on-screen
 * clock is still exact the instant the athlete looks — but the shade will show a
 * stale time. The alternative would be a timer the OS refuses to run.
 *
 * Two smaller redraw triggers hang off the same function: Pause/Resume tapped in
 * the shade (a notification response is a native event, not a timer, so it fires
 * with the screen off), and the tracking screen coming back to the foreground.
 *
 * Because the screen-off path can run in a JS context that has never seen this
 * session — Android kills FORMA and rebuilds the bundle to deliver a batch — the
 * few things the store doesn't carry are mirrored to AsyncStorage. See
 * {@link NotificationContext}.
 *
 * ## The import style
 *
 * Deep `expo-notifications/build/…` imports, for the reason documented at length
 * in `notificationService.ts`: the package barrel throws at module scope in Expo
 * Go on Android. None of the leaf modules below pull in the offending
 * `DevicePushTokenAutoRegistration.fx`.
 */
import AsyncStorage from '@react-native-async-storage/async-storage'
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
import { formatPaceValue, rollingPaceSecPerKm } from '../utils/geo'
import {
  LIVE_LOCATION_TASK,
  PACE_MAX_SEC_PER_KM,
  PACE_SAMPLE_STALE_MS,
  PACE_WINDOW_MIN_M,
  PACE_WINDOW_MS,
  elapsedMsFrom,
  ensureHydrated,
  gpsQualityFrom,
  hasBackgroundPermission,
  pauseSession,
  resumeSession,
  setIngestObserver,
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

/**
 * The handful of things the notification needs that the store does not carry.
 *
 * Everything else — clock, distance, paused state, signal quality, the pace
 * window — is in `liveTrackingStore` and is read from there. This is the
 * remainder, and it is deliberately tiny, because it has to survive FORMA's JS
 * context being killed and rebuilt mid-run (see {@link refreshLiveNotification}).
 */
interface NotificationContext {
  /** Display name for the title, e.g. `"Running"`. */
  sportLabel: string
  /** `/km` or `km/h`, decided by the sport. */
  paceUnit: string
  /**
   * Calories per millisecond of elapsed time.
   *
   * A rate rather than a total, so calories can be recomputed against a live
   * clock without this module knowing the athlete's weight or assumed RPE.
   * `estimateCalories` is linear in duration for a fixed sport/effort/weight, so
   * `rate × elapsed` reproduces the screen's figure exactly — and, crucially, it
   * keeps advancing during a long screen-off stretch instead of freezing at
   * whatever the last visible tick happened to say.
   */
  caloriesPerMs: number
}

/** Non-null exactly while the notification is live. */
let context: NotificationContext | null = null
/** Wall-clock ms of the last successful present, for the throttle. */
let lastUpdateAt = 0
/** What was last sent, so an unchanged second costs no native call at all. */
let lastRendered: Rendered | null = null

/** Where {@link context} is mirrored so a rebuilt JS context can recover it. */
const CONTEXT_KEY = 'forma.liveNotification.v1'

/**
 * Don't rewrite the context more often than this. It changes slowly (the
 * calorie rate is near-constant for a given sport and effort), and it is only
 * ever read after a process death, so a stale-by-15s copy costs nothing.
 */
const CONTEXT_PERSIST_INTERVAL_MS = 15_000

let lastContextPersistAt = 0

function persistContext(force = false): void {
  const ctx = context
  if (!ctx) return
  const now = Date.now()
  if (!force && now - lastContextPersistAt < CONTEXT_PERSIST_INTERVAL_MS) return
  lastContextPersistAt = now
  void AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx)).catch((err) => {
    // Costs us the ability to redraw after a process death, nothing more.
    console.warn('[liveNotification] context persist failed', err)
  })
}

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
 * The first frame is composed from the store rather than from arguments, so the
 * shade is correct from second zero instead of blank until the first tick — and
 * so the very first thing the notification ever shows came off the same
 * `elapsedMsFrom` the screen is reading.
 */
export async function startLiveNotification(sport: string): Promise<void> {
  const ctx: NotificationContext = { sportLabel: sport, paceUnit: '/km', caloriesPerMs: 0 }
  context = ctx
  lastUpdateAt = 0
  lastRendered = null
  lastContextPersistAt = 0
  contextRecoveryStarted = false
  persistContext(true)
  try {
    await setupTrackingChannels()
    const first = render(sport, metricsFromStore(ctx))
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
  const ctx = context
  if (!ctx) return

  // Keep the recovery context current on every tick, whether or not this frame
  // is actually presented — it is what a rebuilt JS context reads to carry on
  // drawing, and it must reflect the newest thing the screen knew.
  ctx.paceUnit = metrics.paceUnit ?? '/km'
  if (metrics.elapsedMs > 0) ctx.caloriesPerMs = metrics.calories / metrics.elapsedMs
  persistContext()

  const r = render(ctx.sportLabel, metrics)
  const prev = lastRendered
  if (prev && r.title === prev.title && r.body === prev.body && r.color === prev.color) {
    return
  }

  const now = Date.now()
  if (!isStructuralChange(r, prev) && now - lastUpdateAt < UPDATE_INTERVAL_MS) return

  lastUpdateAt = now
  lastRendered = r
  void present(r).catch((err) => {
    console.warn('[liveNotification] update failed', err)
    // Let the next tick retry rather than sitting on a frame that never landed.
    lastRendered = null
  })
}

/**
 * Compose a frame entirely from the store plus the recovery context.
 *
 * Every figure here is produced the same way the tracking screen produces it —
 * `elapsedMsFrom` for the clock, `gpsQualityFrom` for the signal state, and
 * `rollingPaceSecPerKm` over the store's own pace samples with the store's own
 * window constants. It is the same derivation running in a different place, not
 * a second derivation that could drift.
 */
function metricsFromStore(ctx: NotificationContext): LiveNotificationMetrics {
  const s = useLiveTrackingStore.getState()
  const now = Date.now()
  const elapsedMs = elapsedMsFrom(s, now)

  const secPerKm = rollingPaceSecPerKm(s.paceSamples, now, {
    windowMs: PACE_WINDOW_MS,
    minDistanceM: PACE_WINDOW_MIN_M,
    staleMs: PACE_SAMPLE_STALE_MS,
    maxSecPerKm: PACE_MAX_SEC_PER_KM,
  })
  // Rounded before formatting, exactly as the screen does, so the two can't
  // disagree by a second at a boundary.
  const rounded = secPerKm == null ? null : Math.round(secPerKm)
  const paceStr =
    ctx.paceUnit === 'km/h'
      ? rounded != null
        ? (3600 / rounded).toFixed(1)
        : '--.-'
      : formatPaceValue(rounded).replace(' /km', '')

  return {
    elapsedMs,
    distanceKm: s.distanceM / 1000,
    paceStr,
    paceUnit: ctx.paceUnit,
    calories: ctx.caloriesPerMs * elapsedMs,
    isPaused: s.status === 'paused',
    gpsQuality: gpsQualityFrom(s, now),
  }
}

/** One attempt per JS context at recovering {@link context} from storage. */
let contextRecoveryStarted = false

async function recoverContext(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(CONTEXT_KEY)
    if (!raw) return
    const parsed = JSON.parse(raw) as Partial<NotificationContext>
    if (!parsed?.sportLabel) return
    await setupTrackingChannels()
    context = {
      sportLabel: parsed.sportLabel,
      paceUnit: parsed.paceUnit ?? '/km',
      caloriesPerMs: Number(parsed.caloriesPerMs) || 0,
    }
    // Draw straight away: the batch that woke us is the reason we're here.
    refreshLiveNotification()
  } catch (err) {
    console.warn('[liveNotification] context recovery failed', err)
  }
}

/**
 * Redraw from current store state, without waiting for a timer tick.
 *
 * **This is the update path whenever the screen is off** — see the module header.
 * React Native stops JS timers once the Android host pauses, so the tracking
 * screen's interval is frozen at exactly the moment the lock screen is up; the
 * location batches the OS still delivers become the heartbeat instead, via the
 * store's ingest observer. It is also what redraws after Pause or Resume is
 * tapped in the shade, where the store flips but no tick is coming to notice.
 *
 * Recomputing rather than replaying the last tick's frame is what makes a long
 * screen-off stretch work: pace comes off the store's live pace window and
 * calories off a rate against the live clock, so both keep moving instead of
 * freezing at whatever was on screen when the phone went dark.
 *
 * Throttling is left entirely to {@link updateLiveNotification} — the same 2 s
 * guard the timer path uses, so a 1 Hz GPS feed redraws at the same cadence a
 * visible screen does.
 */
export function refreshLiveNotification(): void {
  const s = useLiveTrackingStore.getState()
  // `finished` means Stop has been tapped and the athlete is on the summary; a
  // late fix must not resurrect a notification for a workout that is over.
  if (s.status === 'idle' || s.finished) return

  const ctx = context
  if (!ctx) {
    // No context in this JS process. Either nothing is running (the store check
    // above would have caught that), or Android killed FORMA mid-run and rebuilt
    // the bundle to hand us a location batch — the case this whole background
    // architecture exists for. Go and find it; the notification itself survived,
    // because it is owned by the OS rather than by us.
    if (!contextRecoveryStarted) {
      contextRecoveryStarted = true
      void recoverContext()
    }
    return
  }

  updateLiveNotification(metricsFromStore(ctx))
}

/** Take the notification down. Idempotent; safe to call when nothing is up. */
export async function stopLiveNotification(): Promise<void> {
  context = null
  lastUpdateAt = 0
  lastRendered = null
  lastContextPersistAt = 0
  // Cleared too, or a stray fix arriving after the save would recover the context
  // and put the notification back up for a workout that no longer exists.
  contextRecoveryStarted = false
  try {
    await AsyncStorage.removeItem(CONTEXT_KEY)
  } catch (err) {
    console.warn('[liveNotification] context clear failed', err)
  }
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
      void stopSession()
      // Taken down here, not left to the tracking screen: that screen's Stop
      // handler is a different path entirely, and its restore effect only routes
      // a finished session to the summary. Without this the shade would keep a
      // frozen frame up for a workout that had already ended.
      void stopLiveNotification()
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

/* ------------------------------------------------------------------ */
/* Wiring                                                              */
/* ------------------------------------------------------------------ */

/**
 * Subscribe to the store's ingest, at module scope.
 *
 * Module scope rather than a component effect, for the same reason the location
 * task is defined there: when Android wakes FORMA headlessly to deliver a batch
 * there is no React tree, and a subscription registered behind a lifecycle would
 * simply not exist in that process. Everything downstream of this no-ops cheaply
 * when no session is running.
 */
setIngestObserver(refreshLiveNotification)

/** Is this response from the live-session notification (a tap or an action)? */
export function isLiveNotificationResponse(response: NotificationResponse): boolean {
  const data = response.notification.request.content.data as
    | { screen?: unknown }
    | undefined
  return data?.screen === LIVE_NOTIFICATION_SCREEN
}
