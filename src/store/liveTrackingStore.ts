// The live-workout state machine: time, distance, route, pace, GPS.

import AsyncStorage from '@react-native-async-storage/async-storage'
import * as Location from 'expo-location'
import { Platform } from 'react-native'
import { create } from 'zustand'
import {
  haversineDistance,
  isValidCoordinate,
  trimPaceSamples,
  type PaceSample,
} from '../utils/geo'
import {
  EMPTY_MOVING_TIME,
  foldMovingTime,
  settleMovingTime,
  type MovingTimeState,
} from '../algorithms/movingTime'
import type { RoutePoint, SportType } from '../types/session'
import { NOTIFICATION_ACCENT } from '../theme/tokens'

export const LIVE_LOCATION_TASK = 'forma-live-location'

const STORAGE_KEY = 'forma.liveTracking.v3'

const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000

const PERSIST_MIN_INTERVAL_MS = 4000

const MAX_ACCURACY_M = 25

const WARMUP_FIXES = 2

const MAX_PLAUSIBLE_SPEED_MS: Record<SportType, number> = {
  running: 6.5,
  swimming: 3.5,
  cycling: 20,
  combat: 6.5,
  football: 6.5,
  gym: 6.5,
  strength: 6.5,
}

function maxSpeedFor(sport: SportType | null): number {
  return (sport && MAX_PLAUSIBLE_SPEED_MS[sport]) || 6.5
}

const MIN_JUMP_DT_SEC = 0.25

const MIN_SEGMENT_M = 3

const STATIONARY_SPEED_MS = 0.5

const STATIONARY_MAX_SEGMENT_M = 5

const MAX_ROUTE_POINTS = 1000

const MAX_DEBUG_REJECTS = 100

export const PACE_WINDOW_MS = 30_000

export const PACE_WINDOW_MIN_M = 30

export const PACE_SAMPLE_STALE_MS = 20_000

export const PACE_MAX_SEC_PER_KM = 1_800

export type GpsQuality = 'acquiring' | 'good' | 'weak' | 'lost'

export const GPS_GOOD_MAX_AGE_MS = 5_000
export const GPS_GOOD_ACCURACY_M = 20
export const GPS_WEAK_ACCURACY_M = 50
export const GPS_LOST_AFTER_MS = 15_000

export const GPS_INDOOR_AFTER_MS = 60_000

export function gpsQualityFrom(s: LiveTrackingState, now = Date.now()): GpsQuality {
  if (s.status === 'idle' || !s.startedAt) return 'acquiring'
  const age = now - s.lastFixAt
  if (!s.hasFix) return age > GPS_LOST_AFTER_MS ? 'lost' : 'acquiring'
  if (age > GPS_LOST_AFTER_MS) return 'lost'
  const acc = s.lastAccuracyM
  if (age <= GPS_GOOD_MAX_AGE_MS && acc != null && acc <= GPS_GOOD_ACCURACY_M) return 'good'
  return 'weak'
}

export function isIndoorBlackout(s: LiveTrackingState, now = Date.now()): boolean {
  if (s.status !== 'tracking' || !s.startedAt) return false
  return now - s.lastFixAt > GPS_INDOOR_AFTER_MS
}

export type GpsQualitySummary = 'good' | 'partial' | 'none'

const GOOD_SUMMARY_RATIO = 0.7

export function gpsQualitySummaryFrom(s: LiveTrackingState): GpsQualitySummary {
  if (s.distanceM <= 0 || s.route.length < 2) return 'none'
  const total = s.acceptedFixes + s.discardedFixes
  if (total === 0) return 'none'
  return s.acceptedFixes / total >= GOOD_SUMMARY_RATIO ? 'good' : 'partial'
}

const DEBUG = true

function log(...args: unknown[]): void {
  if (DEBUG) console.log('[liveTracking]', ...args)
}

export interface RejectedFix {
  at: number
  reason: 'accuracy' | 'jump'
  latitude: number
  longitude: number
  accuracyM: number | null
  impliedSpeedMs?: number
}

function locationOptions(): Location.LocationTaskOptions {
  return {
    accuracy: Location.Accuracy.BestForNavigation,
    timeInterval: 1000,
    distanceInterval: 0,
    mayShowUserSettingsDialog: true,
    pausesUpdatesAutomatically: false,
    activityType: Location.ActivityType.Fitness,
  }
}

