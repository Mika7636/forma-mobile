// Read-only Firestore aggregates for the Admin screen.

import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toUser } from './userService'
import { addDays, WEEKDAY_INITIALS } from '../utils/dates'
import {
  activeUsersByWeek,
  activityHeatmap,
  conflictMatrix,
  engagementKpis,
  loadBySport,
  sportDistribution,
  startOfDay,
  topUsers,
  type ActiveWeekPoint,
  type ActivityHeatmap,
  type AdminProfileRow,
  type AdminSessionRow,
  type ConflictMatrix,
  type EngagementKpis,
  type SportLoadBar,
  type SportSlice,
  type TopUser,
} from '../utils/adminMetrics'

export const ADMIN_USER_CAP = 100

export const ADMIN_CHART_DAYS = 7

export const ADMIN_WINDOW_DAYS = 84

export const ADMIN_SESSION_CAP = 4000

export interface AdminUserRow {
  uid: string
  displayName: string
  email: string
  lastActiveAt: string | null
}

export interface AdminDay {
  startedAt: number
  initial: string
  label: string
  count: number
}

export interface AdminOverview {
  kpis: EngagementKpis
  activeWeeks: ActiveWeekPoint[]
  sportSlices: SportSlice[]
  sportLoad: SportLoadBar[]
  heatmap: ActivityHeatmap
  conflicts: ConflictMatrix
  topUsers: TopUser[]

  days: AdminDay[]
  windowTotal: number

  users: AdminUserRow[]
  truncated: boolean

  windowDays: number
  sessionsAnalysed: number
  sessionsTruncated: boolean
  profilesTruncated: boolean
}

export class MissingIndexError extends Error {
  readonly consoleUrl: string | null

  constructor(consoleUrl: string | null) {
    super('This query needs a Firestore collection group index.')
    this.name = 'MissingIndexError'
    this.consoleUrl = consoleUrl
  }
}

export class AdminDeniedError extends Error {
  constructor() {
    super('This account does not have admin access.')
    this.name = 'AdminDeniedError'
  }
}

function firestoreCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code
  return typeof code === 'string' ? code : null
}

function toAdminError(err: unknown): Error {
  const code = firestoreCode(err)
  const message = err instanceof Error ? err.message : String(err)

  if (code === 'failed-precondition' && /index/i.test(message)) {
    const found = message.match(/https:\/\/console\.firebase\.google\.com\/\S+/)
    const url = found ? found[0].replace(/[.,)]+$/, '') : null
    return new MissingIndexError(url)
  }
  if (code === 'permission-denied') return new AdminDeniedError()
  return err instanceof Error ? err : new Error(message)
}

async function countSessions(start: Date, end: Date, sport?: string): Promise<number> {
  const sportFilter: QueryConstraint[] = sport ? [where('sport', '==', sport)] : []

  const asTimestamp = query(
    collectionGroup(db, 'sessions'),
    ...sportFilter,
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
  )
  const asString = query(
    collectionGroup(db, 'sessions'),
    ...sportFilter,
    where('date', '>=', start.toISOString()),
    where('date', '<', end.toISOString()),
  )

  const [timestamps, strings] = await Promise.all([
    getCountFromServer(asTimestamp),
    getCountFromServer(asString),
  ])
  return timestamps.data().count + strings.data().count
}

async function countSignupsSince(start: Date): Promise<number> {
  const asTimestamp = query(
    collection(db, 'users'),
    where('createdAt', '>=', Timestamp.fromDate(start)),
  )
  const asString = query(collection(db, 'users'), where('createdAt', '>=', start.toISOString()))

  const [timestamps, strings] = await Promise.all([
    getCountFromServer(asTimestamp),
    getCountFromServer(asString),
  ])
  return timestamps.data().count + strings.data().count
}

function toMillis(value: unknown): number | null {
  if (value && typeof (value as Timestamp).toDate === 'function') {
    return (value as Timestamp).toDate().getTime()
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value)
    return Number.isNaN(ms) ? null : ms
  }
  return null
}

function ownerUid(snapshot: QueryDocumentSnapshot<DocumentData>): string | null {
  const fromPath = snapshot.ref.parent.parent?.id
  if (fromPath) return fromPath
  const fromField = snapshot.data().userId
  return typeof fromField === 'string' && fromField ? fromField : null
}

