// Everything the Admin screen's charts show, derived from one bounded fetch.
//
// ## Why this file is pure
//
// `adminService` talks to Firestore; this turns what came back into the shapes
// the screen renders. Splitting them is what lets every figure below be
// reasoned about — and, when it comes to that, corrected — without a network, a
// signed-in admin, or a populated database. Same split, for the same reason, as
// `progressMetrics` against `sessionService`.
//
// ## Every window here is a *rolling* one
//
// "This month" means the last 30 days, not the calendar month, and "last month"
// means days 31–60 rather than a named month. Calendar months are the wrong
// unit for a retention figure read on an arbitrary Tuesday: on the 2nd of the
// month "active this month" would be a two-day window, and the number would
// swing by a factor of fifteen for reasons that have nothing to do with the
// userbase. The one exception is the weekly-actives chart, whose buckets are
// Monday-start weeks because that is the week boundary the rest of the app uses.
//
// The screen states each window in its section subtitles, because a KPI whose
// window is a guess is a KPI that gets misquoted in a meeting.
//
// ## "Active" is computed from session dates, never `lastActiveAt`
//
// `lastActiveAt` is a foreground heartbeat with no backfill, so it is absent on
// every account that has not opened the app since it shipped — an engagement
// figure built on it would describe a userbase that mostly does not exist. A
// session is a fact about training, dated when it happened, and it is the field
// every other window in the app is already counted from.
import { getInteractionLevel, sportOverlapThreshold } from '../algorithms/conflictDetector'
import { SPORT_OPTIONS } from '../constants/training'
import { addDays, startOfWeek } from './dates'
import type { SportType } from '../types/session'
import type { ConflictSensitivity, SportInteractions } from '../types/user'

/** Weeks in the active-users chart. */
export const ACTIVE_WEEKS = 12

/** The rolling window behind "this month", retention and the top-users list. */
export const MONTH_DAYS = 30

/** How many athletes the most-active list ranks. */
export const TOP_USER_COUNT = 10

/** A slice smaller than this share of all sessions is folded into "Other". */
export const OTHER_SLICE_SHARE = 0.03

/** Four-hour columns in the activity heatmap. */
export const HOUR_BUCKETS = 6

const MS_PER_DAY = 86_400_000
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

/* ------------------------------------------------------------------ */
/* Inputs                                                              */
/* ------------------------------------------------------------------ */

/**
 * One session, reduced to the fields any figure on this screen actually reads.
 *
 * Deliberately not a {@link import('../types/session').Session}. A live-tracked
 * session carries a `routeCoordinates` array of every GPS fix, and holding a few
 * thousand of those in memory to compute a handful of scalars would be keeping
 * the heaviest field on the document alive to answer questions that never look
 * at it.
 */
export interface AdminSessionRow {
  /** The owning account, taken from the document's own path. */
  uid: string
  /** Raw stored value — may be a sport this build has no metadata for. */
  sport: string
  /** The session's own `date`, as epoch ms. Never `createdAt`. */
  dateMs: number
  /** `loadScore`, in AU. Zero when the document has none. */
  load: number
  rpe: number
}

/** The slice of a profile these aggregates need. */
export interface AdminProfileRow {
  uid: string
  displayName: string
  /** The athlete's own pairwise matrix — what the conflict engine reads. */
  sportInteractions: SportInteractions
  sensitivity: ConflictSensitivity
}

/* ------------------------------------------------------------------ */
/* Outputs                                                             */
/* ------------------------------------------------------------------ */

export interface EngagementKpis {
  totalUsers: number
  /** Distinct accounts with a session since Monday. */
  activeThisWeek: number
  /** Distinct accounts with a session in the last {@link MONTH_DAYS} days. */
  activeThisMonth: number
  /** Sessions in the last month ÷ accounts active in it. 0 when nobody was. */
  avgSessionsPerActiveUser: number
  /** Accounts created in the last {@link MONTH_DAYS} days. */
  newSignups: number
  /**
   * Share (0–1) of the previous month's actives who were active again this
   * month, or `null` when there was nobody to retain.
   */
  retention: number | null
  /** The denominator behind {@link retention} — how many there were to keep. */
  retentionBase: number
}