export function warmupLocationOptions(): Location.LocationOptions {
  return {
    accuracy: Location.Accuracy.High,
    timeInterval: 2000,
    distanceInterval: 0,
    mayShowUserSettingsDialog: true,
  }
}

const FOREGROUND_SERVICE = {
  notificationTitle: 'FORMA',
  notificationBody: 'Recording location',
  notificationColor: NOTIFICATION_ACCENT,
  killServiceOnDestroy: false,
} as const

export type LiveStatus = 'idle' | 'tracking' | 'paused'

export type FeedMode =
  | 'none'
  | 'background'
  | 'foreground'

export interface LiveTrackingState {
  status: LiveStatus
  sport: SportType | null

  startedAt: number
  pausedDurationMs: number
  pausedAt: number

  distanceM: number
  route: RoutePoint[]
  paceSamples: PaceSample[]
  lastPoint: RoutePoint | null
  lastPointAt: number
  lastStamp: number
  warmupLeft: number
  movingTime: MovingTimeState

  lastFixAt: number
  lastAccuracyM: number | null
  hasFix: boolean
  acceptedFixes: number
  discardedFixes: number
  debugRejects: RejectedFix[]

  finished: boolean
  feedMode: FeedMode
  hydrated: boolean
}

const EMPTY: LiveTrackingState = {
  status: 'idle',
  sport: null,
  startedAt: 0,
  pausedDurationMs: 0,
  pausedAt: 0,
  distanceM: 0,
  route: [],
  paceSamples: [],
  lastPoint: null,
  lastPointAt: 0,
  lastStamp: 0,
  warmupLeft: 0,
  movingTime: EMPTY_MOVING_TIME,
  lastFixAt: 0,
  lastAccuracyM: null,
  hasFix: false,
  acceptedFixes: 0,
  discardedFixes: 0,
  debugRejects: [],
  finished: false,
  feedMode: 'none',
  hydrated: false,
}

export const useLiveTrackingStore = create<LiveTrackingState>(() => ({ ...EMPTY }))

const get = useLiveTrackingStore.getState
const set = useLiveTrackingStore.setState

export function elapsedMsFrom(s: LiveTrackingState, now = Date.now()): number {
  if (!s.startedAt) return 0
  const end = s.pausedAt > 0 ? s.pausedAt : now
  const total = end - s.startedAt - s.pausedDurationMs
  return Number.isFinite(total) && total > 0 ? total : 0
}

export function hasActiveSession(s: LiveTrackingState): boolean {
  return s.status !== 'idle'
}

export function movingTimeMsFrom(s: LiveTrackingState, now = Date.now()): number {
  return settleMovingTime(s.movingTime, elapsedMsFrom(s, now), s.route.length >= 2)
}

type Persisted = Omit<LiveTrackingState, 'hydrated' | 'feedMode' | 'debugRejects'>

let lastPersistAt = 0

async function persist(force = false): Promise<void> {
  const s = get()
  const now = Date.now()
  if (!force && now - lastPersistAt < PERSIST_MIN_INTERVAL_MS) return
  lastPersistAt = now
  try {
    if (s.status === 'idle') {
      await AsyncStorage.removeItem(STORAGE_KEY)
      return
    }
    const snapshot: Persisted = {
      status: s.status,
      sport: s.sport,
      startedAt: s.startedAt,
      pausedDurationMs: s.pausedDurationMs,
      pausedAt: s.pausedAt,
      distanceM: s.distanceM,
      route: s.route,
      paceSamples: s.paceSamples,
      lastPoint: s.lastPoint,
      lastPointAt: s.lastPointAt,
      lastStamp: s.lastStamp,
      warmupLeft: s.warmupLeft,
      movingTime: s.movingTime,
      lastFixAt: s.lastFixAt,
      lastAccuracyM: s.lastAccuracyM,
      hasFix: s.hasFix,
      acceptedFixes: s.acceptedFixes,
      discardedFixes: s.discardedFixes,
      finished: s.finished,
    }
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot))
  } catch (err) {
    console.warn('[liveTracking] persist failed', err)
  }
}

let hydrating: Promise<void> | null = null

