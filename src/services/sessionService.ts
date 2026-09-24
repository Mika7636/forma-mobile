// Firestore session CRUD + conflict detection on save.

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

export const DISTANCE_SPORTS: SportType[] = ['running', 'swimming', 'cycling']

export function isDistanceSport(sport: SportType | null): boolean {
  return sport != null && DISTANCE_SPORTS.includes(sport)
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

export interface LogSessionInput {
  sport: SportType
  date: Date
  durationMinutes: number
  rpe: number
  distanceKm?: number
  notes?: string
  avgBpm?: number
  trackingMode?: TrackingMode
  routeCoordinates?: RoutePoint[]
  averagePace?: string
  averageSpeed?: number
  gpsQuality?: GpsQuality
  title?: string
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

async function persistConflicts(
  userId: string,
  triggerSessionId: string,
  detected: Conflict[],
): Promise<Conflict[]> {
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
  if (trackingMode) docData.trackingMode = trackingMode
  if (routeCoordinates && routeCoordinates.length > 0) {
    docData.routeCoordinates = routeCoordinates
  }
  if (averagePace) docData.averagePace = averagePace
  if (averageSpeed != null && averageSpeed > 0) docData.averageSpeed = averageSpeed
  if (gpsQuality) docData.gpsQuality = gpsQuality
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

  const conflicts = await persistConflicts(userId, session.id, detected)

  return { session, conflicts }
}

export interface UpdateSessionInput {
  sport: SportType
  date: Date
  durationMinutes: number
  rpe: number
  distanceKm?: number
  notes?: string
  avgBpm?: number
  title?: string
}

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

  const conflicts = await persistConflicts(userId, session.id, detected)

  return { session, conflicts }
}

export async function resolveConflict(userId: string, conflictId: string): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'conflicts', conflictId), { resolved: true })
}

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