function toRow(snapshot: QueryDocumentSnapshot<DocumentData>): AdminSessionRow | null {
  const data = snapshot.data()
  const uid = ownerUid(snapshot)
  const dateMs = toMillis(data.date)
  if (!uid || dateMs === null) return null
  if (typeof data.sport !== 'string' || !data.sport) return null

  return {
    uid,
    sport: data.sport,
    dateMs,
    load: typeof data.loadScore === 'number' && Number.isFinite(data.loadScore) ? data.loadScore : 0,
    rpe: typeof data.rpe === 'number' && Number.isFinite(data.rpe) ? data.rpe : 0,
  }
}

async function fetchWindowSessions(
  start: Date,
): Promise<{ rows: AdminSessionRow[]; truncated: boolean }> {
  const asTimestamp = query(
    collectionGroup(db, 'sessions'),
    where('date', '>=', Timestamp.fromDate(start)),
    orderBy('date', 'desc'),
    limit(ADMIN_SESSION_CAP),
  )
  const asString = query(
    collectionGroup(db, 'sessions'),
    where('date', '>=', start.toISOString()),
    orderBy('date', 'desc'),
    limit(ADMIN_SESSION_CAP),
  )

  const [timestamps, strings] = await Promise.all([getDocs(asTimestamp), getDocs(asString)])

  const rows: AdminSessionRow[] = []
  for (const snapshot of [...timestamps.docs, ...strings.docs]) {
    const row = toRow(snapshot)
    if (row) rows.push(row)
  }
  rows.sort((a, b) => b.dateMs - a.dateMs)

  const hitLimit =
    timestamps.size >= ADMIN_SESSION_CAP ||
    strings.size >= ADMIN_SESSION_CAP ||
    rows.length > ADMIN_SESSION_CAP

  return { rows: rows.slice(0, ADMIN_SESSION_CAP), truncated: hitLimit }
}

export async function fetchAdminOverview(now = new Date()): Promise<AdminOverview> {
  try {
    const today = startOfDay(now)
    const windowStart = addDays(today, -(ADMIN_WINDOW_DAYS - 1))
    const monthStart = addDays(today, -29)

    const dayStarts: Date[] = []
    for (let i = ADMIN_CHART_DAYS - 1; i >= 0; i--) dayStarts.push(addDays(today, -i))

    const [totalUsersSnap, newSignups, userSnap, sessions, dayCounts] = await Promise.all([
      getCountFromServer(collection(db, 'users')),

      countSignupsSince(monthStart),

      getDocs(query(collection(db, 'users'), limit(ADMIN_USER_CAP))),

      fetchWindowSessions(windowStart),

      Promise.all(dayStarts.map((start) => countSessions(start, addDays(start, 1)))),
    ])

    const days: AdminDay[] = dayStarts.map((start, i) => ({
      startedAt: start.getTime(),
      initial: WEEKDAY_INITIALS[start.getDay()],
      label: start.toLocaleDateString(undefined, {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
      }),
      count: dayCounts[i],
    }))

    const profiles = new Map<string, AdminProfileRow>()
    const users: AdminUserRow[] = userSnap.docs
      .map((snapshot) => {
        const profile = toUser(snapshot.data())
        profiles.set(snapshot.id, {
          uid: snapshot.id,
          displayName: profile.displayName || 'Unnamed athlete',
          sportInteractions: profile.sportInteractions ?? {},
          sensitivity: profile.conflictSensitivity ?? 'balanced',
        })
        return {
          uid: snapshot.id,
          displayName: profile.displayName || 'Unnamed athlete',
          email: profile.email || '—',
          lastActiveAt: profile.lastActiveAt ?? null,
        }
      })
      .sort((a, b) => {
        const at = a.lastActiveAt ? Date.parse(a.lastActiveAt) : -Infinity
        const bt = b.lastActiveAt ? Date.parse(b.lastActiveAt) : -Infinity
        return bt - at
      })

    const totalUsers = totalUsersSnap.data().count
    const rows = sessions.rows

    return {
      kpis: engagementKpis(rows, totalUsers, newSignups, now),
      activeWeeks: activeUsersByWeek(rows, now),
      sportSlices: sportDistribution(rows),
      sportLoad: loadBySport(rows),
      heatmap: activityHeatmap(rows),
      conflicts: conflictMatrix(rows, profiles),
      topUsers: topUsers(rows, profiles, now),

      days,
      windowTotal: days.reduce((sum, day) => sum + day.count, 0),

      users,
      truncated: totalUsers > users.length,

      windowDays: ADMIN_WINDOW_DAYS,
      sessionsAnalysed: rows.length,
      sessionsTruncated: sessions.truncated,
      profilesTruncated: totalUsers > users.length,
    }
  } catch (err) {
    throw toAdminError(err)
  }
}