export function ensureHydrated(): Promise<void> {
  if (get().hydrated) return Promise.resolve()
  if (!hydrating) {
    hydrating = readSnapshot().finally(() => {
      hydrating = null
    })
  }
  return hydrating
}

async function readSnapshot(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY)
    if (!raw) {
      set({ hydrated: true })
      return
    }
    const parsed = JSON.parse(raw) as Partial<Persisted>
    const startedAt = Number(parsed.startedAt) || 0
    if (!startedAt || Date.now() - startedAt > SESSION_MAX_AGE_MS) {
      set({ ...EMPTY, hydrated: true })
      await AsyncStorage.removeItem(STORAGE_KEY).catch(() => {})
      return
    }
    const status: LiveStatus = parsed.status === 'paused' ? 'paused' : 'tracking'
    const pausedAt = Number(parsed.pausedAt) || 0
    set({
      ...EMPTY,
      status,
      sport: parsed.sport ?? null,
      startedAt,
      pausedDurationMs: Number(parsed.pausedDurationMs) || 0,
      pausedAt: status === 'paused' ? pausedAt || Number(parsed.lastFixAt) || startedAt : 0,
      distanceM: Number(parsed.distanceM) || 0,
      route: Array.isArray(parsed.route) ? parsed.route : [],
      paceSamples: Array.isArray(parsed.paceSamples) ? parsed.paceSamples : [],
      lastPoint: parsed.lastPoint ?? null,
      lastPointAt: Number(parsed.lastPointAt) || 0,
      lastStamp: Number(parsed.lastStamp) || 0,
      warmupLeft: Number(parsed.warmupLeft) || 0,
      movingTime: {
        movingMs: Number(parsed.movingTime?.movingMs) || 0,
        stoppedRunMs: Number(parsed.movingTime?.stoppedRunMs) || 0,
        lastSampleAt: 0,
      },
      lastFixAt: Number(parsed.lastFixAt) || startedAt,
      lastAccuracyM:
        parsed.lastAccuracyM != null && Number.isFinite(Number(parsed.lastAccuracyM))
          ? Number(parsed.lastAccuracyM)
          : null,
      hasFix: parsed.hasFix === true,
      acceptedFixes: Number(parsed.acceptedFixes) || 0,
      discardedFixes: Number(parsed.discardedFixes) || 0,
      finished: parsed.finished === true,
      hydrated: true,
    })
  } catch (err) {
    console.warn('[liveTracking] hydrate failed', err)
    set({ ...EMPTY, hydrated: true })
  }
}

function appendPoint(route: RoutePoint[], point: RoutePoint): RoutePoint[] {
  if (route.length + 1 <= MAX_ROUTE_POINTS) return [...route, point]
  const halved = route.filter((_, i) => i % 2 === 0)
  halved.push(point)
  return halved
}

function noteReject(s: LiveTrackingState, reject: RejectedFix): RejectedFix[] {
  const next = [...s.debugRejects, reject]
  return next.length > MAX_DEBUG_REJECTS ? next.slice(next.length - MAX_DEBUG_REJECTS) : next
}