/** One point on the weekly-actives line. */
export interface ActiveWeekPoint {
  /** Monday local midnight, epoch ms. Also the React key. */
  startedAt: number
  /** Distinct accounts with a session that week. */
  users: number
  /** Short month name on the first bucket of each month; `null` otherwise. */
  tick: string | null
  /** "7 Jul – 13 Jul", for the accessible description. */
  label: string
  /** The current week, which is not over yet. */
  partial: boolean
}

/** One slice of the sport-distribution donut. */
export interface SportSlice {
  /** A sport value, or the literal `'other'` bucket. */
  key: string
  label: string
  count: number
  /** 0–1. */
  share: number
  /** True for the merged "Other" bucket, which takes a neutral colour. */
  isOther: boolean
  /** The sports folded in, for "Other"'s caption. Empty otherwise. */
  merged: string[]
}

/** One bar of the load-by-sport chart. */
export interface SportLoadBar {
  sport: string
  label: string
  /** Total AU across every account in the window. */
  load: number
  sessions: number
  /** 0–1 against the largest bar, for the bar's width. */
  fraction: number
}

/** The day-by-hour grid. */
export interface ActivityHeatmap {
  /** 7 rows (Mon–Sun) of {@link HOUR_BUCKETS} counts. */
  rows: number[][]
  /** The busiest single cell, for scaling the shading. 0 when empty. */
  max: number
  total: number
}

/** The sport × sport conflict grid. */
export interface ConflictMatrix {
  /** The sports on both axes, in {@link SPORT_OPTIONS} order. */
  sports: SportType[]
  /** `cells[i][j]` — conflicts between `sports[i]` and `sports[j]`. Symmetric. */
  cells: number[][]
  max: number
  /** Distinct clashes counted, each once — not the sum of the grid. */
  total: number
  /** The worst pairing, or `null` when nothing clashed. */
  worst: { a: SportType; b: SportType; count: number } | null
  /** Accounts whose profile was available to score. See the note on the fn. */
  usersScored: number
}

/** One row of the most-active list. */
export interface TopUser {
  uid: string
  displayName: string
  sessions: number
  /** Total AU over the window. */
  load: number
}

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */

function sportLabel(sport: string): string {
  return SPORT_OPTIONS.find((o) => o.value === sport)?.label ?? sport
}

/** Local midnight at the start of `date`'s day. */
export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

/**
 * Monday-first row index for a `Date.getDay()` value.
 *
 * The heatmap reads Mon–Sun because a training week does, while `getDay()` is
 * Sunday-first. Doing the rotation here rather than in the component keeps the
 * grid's rows and its row labels derived from one expression.
 */
export function mondayFirstIndex(day: number): number {
  return (day + 6) % 7
}

/* ------------------------------------------------------------------ */
/* Section 1 — engagement                                              */
/* ------------------------------------------------------------------ */

/**
 * The KPI block.
 *
 * `totalUsers` and `newSignups` are passed in rather than derived here: both are
 * exact `count()` aggregations over `/users`, and recomputing them from the
 * capped page of profile documents would turn two exact figures into two floors
 * that then silently disagree with the user list's own total.
 */
export function engagementKpis(
  rows: AdminSessionRow[],
  totalUsers: number,
  newSignups: number,
  now: Date,
): EngagementKpis {
  const today = startOfDay(now)
  const weekStart = startOfWeek(today).getTime()
  const monthStart = addDays(today, -(MONTH_DAYS - 1)).getTime()
  const prevMonthStart = addDays(today, -(MONTH_DAYS * 2 - 1)).getTime()

  const weekUsers = new Set<string>()
  const monthUsers = new Set<string>()
  const prevMonthUsers = new Set<string>()
  let monthSessions = 0

  for (const row of rows) {
    if (row.dateMs >= weekStart) weekUsers.add(row.uid)

    // Per *row*, not per user, and that is what makes the retention denominator
    // right: somebody who trained in both months has rows landing in both
    // branches, so they appear in `prevMonthUsers` (they were there to keep) and
    // in `monthUsers` (they were kept). Bucketing per user instead would put
    // them in one set only and quietly exclude every retained athlete from the
    // very figure that counts them.
    if (row.dateMs >= monthStart) {
      monthUsers.add(row.uid)
      monthSessions++
    } else if (row.dateMs >= prevMonthStart) {
      prevMonthUsers.add(row.uid)
    }
  }

  let retained = 0
  for (const uid of prevMonthUsers) if (monthUsers.has(uid)) retained++

  return {
    totalUsers,
    activeThisWeek: weekUsers.size,
    activeThisMonth: monthUsers.size,
    avgSessionsPerActiveUser: monthUsers.size > 0 ? monthSessions / monthUsers.size : 0,
    newSignups,
    retention: prevMonthUsers.size > 0 ? retained / prevMonthUsers.size : null,
    retentionBase: prevMonthUsers.size,
  }
}

