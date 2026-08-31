// Firestore session CRUD + the FORMA "coach in your pocket" write path. When a
// session is logged we derive its training estimates (load, calories, HR zone,
// pace) from the user's profile, persist it under /users/{uid}/sessions, then
// run conflict detection against the last 48h and persist any conflicts under
// /users/{uid}/conflicts. Ported & adapted from the web app (same forma-sp1
// Firestore project) for React Native.
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { estimateCalories } from '../algorithms/calories'
import { detectConflicts } from '../algorithms/conflictDetector'
import { estimateHRZone } from '../algorithms/heartRate'
import { calculatePace } from '../algorithms/pace'
import { calculateLoadScore } from '../algorithms/sRPE'
import { startOfWeek } from '../utils/dates'
import { conflictStorageKey, type Conflict } from '../types/conflict'
import type {
  GpsQuality,
  RoutePoint,
  Session,
  SessionHRZone,
  SessionSplit,
  SportType,
  TrackingMode,
} from '../types/session'
import type { User } from '../types/user'

/** Sports that record a distance and therefore get a pace/speed estimate. */
export const DISTANCE_SPORTS: SportType[] = ['running', 'swimming', 'cycling']

export function isDistanceSport(sport: SportType | null): boolean {
  return sport != null && DISTANCE_SPORTS.includes(sport)
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/** The raw inputs the Log screen collects; everything else is derived here. */
export interface LogSessionInput {
  sport: SportType
  /** When the workout happened (defaults to now on the screen). */
  date: Date
  durationMinutes: number
  rpe: number
  distanceKm?: number
  notes?: string
  /** Optional manually-entered average heart rate from a wearable. */
  avgBpm?: number
  // --- Live GPS tracking (set by LiveTracker) ---
  trackingMode?: TrackingMode
  routeCoordinates?: RoutePoint[]
  averagePace?: string
  averageSpeed?: number
  /** How much of the workout the GPS covered; only meaningful for live sessions. */
  gpsQuality?: GpsQuality
  /** Athlete-editable workout name, e.g. "Morning Run". */
  title?: string
  /**
   * Elapsed minus established stops, in ms. Stored alongside `durationMinutes`
   * rather than replacing it: load is `duration × RPE` and a red light is still
   * time spent training, so the wall clock stays the training-load input while
   * this is the pace denominator.
   */
  movingTimeMs?: number
  splits?: SessionSplit[]
  elevationGain?: number
}

function sessionsCol(userId: string) {
  return collection(db, 'users', userId, 'sessions')
}

function conflictsCol(userId: string) {
  return collection(db, 'users', userId, 'conflicts')
}

/**
 * Persist newly-detected conflicts, skipping any that would duplicate one
 * already stored. Dedupe is by {@link conflictStorageKey} (trigger + clashing +
 * type), so a re-detect for the same session — a double-tapped Save, or a retry
 * after a flaky write — never writes the same conflict twice. Also dedupes
 * within `detected` itself. Returns the docs actually written.
 */
async function persistConflicts(
  userId: string,
  triggerSessionId: string,
  detected: Conflict[],
): Promise<Conflict[]> {
  // Existing conflicts triggered by this session set the baseline of keys we
  // must not re-write. A single-field `where` needs no composite index.
  const existingSnap = await getDocs(
    query(conflictsCol(userId), where('triggerSessionId', '==', triggerSessionId)),
  )
  const seen = new Set(
    existingSnap.docs.map((d) => conflictStorageKey(d.data() as Conflict)),
  )

  const conflicts: Conflict[] = []
  for (const conflict of detected) {
    const key = conflictStorageKey(conflict)
    if (seen.has(key)) continue
    seen.add(key)
    const conflictRef = doc(conflictsCol(userId))
    const saved: Conflict = { ...conflict, conflictId: conflictRef.id }
    await setDoc(conflictRef, saved)
    conflicts.push(saved)
  }
  return conflicts
}

/**
 * Normalise a Firestore session doc into the in-memory {@link Session} model.
 * Firestore stores `date`/`createdAt` as Timestamps; the algorithms and UI work
 * with ISO strings, so we convert here (tolerating already-string values from
 * older/web writes).
 *
 * Exported because the sessions store reads the same collection and must apply
 * exactly this normalisation — the web app writes `date` as an ISO string while
 * this app writes a Timestamp, so both shapes are live in Firestore.
 */
export function toSession(id: string, data: DocumentData): Session {
  const toISO = (value: unknown, fallback: string): string => {
    if (value && typeof (value as Timestamp).toDate === 'function') {
      return (value as Timestamp).toDate().toISOString()
    }
    return typeof value === 'string' ? value : fallback
  }

  const dateISO = toISO(data.date, new Date().toISOString())
  return {
    id,
    userId: data.userId,
    sport: data.sport,
    date: dateISO,
    durationMinutes: data.durationMinutes,
    distanceKm: data.distanceKm,
    rpe: data.rpe,
    loadScore: data.loadScore,
    notes: data.notes,
    createdAt: toISO(data.createdAt, dateISO),
    estimatedCalories: data.estimatedCalories,
    estimatedHRZone: data.estimatedHRZone,
    pace: data.pace ?? null,
    avgBpm: data.avgBpm,
    trackingMode: data.trackingMode,
    routeCoordinates: data.routeCoordinates,
    averagePace: data.averagePace,
    averageSpeed: data.averageSpeed,
    gpsQuality: data.gpsQuality,
    title: data.title,
    movingTimeMs: data.movingTimeMs,
    splits: data.splits,
    elevationGain: data.elevationGain,
  }
}

/**
 * The live training estimates for a set of inputs. Exposed so the Log screen can
 * preview calories / HR zone / pace / load as the user drags the sliders —
 * exactly what {@link logSession} persists, without a Firestore round-trip.
 */
export interface SessionEstimates {
  loadScore: number
  estimatedCalories: number
  estimatedHRZone: SessionHRZone
  pace: string | null
}

export function computeEstimates(
  input: {
    sport: SportType
    durationMinutes: number
    rpe: number
    distanceKm?: number
  },
  profile: Pick<User, 'weightKg' | 'maxHR'> | null,
): SessionEstimates {
  const { sport, durationMinutes, rpe, distanceKm } = input
  const safeDuration = durationMinutes > 0 ? durationMinutes : 0
  const hr = estimateHRZone(rpe, profile?.maxHR)
  return {
    loadScore: safeDuration > 0 ? safeDuration * rpe : 0,
    estimatedCalories: estimateCalories(sport, safeDuration, rpe, profile?.weightKg),
    estimatedHRZone: { zone: hr.zone, name: hr.name, hrRange: hr.hrRange },
    pace: isDistanceSport(sport)
      ? calculatePace(sport, safeDuration, distanceKm)
      : null,
  }
}

/**
 * Persist a session, then detect & persist any training conflicts it triggers.
 *
 * Steps:
 *  1. Derive load / calories / HR zone / pace from the inputs + profile.
 *  2. Write the session to /users/{uid}/sessions/{auto-id}.
 *  3. Fetch the last 7 days of sessions (covers the 48h conflict window and the
 *     current-week budget check) and run {@link detectConflicts}.
 *  4. Persist every conflict to /users/{uid}/conflicts/{auto-id}.
 *
 * Returns the saved session plus its conflicts so the UI can react (show the
 * success toast, or the conflict modal).
 */
export async function logSession(
  userId: string,
  input: LogSessionInput,
  profile: User,
  options?: { calibrating?: boolean },
): Promise<{ session: Session; conflicts: Conflict[] }> {
  const {
    sport,
    date,
    durationMinutes,
    rpe,
    distanceKm,
    notes,
    avgBpm,
    trackingMode,
    routeCoordinates,
    averagePace,
    averageSpeed,
    gpsQuality,
    title,
    movingTimeMs,
    splits,
    elevationGain,
  } = input

  const loadScore = calculateLoadScore(durationMinutes, rpe)
  const estimatedCalories = estimateCalories(sport, durationMinutes, rpe, profile.weightKg)
  const hr = estimateHRZone(rpe, profile.maxHR)
  const estimatedHRZone: SessionHRZone = {
    zone: hr.zone,
    name: hr.name,
    hrRange: hr.hrRange,
  }
  const hasDistance = isDistanceSport(sport) && distanceKm != null && distanceKm > 0
  const pace = hasDistance ? calculatePace(sport, durationMinutes, distanceKm) : null

  // Firestore rejects `undefined`, so build the doc conditionally. `date` and
  // `createdAt` are stored as Timestamps to match the web app's schema (keeps
  // the shared dashboard cross-platform read working).
  const docData: DocumentData = {
    userId,
    sport,
    date: Timestamp.fromDate(date),
    durationMinutes,
    rpe,
    loadScore,
    estimatedCalories,
    estimatedHRZone,
    pace,
    notes: notes?.trim() ?? '',
    createdAt: serverTimestamp(),
  }
  if (hasDistance) docData.distanceKm = distanceKm
  if (avgBpm != null && avgBpm > 0) docData.avgBpm = avgBpm
  // Live-tracking extras. Firestore rejects undefined, so guard each one. Route
  // points are plain {latitude, longitude, timestamp} objects — Firestore-safe.
  if (trackingMode) docData.trackingMode = trackingMode
  if (routeCoordinates && routeCoordinates.length > 0) {
    docData.routeCoordinates = routeCoordinates
  }
  if (averagePace) docData.averagePace = averagePace
  if (averageSpeed != null && averageSpeed > 0) docData.averageSpeed = averageSpeed
  if (gpsQuality) docData.gpsQuality = gpsQuality
  // Summary extras. Firestore rejects `undefined`, so each is guarded; splits are
  // plain {km, seconds, paceSecPerKm, metres, partial} objects and safe to store.
  if (title?.trim()) docData.title = title.trim()
  if (movingTimeMs != null && movingTimeMs > 0) docData.movingTimeMs = Math.round(movingTimeMs)
  if (splits && splits.length > 0) docData.splits = splits
  if (elevationGain != null && elevationGain > 0) docData.elevationGain = Math.round(elevationGain)

  const ref = await addDoc(sessionsCol(userId), docData)

  const session: Session = {
    id: ref.id,
    userId,
    sport,
    date: date.toISOString(),
    durationMinutes,
    distanceKm: hasDistance ? distanceKm : undefined,
    rpe,
    loadScore,
    notes: notes?.trim() || undefined,
    createdAt: new Date().toISOString(),
    estimatedCalories,
    estimatedHRZone,
    pace,
    avgBpm: avgBpm != null && avgBpm > 0 ? avgBpm : undefined,
    trackingMode,
    routeCoordinates:
      routeCoordinates && routeCoordinates.length > 0 ? routeCoordinates : undefined,
    averagePace,
    averageSpeed: averageSpeed != null && averageSpeed > 0 ? averageSpeed : undefined,
    gpsQuality,
    title: title?.trim() || undefined,
    movingTimeMs: movingTimeMs != null && movingTimeMs > 0 ? Math.round(movingTimeMs) : undefined,
    splits: splits && splits.length > 0 ? splits : undefined,
    elevationGain:
      elevationGain != null && elevationGain > 0 ? Math.round(elevationGain) : undefined,
  }

  // Pull recent training for the conflict engine. A single `where` on `date`
  // needs no composite index. The just-written session is included and filtered
  // out by id inside detectConflicts.
  const cutoff = Timestamp.fromMillis(Date.now() - SEVEN_DAYS_MS)
  const recentSnap = await getDocs(query(sessionsCol(userId), where('date', '>=', cutoff)))
  const recentSessions = recentSnap.docs.map((d) => toSession(d.id, d.data()))

  // Weekly budget check needs hours trained this calendar week (incl. the new
  // session, which is already in recentSessions).
  const weekStart = startOfWeek(new Date()).getTime()
  const weeklyMinutes = recentSessions
    .filter((s) => new Date(s.date).getTime() >= weekStart)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const currentWeeklyHours = weeklyMinutes / 60

  const detected = detectConflicts(session, recentSessions, profile, currentWeeklyHours, {
    calibrating: options?.calibrating,
  })

  // Persist each conflict with a real id so the dashboard can key/resolve them,
  // skipping any that would duplicate one already stored for this session.
  const conflicts = await persistConflicts(userId, session.id, detected)

  return { session, conflicts }
}

/** The editable fields the Session Detail modal collects; the rest is derived. */
export interface UpdateSessionInput {
  sport: SportType
  date: Date
  durationMinutes: number
  rpe: number
  distanceKm?: number
  notes?: string
  avgBpm?: number
  /**
   * The workout's name.
   *
   * Written by live tracking at save time and, since the detail sheet grew an
   * overflow menu, editable afterwards. Blank clears it, which is why it is
   * removed rather than stored as an empty string — a session with no title
   * falls back to its sport name, and `''` is not the same as "no title".
   */
  title?: string
}

/**
 * Re-derive a session's training estimates from edited inputs, persist the
 * changes, and re-run conflict detection for it.
 *
 * Mirrors {@link logSession} but for an existing doc: load / calories / HR zone
 * / pace are recomputed, fields that no longer apply (distance when the sport
 * becomes non-distance, a cleared BPM) are removed via {@link deleteField}, and
 * the conflicts this session previously triggered are deleted and recomputed
 * against the current last-7-days window. Live-tracking fields (trackingMode,
 * route, averagePace/Speed) are left untouched.
 */
export async function updateSession(
  userId: string,
  original: Session,
  input: UpdateSessionInput,
  profile: User,
  options?: { calibrating?: boolean },
): Promise<{ session: Session; conflicts: Conflict[] }> {
  const { sport, date, durationMinutes, rpe, distanceKm, notes, avgBpm, title } = input

  const loadScore = calculateLoadScore(durationMinutes, rpe)
  const estimatedCalories = estimateCalories(sport, durationMinutes, rpe, profile.weightKg)
  const hr = estimateHRZone(rpe, profile.maxHR)
  const estimatedHRZone: SessionHRZone = { zone: hr.zone, name: hr.name, hrRange: hr.hrRange }
  const hasDistance = isDistanceSport(sport) && distanceKm != null && distanceKm > 0
  const pace = hasDistance ? calculatePace(sport, durationMinutes, distanceKm) : null

  const sessionRef = doc(db, 'users', userId, 'sessions', original.id)
  const patch: DocumentData = {
    sport,
    date: Timestamp.fromDate(date),
    durationMinutes,
    rpe,
    loadScore,
    estimatedCalories,
    estimatedHRZone,
    pace,
    notes: notes?.trim() ?? '',
    // Drop fields that no longer apply rather than leaving stale values.
    distanceKm: hasDistance ? distanceKm : deleteField(),
    avgBpm: avgBpm != null && avgBpm > 0 ? avgBpm : deleteField(),
    title: title?.trim() ? title.trim() : deleteField(),
  }
  await updateDoc(sessionRef, patch)

  const session: Session = {
    ...original,
    sport,
    date: date.toISOString(),
    durationMinutes,
    rpe,
    loadScore,
    estimatedCalories,
    estimatedHRZone,
    pace,
    distanceKm: hasDistance ? distanceKm : undefined,
    notes: notes?.trim() || undefined,
    avgBpm: avgBpm != null && avgBpm > 0 ? avgBpm : undefined,
    title: title?.trim() || undefined,
  }

  // Conflict detection is "for this session": clear the conflicts it previously
  // triggered, then recompute against the fresh last-7-days window (which now
  // reflects the edit).
  const triggeredSnap = await getDocs(
    query(conflictsCol(userId), where('triggerSessionId', '==', original.id)),
  )
  await Promise.all(triggeredSnap.docs.map((d) => deleteDoc(d.ref)))

  const cutoff = Timestamp.fromMillis(Date.now() - SEVEN_DAYS_MS)
  const recentSnap = await getDocs(query(sessionsCol(userId), where('date', '>=', cutoff)))
  const recentSessions = recentSnap.docs.map((d) => toSession(d.id, d.data()))

  const weekStart = startOfWeek(new Date()).getTime()
  const weeklyMinutes = recentSessions
    .filter((s) => new Date(s.date).getTime() >= weekStart)
    .reduce((sum, s) => sum + s.durationMinutes, 0)
  const currentWeeklyHours = weeklyMinutes / 60

  const detected = detectConflicts(session, recentSessions, profile, currentWeeklyHours, {
    calibrating: options?.calibrating,
  })

  // The previously-triggered conflicts were just deleted above, so this write is
  // clean — but persistConflicts still guards against re-detect duplicates.
  const conflicts = await persistConflicts(userId, session.id, detected)

  return { session, conflicts }
}

/**
 * Mark a single conflict resolved (dismissed). Used by the planner day sheet and
 * the conflict-history screen, which act on one specific document. The dashboard
 * banner instead dismisses a whole dedupe group via `useConflicts`.
 */
export async function resolveConflict(userId: string, conflictId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'conflicts', conflictId), { resolved: true })
}