function foldLocation(
  s: LiveTrackingState,
  loc: Location.LocationObject,
  receivedAt: number,
): Partial<LiveTrackingState> | null {
  const coords = loc?.coords
  if (!coords) return null
  const { latitude, longitude, accuracy, altitude, speed: reportedSpeed } = coords

  if (!isValidCoordinate(latitude, longitude)) {
    log('reject: invalid coordinate', latitude, longitude)
    return null
  }

  const stamp = Number.isFinite(loc.timestamp) ? loc.timestamp : receivedAt

  if (Number.isFinite(loc.timestamp) && stamp <= s.lastStamp) return null

  const accuracyM = accuracy != null && Number.isFinite(accuracy) ? accuracy : null

  const seen = {
    lastFixAt: receivedAt,
    lastAccuracyM: accuracyM,
    lastStamp: stamp,
    hasFix: true,
  }

  if (accuracyM != null && accuracyM > MAX_ACCURACY_M) {
    log(`reject: accuracy ${accuracyM.toFixed(0)}m > ${MAX_ACCURACY_M}m`)
    return {
      ...seen,
      discardedFixes: s.discardedFixes + 1,
      movingTime: { ...s.movingTime, lastSampleAt: receivedAt },
      debugRejects: noteReject(s, {
        at: receivedAt,
        reason: 'accuracy',
        latitude,
        longitude,
        accuracyM,
      }),
    }
  }

  const prev = s.lastPoint
  const seg = prev
    ? haversineDistance(prev.latitude, prev.longitude, latitude, longitude)
    : 0

  const sinceLastSampleSec = s.movingTime.lastSampleAt
    ? (receivedAt - s.movingTime.lastSampleAt) / 1000
    : 0
  const effectiveSpeed =
    reportedSpeed != null && Number.isFinite(reportedSpeed) && reportedSpeed >= 0
      ? reportedSpeed
      : prev && sinceLastSampleSec > 0
        ? seg / sinceLastSampleSec
        : null
  const movingTime = foldMovingTime(s.movingTime, receivedAt, effectiveSpeed)

  const accepted = { ...seen, acceptedFixes: s.acceptedFixes + 1, movingTime }

  if (s.warmupLeft > 0) {
    log(`warm-up: discarding fix (${s.warmupLeft} left)`)
    return { ...accepted, warmupLeft: s.warmupLeft - 1 }
  }

  const point: RoutePoint = {
    latitude,
    longitude,
    timestamp: stamp,
    ...(altitude != null && Number.isFinite(altitude) ? { altitude } : null),
  }

  if (!prev) {
    log('anchor: first point of segment')
    return {
      ...accepted,
      lastPoint: point,
      lastPointAt: receivedAt,
      paceSamples: [{ t: receivedAt, m: s.distanceM }],
      route: appendPoint(s.route, point),
    }
  }

  if (seg < MIN_SEGMENT_M) return accepted

  if (
    reportedSpeed != null &&
    Number.isFinite(reportedSpeed) &&
    reportedSpeed >= 0 &&
    reportedSpeed < STATIONARY_SPEED_MS &&
    seg < STATIONARY_MAX_SEGMENT_M
  ) {
    log(`stationary: dropping ${seg.toFixed(1)}m of drift`)
    return accepted
  }

  const ceiling = maxSpeedFor(s.sport)
  const dtSec = Math.max((receivedAt - s.lastPointAt) / 1000, MIN_JUMP_DT_SEC)
  const impliedSpeed = seg / dtSec
  if (impliedSpeed > ceiling) {
    log(
      `reject: implausible ${seg.toFixed(0)}m in ${dtSec.toFixed(1)}s ` +
        `(${impliedSpeed.toFixed(1)} m/s > ${ceiling} m/s) — re-anchoring`,
    )
    return {
      ...seen,
      discardedFixes: s.discardedFixes + 1,
      movingTime,
      debugRejects: noteReject(s, {
        at: receivedAt,
        reason: 'jump',
        latitude,
        longitude,
        accuracyM,
        impliedSpeedMs: impliedSpeed,
      }),
      lastPoint: point,
      lastPointAt: receivedAt,
    }
  }

  const total = s.distanceM + seg
  if (!Number.isFinite(total)) {
    return { ...accepted, lastPoint: point, lastPointAt: receivedAt }
  }

  const samples = trimPaceSamples(s.paceSamples, receivedAt, PACE_WINDOW_MS)
  return {
    ...accepted,
    lastPoint: point,
    lastPointAt: receivedAt,
    distanceM: total,
    paceSamples: [...samples, { t: receivedAt, m: total }],
    route: appendPoint(s.route, point),
  }
}

type IngestObserver = () => void

let ingestObserver: IngestObserver | null = null

export function setIngestObserver(observer: IngestObserver | null): void {
  ingestObserver = observer
}