/* ------------------------------------------------------------------ */
/* Section 2 — weekly actives                                          */
/* ------------------------------------------------------------------ */

/**
 * Distinct active accounts per week, oldest first, ending with this week.
 *
 * Counted per bucket rather than cumulatively: this is "how many people trained
 * that week", which is the engagement question. A cumulative "how many have ever
 * trained" only ever goes up and therefore says nothing.
 */
export function activeUsersByWeek(rows: AdminSessionRow[], now: Date): ActiveWeekPoint[] {
  const thisWeek = startOfWeek(startOfDay(now))
  const starts: Date[] = []
  for (let i = ACTIVE_WEEKS - 1; i >= 0; i--) starts.push(addDays(thisWeek, -i * 7))

  const buckets = starts.map(() => new Set<string>())
  const firstStart = starts[0].getTime()

  for (const row of rows) {
    if (row.dateMs < firstStart) continue
    const index = Math.floor((row.dateMs - firstStart) / (7 * MS_PER_DAY))
    if (index >= 0 && index < buckets.length) buckets[index].add(row.uid)
  }

  return starts.map((start, i) => {
    const end = addDays(start, 6)
    // Month labels only, and only where the month actually turns over. Twelve
    // dated ticks under a twelve-point line is a wall of 10pt text; the month
    // boundaries are the orientation a reader needs, and nothing more.
    const isBoundary = i === 0 || start.getMonth() !== starts[i - 1].getMonth()
    const short = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    return {
      startedAt: start.getTime(),
      users: buckets[i].size,
      tick: isBoundary ? start.toLocaleDateString(undefined, { month: 'short' }) : null,
      label: `${short(start)} – ${short(end)}`,
      partial: i === starts.length - 1,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Section 3 — sport distribution                                      */
/* ------------------------------------------------------------------ */

/**
 * Sessions by sport, largest first, with the long tail merged.
 *
 * Slices under {@link OTHER_SLICE_SHARE} are folded into one "Other" wedge:
 * below about three percent a wedge is a few degrees of arc, too thin to see and
 * too thin to hit, and it still costs a full legend row to say so. The sports
 * folded in are named in that row's caption, so nothing is actually hidden.
 *
 * Merging is skipped when exactly one sport is below the line, because an
 * "Other" of precisely one thing replaces its name with a worse one.
 */
export function sportDistribution(rows: AdminSessionRow[]): SportSlice[] {
  const total = rows.length
  if (total === 0) return []

  const counts = new Map<string, number>()
  for (const row of rows) counts.set(row.sport, (counts.get(row.sport) ?? 0) + 1)

  const ranked = Array.from(counts.entries())
    .map(([sport, count]) => ({ sport, count, share: count / total }))
    .sort((a, b) => b.count - a.count || a.sport.localeCompare(b.sport))

  const below = ranked.filter((e) => e.share < OTHER_SLICE_SHARE)
  const fold = below.length > 1 ? below : []
  const shown = below.length > 1 ? ranked.filter((e) => e.share >= OTHER_SLICE_SHARE) : ranked

  const slices: SportSlice[] = shown.map((e) => ({
    key: e.sport,
    label: sportLabel(e.sport),
    count: e.count,
    share: e.share,
    isOther: false,
    merged: [],
  }))

  if (fold.length > 0) {
    const count = fold.reduce((sum, e) => sum + e.count, 0)
    slices.push({
      key: 'other',
      label: 'Other',
      count,
      share: count / total,
      isOther: true,
      merged: fold.map((e) => sportLabel(e.sport)),
    })
  }

  return slices
}

/* ------------------------------------------------------------------ */
/* Section 4 — load by sport                                           */
/* ------------------------------------------------------------------ */

/**
 * Total training load by sport, heaviest first.
 *
 * Deliberately a second chart over the same sessions rather than a second series
 * on the donut. Load is duration × RPE, so a sport's share of the load and its
 * share of the *sessions* are different quantities that routinely disagree —
 * twelve half-hour gym sessions against four long rides is the interesting case,
 * and one chart carrying both would have to pick which of the two a wedge's
 * angle meant.
 */
export function loadBySport(rows: AdminSessionRow[]): SportLoadBar[] {
  const totals = new Map<string, { load: number; sessions: number }>()
  for (const row of rows) {
    const current = totals.get(row.sport) ?? { load: 0, sessions: 0 }
    current.load += row.load
    current.sessions += 1
    totals.set(row.sport, current)
  }

  const ranked = Array.from(totals.entries())
    .map(([sport, t]) => ({ sport, label: sportLabel(sport), load: t.load, sessions: t.sessions }))
    .sort((a, b) => b.load - a.load || a.sport.localeCompare(b.sport))

  const max = ranked.reduce((m, r) => Math.max(m, r.load), 0)
  return ranked.map((r) => ({ ...r, fraction: max > 0 ? r.load / max : 0 }))
}

/* ------------------------------------------------------------------ */
/* Section 5 — activity heatmap                                        */
/* ------------------------------------------------------------------ */

/**
 * When the userbase trains: day of week against four-hour block.
 *
 * Read from the session's `date`, which carries a real clock time for a
 * live-tracked session and the moment of entry for a quick-logged one. That is a
 * limitation of the source rather than of the grid, and the card says so out
 * loud — an athlete who trains at six and logs it at nine lands in the nine
 * o'clock column, and no amount of shading will fix that.
 */
export function activityHeatmap(rows: AdminSessionRow[]): ActivityHeatmap {
  const grid: number[][] = Array.from({ length: 7 }, () =>
    new Array<number>(HOUR_BUCKETS).fill(0),
  )
  let max = 0

  for (const row of rows) {
    const d = new Date(row.dateMs)
    const day = mondayFirstIndex(d.getDay())
    const bucket = Math.min(HOUR_BUCKETS - 1, Math.floor(d.getHours() / (24 / HOUR_BUCKETS)))
    const next = grid[day][bucket] + 1
    grid[day][bucket] = next
    if (next > max) max = next
  }

  return { rows: grid, max, total: rows.length }
}

/* ------------------------------------------------------------------ */
/* Section 6 — cross-sport conflict frequency                          */
/* ------------------------------------------------------------------ */

/**
 * How often each pair of sports has actually clashed, across the userbase.
 *
 * ## This is a frequency table, not a confusion matrix
 *
 * It looks like one — a square grid of sports against sports — and it is not,
 * in the way that matters. A confusion matrix needs ground truth: predictions on
 * one axis, outcomes on the other, so that the off-diagonal cells are *errors*.
 * FORMA has no ground truth here. Nothing in this database records whether an
 * athlete who trained through a flagged pairing went on to get hurt,
 * underperform, or feel completely fine, so there is no outcome to check a
 * prediction against and no cell that could honestly be called a false positive.
 * Every cell below is one number — how many times that pairing tripped the
 * sport-overlap check — and dressing it up as accuracy would be inventing a
 * validation the data cannot support.
 *
 * ## Why it is recomputed rather than read
 *
 * Detected conflicts are persisted at `/users/{uid}/conflicts`, and
 * `firestore.rules` grants an admin no access to them: the collection-group read
 * admins hold is on `sessions` alone. So this re-runs the engine's own
 * sport-overlap check — {@link getInteractionLevel} and
 * {@link sportOverlapThreshold}, the same two functions `detectConflicts` calls
 * — over each athlete's sessions, their own matrix and their own sensitivity.
 *
 * Which is why these counts can differ slightly from what an athlete was shown
 * at the time: somebody who has since changed their sensitivity is re-scored at
 * today's setting, and a conflict they dismissed still counts, because a
 * dismissal is a fact about the notification rather than about the training.
 *
 * Only the sport-overlap check is counted. The CNS check fires on two hard
 * sessions whatever they were, so folding it in would credit pairs that have no
 * interaction relationship with clashes the matrix did not cause; the weekly
 * budget check involves no pair of sports at all.
 */
export function conflictMatrix(
  rows: AdminSessionRow[],
  profiles: Map<string, AdminProfileRow>,
): ConflictMatrix {
  const sports = SPORT_OPTIONS.map((o) => o.value)
  const index = new Map<string, number>(sports.map((s, i) => [s, i]))
  const cells: number[][] = sports.map(() => new Array<number>(sports.length).fill(0))

  const byUser = new Map<string, AdminSessionRow[]>()
  for (const row of rows) {
    const list = byUser.get(row.uid)
    if (list) list.push(row)
    else byUser.set(row.uid, [row])
  }

  let total = 0
  let max = 0
  let usersScored = 0

  for (const [uid, sessions] of byUser) {
    const profile = profiles.get(uid)
    // No profile means no matrix, and a matrix defaulted to zeros would score
    // every pair as harmless — which is not "we found no conflicts", it is "we
    // could not look". Skipping keeps those two apart, and `usersScored` lets
    // the card say how many athletes were actually in scope rather than letting
    // a short profile page silently deflate the grid.
    if (!profile) continue
    usersScored++

    const threshold = sportOverlapThreshold(profile.sensitivity)
    const ordered = [...sessions].sort((a, b) => a.dateMs - b.dateMs)

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const earlier = ordered[i]
        const later = ordered[j]
        // Ascending, so once one is out of range every later one is too.
        if (later.dateMs - earlier.dateMs > FORTY_EIGHT_HOURS_MS) break
        if (earlier.sport === later.sport) continue

        const a = index.get(earlier.sport)
        const b = index.get(later.sport)
        if (a === undefined || b === undefined) continue

        const level = getInteractionLevel(earlier.sport, later.sport, profile.sportInteractions)
        if (level < 2 || earlier.rpe < threshold) continue

        // Written into both halves: the grid is symmetric, and a reader scanning
        // one row should not have to know which of the two was logged first.
        cells[a][b] += 1
        cells[b][a] += 1
        total += 1
        if (cells[a][b] > max) max = cells[a][b]
      }
    }
  }

  let worst: ConflictMatrix['worst'] = null
  for (let i = 0; i < sports.length; i++) {
    for (let j = i + 1; j < sports.length; j++) {
      if (cells[i][j] > 0 && (!worst || cells[i][j] > worst.count)) {
        worst = { a: sports[i], b: sports[j], count: cells[i][j] }
      }
    }
  }

  return { sports, cells, max, total, worst, usersScored }
}

/* ------------------------------------------------------------------ */
/* Section 7 — most active users                                       */
/* ------------------------------------------------------------------ */

/**
 * The busiest athletes over the last {@link MONTH_DAYS} days.
 *
 * Ranked by session count with load as the tie-break, which is the order the
 * heading claims. No email address: the user list further down the screen is
 * where contact detail belongs, and a leaderboard is read by whoever happens to
 * be holding the phone — repeating an address up here would spread it across the
 * page for no gain at all.
 */
export function topUsers(
  rows: AdminSessionRow[],
  profiles: Map<string, AdminProfileRow>,
  now: Date,
): TopUser[] {
  const since = addDays(startOfDay(now), -(MONTH_DAYS - 1)).getTime()
  const totals = new Map<string, { sessions: number; load: number }>()

  for (const row of rows) {
    if (row.dateMs < since) continue
    const current = totals.get(row.uid) ?? { sessions: 0, load: 0 }
    current.sessions += 1
    current.load += row.load
    totals.set(row.uid, current)
  }

  return Array.from(totals.entries())
    .map(([uid, t]) => ({
      uid,
      displayName: profiles.get(uid)?.displayName || 'Unnamed athlete',
      sessions: t.sessions,
      load: t.load,
    }))
    .sort((a, b) => b.sessions - a.sessions || b.load - a.load)
    .slice(0, TOP_USER_COUNT)
}
