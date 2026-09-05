// Read-only aggregates for the Admin screen.
//
// ## The one thing to know before editing this file
//
// Sessions are a SUBCOLLECTION: /users/{uid}/sessions/{id}. There is no
// top-level `sessions` collection, so anything that spans all athletes is a
// **collection group** query — `collectionGroup(db, 'sessions')` — and a
// collection group query needs a collection-group-scoped index even when it
// filters on a single field. The automatic per-collection indexes do not cover
// it. See `firestore.indexes.README.md`; a missing index surfaces here as
// {@link MissingIndexError}, carrying the console link Firestore hands back.
//
// ## Why every window is asked for twice
//
// `date` is a Timestamp on documents this app wrote and an ISO **string** on
// documents the FORMA web app wrote. Both shapes are live in the same
// collection, and Firestore orders values by type before value: a range query
// bounded by Timestamps cannot match a string, and vice versa — silently, with
// no error and no warning, just a result that is quietly too small. So each
// window is asked twice, once with each bound type, and the two are merged. A
// document's `date` is one type or the other, never both, so nothing is
// double-counted. `users.createdAt` has exactly the same split, for the same
// reason, and gets the same treatment.
//
// ## Counting vs. fetching, and why this screen now does both
//
// It used to do only the first. Every figure was a `count()` aggregation, which
// answers without transferring the matching documents — billed per 1,000 index
// entries scanned rather than per document read — and on a database with a few
// thousand sessions that is the difference between a screen costing a fraction
// of a read and one costing thousands, on every pull-to-refresh.
//
// The charts added since cannot be answered that way. A sport's *share* of
// total load, the hour of day people train at, which pairs of sports clash: none
// of those are a count of a filtered set, and asking for them as counts would
// mean one aggregation per sport per bucket per window — hundreds of round
// trips to reconstruct what one bounded read already contains.
//
// So the split is by what the question needs, not by habit:
//
//   * **Counted** — total users, new signups, and the seven daily columns. Each
//     is exactly one filtered count, they stay exact regardless of how much
//     history exists, and they are the figures the screen had before.
//   * **Fetched** — one bounded page of the last {@link ADMIN_WINDOW_DAYS} days
//     of sessions, capped at {@link ADMIN_SESSION_CAP} documents, newest first.
//     Everything else is aggregated from it in `utils/adminMetrics`.
//
// The cap is a real limit, not a formality, and {@link AdminOverview.truncated}
// says when it bit so the screen can show it rather than quietly presenting a
// partial picture as the whole one.
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

/** How many user rows the list will show. */
export const ADMIN_USER_CAP = 100

/** Days in the sessions-per-day chart. */
export const ADMIN_CHART_DAYS = 7

/**
 * How far back the one bounded fetch reaches.
 *
 * Twelve weeks, because that is the longest window anything on the screen asks
 * for: the weekly-actives line is twelve buckets, and the retention figure needs
 * the month before this one as its denominator. Everything shorter — the
 * thirty-day KPIs, the top-users list — is a slice of the same rows.
 */
export const ADMIN_WINDOW_DAYS = 84

/**
 * The hard ceiling on documents pulled in that window.
 *
 * Sessions are ordered newest-first and truncated from the far end, so a
 * database that overflows this loses its *oldest* history rather than its most
 * recent — the twelve-week line loses its left edge while the thirty-day KPIs,
 * which is what the row at the top of the screen actually reports, stay whole.
 */
export const ADMIN_SESSION_CAP = 4000

/* ------------------------------------------------------------------ */
/* Shapes                                                              */
/* ------------------------------------------------------------------ */

export interface AdminUserRow {
  uid: string
  displayName: string
  email: string
  /** ISO string, or null when the account has never sent a heartbeat. */
  lastActiveAt: string | null
}

/** One column of the sessions-per-day chart. */
export interface AdminDay {
  /** Local midnight for the day, as epoch ms. Also the React key. */
  startedAt: number
  /** Weekday initial for the x-axis — "M", "T", … */
  initial: string
  /** Full label for the accessible description, e.g. "Mon 1 Sep". */
  label: string
  count: number
}

export interface AdminOverview {
  /** Section 1. */
  kpis: EngagementKpis
  /** Section 2 — oldest → newest. */
  activeWeeks: ActiveWeekPoint[]
  /** Section 3. */
  sportSlices: SportSlice[]
  /** Section 4. */
  sportLoad: SportLoadBar[]
  /** Section 5. */
  heatmap: ActivityHeatmap
  /** Section 6. */
  conflicts: ConflictMatrix
  /** Section 7. */
  topUsers: TopUser[]