export async function ingestLocations(
  locations: Location.LocationObject[],
  source: 'watch' | 'task' = 'task',
): Promise<void> {
  if (!locations?.length) return
  await ensureHydrated()

  const before = get()
  if (before.status !== 'tracking') {
    log(`ignoring ${locations.length} fix(es) from ${source} — status ${before.status}`)
    return
  }

  const batchAt = Date.now()
  const stamps = locations
    .map((loc) => (Number.isFinite(loc?.timestamp) ? loc.timestamp : NaN))
    .filter((t) => Number.isFinite(t))
  const newest = stamps.length ? Math.max(...stamps) : NaN
  const skew = Number.isFinite(newest) ? batchAt - newest : 0

  let working = before
  let merged: Partial<LiveTrackingState> = {}
  let used = 0
  for (const loc of locations) {
    const raw = Number.isFinite(loc?.timestamp) ? loc.timestamp + skew : batchAt
    const receivedAt = Math.min(raw, batchAt)
    const patch = foldLocation(working, loc, receivedAt)
    if (!patch) continue
    working = { ...working, ...patch }
    merged = { ...merged, ...patch }
    used += 1
  }

  if (used === 0) {
    log(`batch from ${source}: ${locations.length} fix(es), none usable`)
    return
  }

  set(merged)

  log(
    `batch from ${source}: ${used}/${locations.length} used · ` +
      `total ${working.distanceM.toFixed(1)}m · route ${working.route.length} pts · ` +
      `gps ${gpsQualityFrom(working, batchAt)}`,
  )
  await persist()

  try {
    ingestObserver?.()
  } catch (err) {
    console.warn('[liveTracking] ingest observer failed', err)
  }
}

let foregroundWatch: Location.LocationSubscription | null = null
let watchGeneration = 0

export async function isBackgroundFeedRunning(): Promise<boolean> {
  try {
    return await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)
  } catch {
    return false
  }
}

export async function startLocationFeed(useBackground: boolean): Promise<FeedMode> {
  await stopLocationFeed()
  const generation = ++watchGeneration

  let background = false
  if (useBackground) {
    try {
      await Location.startLocationUpdatesAsync(LIVE_LOCATION_TASK, {
        ...locationOptions(),
        foregroundService: FOREGROUND_SERVICE,
        showsBackgroundLocationIndicator: true,
      })
      background = true
      log('background task started')
    } catch (err) {
      console.warn('[liveTracking] background task failed to start', err)
    }
  }

  let foreground = false
  try {
    const sub = await Location.watchPositionAsync(
      locationOptions(),
      (loc) => {
        void ingestLocations([loc], 'watch')
      },
      (reason) => {
        console.warn('[liveTracking] watcher error', reason)
      },
    )
    if (generation !== watchGeneration) {
      sub.remove()
      return 'none'
    }
    foregroundWatch = sub
    foreground = true
    log('foreground watcher started')
  } catch (err) {
    console.warn('[liveTracking] foreground watcher failed to start', err)
  }

  const mode: FeedMode = background ? 'background' : foreground ? 'foreground' : 'none'
  set({ feedMode: mode })
  log(`feed mode: ${mode} (background=${background} foreground=${foreground})`)
  return mode
}

export async function stopLocationFeed(): Promise<void> {
  watchGeneration += 1
  try {
    foregroundWatch?.remove()
  } catch {
  }
  foregroundWatch = null

  try {
    if (await Location.hasStartedLocationUpdatesAsync(LIVE_LOCATION_TASK)) {
      await Location.stopLocationUpdatesAsync(LIVE_LOCATION_TASK)
    }
  } catch (err) {
    console.warn('[liveTracking] stopping background updates failed', err)
  }
  set({ feedMode: 'none' })
}

export async function beginSession(
  sport: SportType,
  useBackground: boolean,
): Promise<FeedMode> {
  const now = Date.now()
  set({
    ...EMPTY,
    status: 'tracking',
    sport,
    startedAt: now,
    pausedDurationMs: 0,
    pausedAt: 0,
    warmupLeft: WARMUP_FIXES,
    lastFixAt: now,
    hydrated: true,
  })
  log(`session begin: sport=${sport} background=${useBackground}`)
  await persist(true)
  return startLocationFeed(useBackground)
}

export async function pauseSession(): Promise<void> {
  const s = get()
  if (s.status !== 'tracking') return
  set({
    status: 'paused',
    pausedAt: Date.now(),
    lastPoint: null,
    lastPointAt: 0,
    paceSamples: [],
    movingTime: { ...s.movingTime, lastSampleAt: 0, stoppedRunMs: 0 },
  })
  await persist(true)
  await stopLocationFeed()
  log('session paused')
}

