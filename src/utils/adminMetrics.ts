// Derives every Admin chart dataset from one bounded fetch.

import { getInteractionLevel, sportOverlapThreshold } from '../algorithms/conflictDetector'
import { SPORT_OPTIONS } from '../constants/training'
import { addDays, startOfWeek } from './dates'
import type { SportType } from '../types/session'
import type { ConflictSensitivity, SportInteractions } from '../types/user'

export const ACTIVE_WEEKS = 12

export const MONTH_DAYS = 30

export const TOP_USER_COUNT = 10

export const OTHER_SLICE_SHARE = 0.03

export const HOUR_BUCKETS = 6

const MS_PER_DAY = 86_400_000
const FORTY_EIGHT_HOURS_MS = 48 * 60 * 60 * 1000

export interface AdminSessionRow {
  uid: string
  sport: string
  dateMs: number
  load: number
  rpe: number
}

export interface AdminProfileRow {
  uid: string
  displayName: string
  sportInteractions: SportInteractions
  sensitivity: ConflictSensitivity
}

export interface EngagementKpis {
  totalUsers: number
  activeThisWeek: number
  activeThisMonth: number
  avgSessionsPerActiveUser: number
  newSignups: number
  retention: number | null
  retentionBase: number
}

export interface ActiveWeekPoint {
  startedAt: number
  users: number
  tick: string | null
  label: string
  partial: boolean
}

export interface SportSlice {
  key: string
  label: string
  count: number
  share: number
  isOther: boolean
  merged: string[]
}

export interface SportLoadBar {
  sport: string
  label: string
  load: number
  sessions: number
  fraction: number
}

export interface ActivityHeatmap {
  rows: number[][]
  max: number
  total: number
}

export interface ConflictMatrix {
  sports: SportType[]
  cells: number[][]
  max: number
  total: number
  worst: { a: SportType; b: SportType; count: number } | null
  usersScored: number
}

export interface TopUser {
  uid: string
  displayName: string
  sessions: number
  load: number
}

function sportLabel(sport: string): string {
  return SPORT_OPTIONS.find((o) => o.value === sport)?.label ?? sport
}

export function startOfDay(date: Date): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function mondayFirstIndex(day: number): number {
  return (day + 6) % 7
}

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
    if (!profile) continue
    usersScored++

    const threshold = sportOverlapThreshold(profile.sensitivity)
    const ordered = [...sessions].sort((a, b) => a.dateMs - b.dateMs)

    for (let i = 0; i < ordered.length; i++) {
      for (let j = i + 1; j < ordered.length; j++) {
        const earlier = ordered[i]
        const later = ordered[j]
        if (later.dateMs - earlier.dateMs > FORTY_EIGHT_HOURS_MS) break
        if (earlier.sport === later.sport) continue

        const a = index.get(earlier.sport)
        const b = index.get(later.sport)
        if (a === undefined || b === undefined) continue

        const level = getInteractionLevel(earlier.sport, later.sport, profile.sportInteractions)
        if (level < 2 || earlier.rpe < threshold) continue

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