/**
 * Wipe every session, conflict and planned session for a user (Settings →
 * "Clear All Training Data"). Leaves the profile intact.
 *
 * The plan is included because "clear my training data" that leaves next week
 * still pencilled in has not cleared the user's training data — and the plans
 * left behind would keep raising planned conflicts against a now-empty history.
 */
export async function clearTrainingData(userId: string): Promise<void> {
  const [sessions, conflicts, planned] = await Promise.all([
    getDocs(sessionsCol(userId)),
    getDocs(conflictsCol(userId)),
    getDocs(collection(db, 'users', userId, 'plannedSessions')),
  ])
  await Promise.all(
    [...sessions.docs, ...conflicts.docs, ...planned.docs].map((d) => deleteDoc(d.ref)),
  )
}

/**
 * Delete a session and any conflicts that reference it — either as the trigger
 * (the session just logged) or as the earlier clashing session. Used by the
 * conflict modal's "Undo session" action.
 */
export async function deleteSession(userId: string, sessionId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'sessions', sessionId))

  const [triggered, clashing] = await Promise.all([
    getDocs(query(conflictsCol(userId), where('triggerSessionId', '==', sessionId))),
    getDocs(query(conflictsCol(userId), where('conflictingSessionId', '==', sessionId))),
  ])

  const refs = new Map<string, ReturnType<typeof doc>>()
  for (const snap of [triggered, clashing]) {
    snap.docs.forEach((d) => refs.set(d.id, d.ref))
  }
  await Promise.all([...refs.values()].map((r) => deleteDoc(r)))
}