  /** Oldest → newest, exactly {@link ADMIN_CHART_DAYS} entries. */
  days: AdminDay[]
  /** Sum of `days`. The chart's caption figure. */
  windowTotal: number

  users: AdminUserRow[]
  /** True when {@link ADMIN_USER_CAP} hid somebody from the list. */
  truncated: boolean

  /** Days of history behind every chart — {@link ADMIN_WINDOW_DAYS}. */
  windowDays: number
  /** Sessions actually aggregated. */
  sessionsAnalysed: number
  /** True when {@link ADMIN_SESSION_CAP} clipped the oldest end of the window. */
  sessionsTruncated: boolean
  /**
   * True when profiles were capped, so the per-athlete aggregates — the conflict
   * grid and the leaderboard's names — saw only part of the userbase.
   */
  profilesTruncated: boolean
}

/* ------------------------------------------------------------------ */
/* Errors                                                              */
/* ------------------------------------------------------------------ */

/**
 * The first collection group query against a database without the index.
 *
 * Its own error type because it is the one failure mode with a one-click fix,
 * and answering "couldn't load" when Firestore has already handed us the link
 * that fixes it would be throwing the fix away.
 */
export class MissingIndexError extends Error {
  /** The console URL Firestore embeds in its message, when there is one. */
  readonly consoleUrl: string | null

  constructor(consoleUrl: string | null) {
    super('This query needs a Firestore collection group index.')
    this.name = 'MissingIndexError'
    this.consoleUrl = consoleUrl
  }
}

/** The caller's profile no longer says `isAdmin: true` — the rules said no. */
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

/**
 * Translate a Firestore failure into something the screen can say out loud.
 *
 * `failed-precondition` is Firestore's code for "build this index first". It
 * covers a few unrelated preconditions too, so the message is checked as well
 * rather than assumed.
 *
 * Every new query added for the charts funnels through here as well: they run
 * inside the same `try` as the original ones, so a section that needs an index
 * nobody has built yet produces the same one-click console link rather than a
 * generic failure, whichever query it was that tripped.
 */
function toAdminError(err: unknown): Error {
  const code = firestoreCode(err)
  const message = err instanceof Error ? err.message : String(err)

  if (code === 'failed-precondition' && /index/i.test(message)) {
    const found = message.match(/https:\/\/console\.firebase\.google\.com\/\S+/)
    // Firestore sometimes ends the link with the sentence's own punctuation.
    const url = found ? found[0].replace(/[.,)]+$/, '') : null
    return new MissingIndexError(url)
  }
  if (code === 'permission-denied') return new AdminDeniedError()
  return err instanceof Error ? err : new Error(message)
}

/* ------------------------------------------------------------------ */
/* Counting                                                            */
/* ------------------------------------------------------------------ */

/**
 * How many sessions across all users fall in [start, end), optionally for one
 * sport. Two aggregations, one per stored `date` type — see the header note.
 */
async function countSessions(start: Date, end: Date, sport?: string): Promise<number> {
  const sportFilter: QueryConstraint[] = sport ? [where('sport', '==', sport)] : []

  const asTimestamp = query(
    collectionGroup(db, 'sessions'),
    ...sportFilter,
    where('date', '>=', Timestamp.fromDate(start)),
    where('date', '<', Timestamp.fromDate(end)),
  )
  // The string half. Web-written dates are `Date.toISOString()` output, whose
  // lexicographic order is chronological, so the same bounds work as strings.
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

/**
 * Accounts created on or after `start`.
 *
 * `createdAt` carries the same Timestamp-or-string split as a session's `date`
 * — the mobile app writes an ISO string, the web app a Timestamp — so it is
 * counted twice on the same reasoning. Counted rather than derived from the
 * fetched profiles, which are capped: a signup figure that silently stopped at
 * {@link ADMIN_USER_CAP} would contradict the exact total sitting next to it.
 */
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

/* ------------------------------------------------------------------ */
/* The bounded fetch                                                   */
/* ------------------------------------------------------------------ */

/** Epoch ms from whichever of the two shapes `date` was stored in. */
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

/**
 * The owning account for a session document.
 *
 * Taken from the document's own path — `/users/{uid}/sessions/{id}`, so the
 * grandparent is the account — rather than from the `userId` field. The path is
 * structural and cannot disagree with where the document actually lives; the
 * field is data, and an older or web-written document may not carry it. It is
 * still read as a fallback for anything stored somewhere unexpected.
 */
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
    // A session with no `loadScore` contributes nothing to the load chart rather
    // than a NaN that would poison every total it touches.
    load: typeof data.loadScore === 'number' && Number.isFinite(data.loadScore) ? data.loadScore : 0,
    rpe: typeof data.rpe === 'number' && Number.isFinite(data.rpe) ? data.rpe : 0,
  }
}