export async function resumeSession(useBackground: boolean): Promise<FeedMode> {
  const s = get()
  if (s.status !== 'paused') return get().feedMode
  const now = Date.now()
  set({
    status: 'tracking',
    pausedDurationMs: s.pausedDurationMs + Math.max(0, now - (s.pausedAt || now)),
    pausedAt: 0,
    lastFixAt: now,
    movingTime: { ...s.movingTime, lastSampleAt: 0, stoppedRunMs: 0 },
    lastAccuracyM: null,
  })
  await persist(true)
  return startLocationFeed(useBackground)
}

export async function restartFeed(useBackground: boolean): Promise<FeedMode> {
  if (get().status !== 'tracking') return get().feedMode
  set({ lastFixAt: Date.now(), lastAccuracyM: null })
  return startLocationFeed(useBackground)
}

export async function stopSession(): Promise<void> {
  const s = get()
  if (s.status === 'idle') return
  set({
    status: 'paused',
    finished: true,
    pausedAt: s.pausedAt || Date.now(),
  })
  await persist(true)
  await stopLocationFeed()
  const done = get()
  log(
    `session stopped: ${(done.distanceM / 1000).toFixed(3)} km · ` +
      `${Math.round(elapsedMsFrom(done) / 1000)}s · ${done.route.length} route pts · ` +
      `gps ${gpsQualitySummaryFrom(done)} ` +
      `(${done.acceptedFixes} kept / ${done.discardedFixes} dropped)`,
  )
  if (done.debugRejects.length > 0) {
    log(`rejected fixes (last ${done.debugRejects.length})`, done.debugRejects)
  }
}

export async function clearSession(): Promise<void> {
  set({ ...EMPTY, hydrated: true })
  await stopLocationFeed()
  try {
    await AsyncStorage.removeItem(STORAGE_KEY)
  } catch (err) {
    console.warn('[liveTracking] clearing snapshot failed', err)
  }
}

export async function reconcileOrphanedFeed(): Promise<void> {
  await ensureHydrated()
  if (hasActiveSession(get())) return
  if (await isBackgroundFeedRunning()) {
    console.warn('[liveTracking] stopping orphaned background location task')
    await stopLocationFeed()
  }
}

export interface BackgroundPermissionResult {
  granted: boolean
  mustUseSettings: boolean
}

export async function requestBackgroundPermission(): Promise<BackgroundPermissionResult> {
  try {
    const current = await Location.getBackgroundPermissionsAsync()
    if (current.granted) return { granted: true, mustUseSettings: false }
    if (!current.canAskAgain) return { granted: false, mustUseSettings: true }
    const res = await Location.requestBackgroundPermissionsAsync()
    return {
      granted: res.granted,
      mustUseSettings: !res.granted && !res.canAskAgain,
    }
  } catch (err) {
    console.warn('[liveTracking] background permission request failed', err)
    return { granted: false, mustUseSettings: Platform.OS === 'android' }
  }
}

export async function hasBackgroundPermission(): Promise<boolean> {
  try {
    return (await Location.getBackgroundPermissionsAsync()).granted
  } catch {
    return false
  }
}

export type PreflightStatus =
  | 'services-off'
  | 'no-foreground'
  | 'no-background'
  | 'ok'

export interface PreflightResult {
  status: PreflightStatus
  background: boolean
  backgroundBlocked: boolean
}

export async function preflightLocation(requestBackground = true): Promise<PreflightResult> {
  const fail = (status: PreflightStatus): PreflightResult => ({
    status,
    background: false,
    backgroundBlocked: false,
  })

  try {
    if (!(await Location.hasServicesEnabledAsync())) return fail('services-off')
  } catch (err) {
    console.warn('[liveTracking] services check failed', err)
    return fail('services-off')
  }

  try {
    let fg = await Location.getForegroundPermissionsAsync()
    if (!fg.granted && fg.canAskAgain) fg = await Location.requestForegroundPermissionsAsync()
    if (!fg.granted) return fail('no-foreground')
  } catch (err) {
    console.warn('[liveTracking] foreground permission check failed', err)
    return fail('no-foreground')
  }

  if (await hasBackgroundPermission()) {
    return { status: 'ok', background: true, backgroundBlocked: false }
  }
  if (!requestBackground) {
    return { status: 'no-background', background: false, backgroundBlocked: false }
  }
  const { granted, mustUseSettings } = await requestBackgroundPermission()
  return {
    status: granted ? 'ok' : 'no-background',
    background: granted,
    backgroundBlocked: mustUseSettings,
  }
}
