// The live-session notification: FORMA's lock-screen dashboard.

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
import { NOTIFICATION_ACCENT, NOTIFICATION_WARN } from '../theme/tokens'
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

export const LIVE_NOTIFICATION_ID = 'forma-live-session'

export const LIVE_SESSION_CHANNEL_ID = 'forma-live-session'

export const LOCATION_SERVICE_CHANNEL_ID = (() => {
  const pkg = Constants.expoConfig?.android?.package
  return pkg ? `${pkg}:${LIVE_LOCATION_TASK}` : 'forma-location-service'
})()

export const TRACKING_CATEGORY_ID = 'forma-tracking'
export const TRACKING_CATEGORY_PAUSED_ID = 'forma-tracking-paused'

export const TRACKING_ACTION = {
  pause: 'forma-pause',
  resume: 'forma-resume',
  stop: 'forma-stop',
} as const

export const LIVE_NOTIFICATION_SCREEN = 'live-tracker'

const COLOR_ACTIVE = NOTIFICATION_ACCENT
const COLOR_PAUSED = NOTIFICATION_WARN

const UPDATE_INTERVAL_MS = 2000

let setupPromise: Promise<boolean> | null = null
let channelReady = false

export function setupTrackingChannels(): Promise<boolean> {
  if (!setupPromise) setupPromise = runSetup()
  return setupPromise
}

async function runSetup(): Promise<boolean> {
  if (Platform.OS !== 'android') {
    await registerCategories()
    return false
  }

  try {
    await setNotificationChannelAsync(LIVE_SESSION_CHANNEL_ID, {
      name: 'Live session',
      description: 'Shows your time, distance and pace while a workout is recording.',
      importance: AndroidImportance.LOW,
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
    console.log('[liveNotification] notification categories unavailable', err)
  }
}

export function formatNotificationClock(elapsedMs: number): string {
  const total = Math.max(0, Math.floor(elapsedMs / 1000))
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`
}

export interface LiveNotificationMetrics {
  elapsedMs: number
  distanceKm: number
  paceStr: string
  paceUnit?: string
  calories: number
  isPaused: boolean
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

interface NotificationContext {
  sportLabel: string
  paceUnit: string
  caloriesPerMs: number
}

let context: NotificationContext | null = null
let lastUpdateAt = 0
let lastRendered: Rendered | null = null

const CONTEXT_KEY = 'forma.liveNotification.v1'

const CONTEXT_PERSIST_INTERVAL_MS = 15_000

let lastContextPersistAt = 0

function persistContext(force = false): void {
  const ctx = context
  if (!ctx) return
  const now = Date.now()
  if (!force && now - lastContextPersistAt < CONTEXT_PERSIST_INTERVAL_MS) return
  lastContextPersistAt = now
  void AsyncStorage.setItem(CONTEXT_KEY, JSON.stringify(ctx)).catch((err) => {
    console.warn('[liveNotification] context persist failed', err)
  })
}

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
      sticky: true,
      autoDismiss: false,
      sound: false,
      vibrate: [],
      data: { screen: LIVE_NOTIFICATION_SCREEN },
    },
    trigger: channelReady ? { channelId: LIVE_SESSION_CHANNEL_ID } : null,
  })
}

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
    console.warn('[liveNotification] could not start', err)
  }
}

export function updateLiveNotification(metrics: LiveNotificationMetrics): void {
  const ctx = context
  if (!ctx) return

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
    lastRendered = null
  })
}

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
    refreshLiveNotification()
  } catch (err) {
    console.warn('[liveNotification] context recovery failed', err)
  }
}

export function refreshLiveNotification(): void {
  const s = useLiveTrackingStore.getState()
  if (s.status === 'idle' || s.finished) return

  const ctx = context
  if (!ctx) {
    if (!contextRecoveryStarted) {
      contextRecoveryStarted = true
      void recoverContext()
    }
    return
  }

  updateLiveNotification(metricsFromStore(ctx))
}

export async function stopLiveNotification(): Promise<void> {
  context = null
  lastUpdateAt = 0
  lastRendered = null
  lastContextPersistAt = 0
  contextRecoveryStarted = false
  try {
    await AsyncStorage.removeItem(CONTEXT_KEY)
  } catch (err) {
    console.warn('[liveNotification] context clear failed', err)
  }
  try {
    await dismissNotificationAsync(LIVE_NOTIFICATION_ID)
  } catch (err) {
    console.warn('[liveNotification] dismiss failed', err)
  }
}

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

export function handleTrackingAction(response: NotificationResponse): boolean {
  const data = response.notification.request.content.data as
    | { screen?: unknown }
    | undefined
  if (data?.screen !== LIVE_NOTIFICATION_SCREEN) return false

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
      void stopLiveNotification()
      return false
    case DEFAULT_ACTION_IDENTIFIER:
      return false
    default:
      return false
  }
}

setIngestObserver(refreshLiveNotification)

export function isLiveNotificationResponse(response: NotificationResponse): boolean {
  const data = response.notification.request.content.data as
    | { screen?: unknown }
    | undefined
  return data?.screen === LIVE_NOTIFICATION_SCREEN
}