/**
 * One page of every athlete's sessions since `start`, newest first.
 *
 * Two queries again, one per `date` shape, each capped at
 * {@link ADMIN_SESSION_CAP}. The halves are merged, re-sorted and cut to the cap
 * as a whole, so the ceiling applies to the result rather than to each half —
 * otherwise a database that is half web-written and half mobile-written would
 * quietly return twice as much as the cap promises.
 *
 * `orderBy('date', 'desc')` is what makes the cap safe: dropping the oldest
 * sessions costs the left edge of a twelve-week line, while dropping the newest
 * would corrupt the thirty-day KPIs the screen leads with. It is also the one
 * new index this file needs — a descending, collection-group-scoped single-field
 * index on `sessions.date`. See `firestore.indexes.README.md`.
 */
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

  // Either half hitting its own limit means Firestore had more to give.
  const hitLimit =
    timestamps.size >= ADMIN_SESSION_CAP ||
    strings.size >= ADMIN_SESSION_CAP ||
    rows.length > ADMIN_SESSION_CAP

  return { rows: rows.slice(0, ADMIN_SESSION_CAP), truncated: hitLimit }
}

/* ------------------------------------------------------------------ */
/* The one call the screen makes                                       */
/* ------------------------------------------------------------------ */

/**
 * Everything the Admin screen shows, in one round of parallel queries.
 *
 * One call rather than several hooks because the screen has a single loading
 * state and a single retry: a page that resolved its sections independently
 * would show itself assembling a chart at a time, which reads as a stutter
 * rather than as progress — and with seven sections that stutter would be the
 * dominant impression of the screen.
 *
 * The cost of one refresh, so it is not a mystery when the bill arrives:
 *
 *   * 1 count over `/users`, and 2 more for new signups (one per `createdAt`
 *     shape) — 3 aggregations.
 *   * 14 aggregations for the seven daily columns (one per `date` shape).
 *   * up to {@link ADMIN_USER_CAP} document reads for the profile page.
 *   * up to {@link ADMIN_SESSION_CAP} document reads for the session window,
 *     across 2 queries.
 *
 * So: 17 aggregations, and at most 4,100 document reads — in practice the number
 * of sessions logged in the last twelve weeks plus the size of the userbase.
 * Aggregations are billed per 1,000 index entries scanned rather than per
 * matching document, so the fetch dominates. Note that a live-tracked session
 * carries its full GPS trail, which is transferred whether or not anything reads
 * it: on a route-heavy database this refresh is bytes-expensive well before it
 * is read-expensive.
 */
export async function fetchAdminOverview(now = new Date()): Promise<AdminOverview> {
  try {
    const today = startOfDay(now)
    const windowStart = addDays(today, -(ADMIN_WINDOW_DAYS - 1))
    // Signups share the KPI block's rolling month — see `adminMetrics`' header
    // for why none of these windows are calendar months.
    const monthStart = addDays(today, -29)

    // The daily chart's window: the last seven local days, today included.
    const dayStarts: Date[] = []
    for (let i = ADMIN_CHART_DAYS - 1; i >= 0; i--) dayStarts.push(addDays(today, -i))

    const [totalUsersSnap, newSignups, userSnap, sessions, dayCounts] = await Promise.all([
      getCountFromServer(collection(db, 'users')),

      countSignupsSince(monthStart),

      // No `orderBy('lastActiveAt')`, on purpose. Firestore's ordering skips
      // documents that lack the field entirely, and with no backfill that is
      // *every* account which hasn't opened the app since the heartbeat shipped
      // — an ordered query would render an admin list that silently omits most
      // of the userbase. Fetching the cap and sorting on the client shows
      // everyone; the cost is that the cap is applied before the sort, which the
      // screen's truncation note says out loud.
      getDocs(query(collection(db, 'users'), limit(ADMIN_USER_CAP))),

      fetchWindowSessions(windowStart),

      // Still counted rather than derived from the fetched rows. These seven
      // columns are the screen's oldest figures and they are exact at any
      // database size; deriving them would silently inherit the session cap and
      // make a chart that has always been right start under-reporting on the
      // day the userbase outgrew it.
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
      // Most recently active first; "never" sinks to the bottom rather than
      // being read as "active at the epoch".
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
