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
// ## Why nothing here downloads a session
//
// Every figure on the screen is a count, and `getCountFromServer` answers a
// count without transferring the matching documents — billed per 1,000 index
// entries scanned rather than per document read. On a database with a few
// thousand sessions that is the difference between a screen costing a fraction
// of a read and one costing thousands, on every pull-to-refresh. The
// most-popular-sport figure follows the same rule: one count per sport, not one
// download of the week.
//
// ## Why every window is counted twice
//
// `date` is a Timestamp on documents this app wrote and an ISO **string** on
// documents the FORMA web app wrote. Both shapes are live in the same
// collection, and Firestore orders values by type before value: a range query
// bounded by Timestamps cannot match a string, and vice versa — silently, with
// no error and no warning, just a count that is quietly too low. So each window
// is asked twice, once with each bound type, and the two are added. A document's
// `date` is one type or the other, never both, so nothing is double-counted.
import {
  collection,
  collectionGroup,
  getCountFromServer,
  getDocs,
  limit,
  query,
  Timestamp,
  where,
  type QueryConstraint,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import { toUser } from './userService'
import { SPORT_OPTIONS } from '../constants/training'
import { addDays, startOfWeek, WEEKDAY_INITIALS } from '../utils/dates'
import type { SportType } from '../types/session'

/** How many user rows the list will show. */
export const ADMIN_USER_CAP = 100

/** Days in the activity chart. */
export const ADMIN_CHART_DAYS = 7

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
  totalUsers: number
  /** All users, current week (Monday-start, matching the rest of the app). */
  sessionsThisWeek: number
  /** Most-logged sport this week, or null when nobody trained. */
  topSport: { sport: SportType; count: number } | null
  /** Oldest → newest, exactly {@link ADMIN_CHART_DAYS} entries. */
  days: AdminDay[]
  /** Sum of `days`. The chart's caption figure. */
  windowTotal: number
  users: AdminUserRow[]
  /** True when {@link ADMIN_USER_CAP} hid somebody. */
  truncated: boolean
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
async function countSessions(start: Date, end: Date, sport?: SportType): Promise<number> {
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

/** Local midnight at the start of `date`'s day. */
function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/* ------------------------------------------------------------------ */
/* The one call the screen makes                                       */
/* ------------------------------------------------------------------ */

/**
 * Everything the Admin screen shows, in one round of parallel queries.
 *
 * One call rather than several hooks because the screen has a single loading
 * state and a single retry: a page that resolved its three summary figures
 * independently would show the stat row assembling itself a number at a time,
 * which reads as a stutter rather than as progress.
 */
export async function fetchAdminOverview(): Promise<AdminOverview> {
  try {
    const today = startOfDay(new Date())
    const tomorrow = addDays(today, 1)
    const weekStart = startOfWeek(today)

    // The chart's window: the last seven local days, today included.
    const dayStarts: Date[] = []
    for (let i = ADMIN_CHART_DAYS - 1; i >= 0; i--) dayStarts.push(addDays(today, -i))

    const [totalUsersSnap, userSnap, dayCounts, weekTotal, sportCounts] = await Promise.all([
      getCountFromServer(collection(db, 'users')),

      // No `orderBy('lastActiveAt')`, on purpose. Firestore's ordering skips
      // documents that lack the field entirely, and with no backfill that is
      // *every* account which hasn't opened the app since the heartbeat shipped
      // — an ordered query would render an admin list that silently omits most
      // of the userbase. Fetching the cap and sorting on the client shows
      // everyone; the cost is that the cap is applied before the sort, which the
      // screen's truncation note says out loud.
      getDocs(query(collection(db, 'users'), limit(ADMIN_USER_CAP))),

      Promise.all(dayStarts.map((start) => countSessions(start, addDays(start, 1)))),

      // Counted unfiltered rather than summed from the per-sport counts below,
      // so a session carrying a sport this build doesn't know about (an older or
      // web-written document) still lands in the headline figure.
      countSessions(weekStart, tomorrow),

      Promise.all(
        SPORT_OPTIONS.map(async (option) => ({
          sport: option.value,
          count: await countSessions(weekStart, tomorrow, option.value),
        })),
      ),
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

    const users: AdminUserRow[] = userSnap.docs
      .map((snapshot) => {
        const profile = toUser(snapshot.data())
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

    const ranked = sportCounts.filter((s) => s.count > 0).sort((a, b) => b.count - a.count)
    const totalUsers = totalUsersSnap.data().count

    return {
      totalUsers,
      sessionsThisWeek: weekTotal,
      topSport: ranked[0] ?? null,
      days,
      windowTotal: days.reduce((sum, day) => sum + day.count, 0),
      users,
      truncated: totalUsers > users.length,
    }
  } catch (err) {
    throw toAdminError(err)
  }
}
