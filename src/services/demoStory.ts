// Builds the demo account's training history, and verifies it.

import { Timestamp } from 'firebase/firestore'
import { buildDailyLoads, calculateATL, calculateCTL } from '../algorithms/ctlAtl'
import { getFormStatus } from '../algorithms/formScore'
import { detectConflicts } from '../algorithms/conflictDetector'
import { estimateCalories } from '../algorithms/calories'
import { estimateHRZone } from '../algorithms/heartRate'
import { calculatePace } from '../algorithms/pace'
import { computeSplits, computeElevationGain } from '../algorithms/movingTime'
import {
  computeRecoveryStatus,
  computeWeeklyPlan,
  RECOMMENDER_MIN_TRAINING_DAYS,
} from '../algorithms/recommender'
import {
  DEFAULT_SPORT_INTERACTIONS,
  calculateBaselineCTL,
  calculateBaselineWeeklyLoad,
} from '../constants/training'
import { BASELINE_DAYS, countTrainingDays, getBaselineState } from '../utils/calibration'
import { computeProgress } from '../utils/progressMetrics'
import { detectPlannedConflicts } from '../algorithms/conflictDetector'
import { addDays, localISODate, startOfWeek } from '../utils/dates'
import { formatPaceValue } from '../utils/geo'
import { conflictStorageKey, type Conflict } from '../types/conflict'
import { DISABLED_NOTIFICATION_PREFERENCES } from '../types/notifications'
import type { PlannedSession } from '../types/planned'
import type { Session, SessionSplit, SportType } from '../types/session'
import type { User } from '../types/user'
import { DEFAULT_ROUTE_CENTRE, generateRoute, type RouteCentre } from './demoRoute'

interface DaySpec {
  weekday: number
  sport: SportType
  minutes: number
  rpe: number
  hour: number
  minute: number
  distanceKm?: number
  title?: string
  notes: string
  gps?: boolean
}

const WEEK_A: DaySpec[] = [
  {
    weekday: 0,
    sport: 'gym',
    minutes: 55,
    rpe: 6,
    hour: 18,
    minute: 30,
    title: 'Lower body + core',
    notes: 'Squats, RDLs, calf raises. Legs felt heavy from Sunday but moved fine.',
  },
  {
    weekday: 1,
    sport: 'running',
    minutes: 40,
    rpe: 5,
    hour: 7,
    minute: 10,
    distanceKm: 6.9,
    title: 'Easy morning run',
    notes: 'Conversational the whole way. Cold start, warmed up after 10 minutes.',
  },
  {
    weekday: 3,
    sport: 'running',
    minutes: 42,
    rpe: 8,
    hour: 6,
    minute: 45,
    distanceKm: 8.8,
    title: 'Tempo intervals',
    notes: '5 x 5 min at threshold, 90s float. Last rep was a grind.',
    gps: true,
  },
  {
    weekday: 5,
    sport: 'running',
    minutes: 35,
    rpe: 4,
    hour: 8,
    minute: 30,
    distanceKm: 6.0,
    title: 'Shakeout',
    notes: 'Deliberately slow. Legs opening up before tomorrow.',
  },
  {
    weekday: 6,
    sport: 'running',
    minutes: 75,
    rpe: 6,
    hour: 9,
    minute: 15,
    distanceKm: 14.1,
    title: 'Sunday long run',
    notes: 'Steady all the way, negative split the last 4 km. Good session.',
    gps: true,
  },
]

const WEEK_A_RECENT: DaySpec[] = WEEK_A.map((day) => {
  if (day.weekday === 0) {
    return {
      ...day,
      rpe: 7,
      notes: 'Heavy day — worked up to a top set of 5 on squats. Properly cooked after.',
    }
  }
  if (day.weekday === 3) {
    return { ...day, minutes: 48, rpe: 7, distanceKm: 9.9 }
  }
  if (day.weekday === 6) {
    return {
      ...day,
      minutes: 85,
      rpe: 5,
      distanceKm: 16.0,
      notes: 'Deliberately easy the whole way. Time on feet, not a workout.',
    }
  }
  return day
})

const WEEK_B: DaySpec[] = [
  {
    weekday: 0,
    sport: 'gym',
    minutes: 50,
    rpe: 6,
    hour: 18,
    minute: 30,
    title: 'Upper body',
    notes: 'Press, rows, pull-ups. Kept it short.',
  },
  {
    weekday: 1,
    sport: 'running',
    minutes: 40,
    rpe: 5,
    hour: 7,
    minute: 10,
    distanceKm: 6.9,
    title: 'Easy morning run',
    notes: 'Legs fine. Saving something for the class tomorrow.',
  },
  {
    weekday: 2,
    sport: 'combat',
    minutes: 70,
    rpe: 8,
    hour: 19,
    minute: 0,
    title: 'Boxing class',
    notes: 'Pad work then four rounds of sparring. Hardest session of the week by far.',
  },
  {
    weekday: 4,
    sport: 'running',
    minutes: 35,
    rpe: 5,
    hour: 6,
    minute: 50,
    distanceKm: 6.0,
    title: 'Recovery run',
    notes: 'Shoulders and hips still sore from Wednesday. Kept it very easy.',
  },
  {
    weekday: 6,
    sport: 'running',
    minutes: 60,
    rpe: 6,
    hour: 9,
    minute: 15,
    distanceKm: 11.3,
    title: 'Sunday long run',
    notes: 'Shorter than usual — the week had already taken enough out of me.',
    gps: true,
  },
]

const WEEK_OVERREACH: DaySpec[] = [
  {
    weekday: 0,
    sport: 'gym',
    minutes: 55,
    rpe: 7,
    hour: 18,
    minute: 30,
    title: 'Heavy legs',
    notes: 'Squat triples. Ambitious start to the week.',
  },
  {
    weekday: 1,
    sport: 'running',
    minutes: 45,
    rpe: 8,
    hour: 6,
    minute: 45,
    distanceKm: 9.3,
    title: 'Threshold run',
    notes: 'Should not have run this hard the morning after squats. Quads were flat.',
  },
  {
    weekday: 2,
    sport: 'combat',
    minutes: 70,
    rpe: 9,
    hour: 19,
    minute: 0,
    title: 'Sparring night',
    notes: 'Six rounds. Went far harder than planned.',
  },
  {
    weekday: 3,
    sport: 'running',
    minutes: 40,
    rpe: 8,
    hour: 6,
    minute: 50,
    distanceKm: 8.4,
    title: 'Intervals',
    notes: 'Legs were gone from the start. Finished it out of stubbornness.',
  },
  {
    weekday: 5,
    sport: 'running',
    minutes: 70,
    rpe: 7,
    hour: 9,
    minute: 0,
    distanceKm: 13.4,
    title: 'Long run',
    notes: 'Grim. Right calf tight for the last half hour.',
  },
  {
    weekday: 6,
    sport: 'gym',
    minutes: 30,
    rpe: 5,
    hour: 10,
    minute: 0,
    title: 'Mobility + light circuit',
    notes: 'Barely a session. Everything ached.',
  },
]

const WEEK_RECOVERY: DaySpec[] = [
  {
    weekday: 1,
    sport: 'running',
    minutes: 35,
    rpe: 4,
    hour: 7,
    minute: 20,
    distanceKm: 6.1,
    title: 'Easy reset',
    notes: 'Backing right off after last week. Calf behaving.',
  },
  {
    weekday: 3,
    sport: 'gym',
    minutes: 40,
    rpe: 4,
    hour: 18,
    minute: 30,
    title: 'Light full body',
    notes: 'Half the usual weight, twice the attention to form.',
  },
  {
    weekday: 6,
    sport: 'running',
    minutes: 55,
    rpe: 5,
    hour: 9,
    minute: 30,
    distanceKm: 9.6,
    title: 'Easy long run',
    notes: 'Felt human again. Ready to build back up.',
  },
]

const WEEK_PLAN: DaySpec[][] = [
  WEEK_A,
  WEEK_A,
  WEEK_B,
  WEEK_A,
  WEEK_A,
  WEEK_B,
  WEEK_OVERREACH,
  WEEK_RECOVERY,
  WEEK_A,
  WEEK_B,
  WEEK_A_RECENT,
  WEEK_A_RECENT,
]

export const DEMO_WEEKS = WEEK_PLAN.length

const GPS_FROM_WEEK = 8

const UNRESOLVED_CONFLICTS = 3

const ACCOUNT_AGE_DAYS = 420

export interface DemoProfileOptions {
  uid: string
  email: string
  displayName?: string
}

export function buildDemoProfile({ uid, email, displayName }: DemoProfileOptions): User {
  const weeklyBudgetHours = 8
  const experienceLevel = 'advanced' as const

  return {
    uid,
    displayName: displayName?.trim() || 'Alex Rivera',
    email,
    createdAt: new Date(Date.now() - ACCOUNT_AGE_DAYS * 86_400_000).toISOString(),
    sports: ['running', 'gym', 'combat'],
    weeklyBudgetHours,
    experienceLevel,
    conflictSensitivity: 'balanced',
    sportInteractions: { ...DEFAULT_SPORT_INTERACTIONS },
    onboardingCompleted: true,
    baselineCTL: calculateBaselineCTL(weeklyBudgetHours, experienceLevel),
    baselineWeeklyLoad: calculateBaselineWeeklyLoad(weeklyBudgetHours, experienceLevel),
    weightKg: 72,
    weightUnit: 'kg',
    maxHR: 189,
    firstSessionCelebrated: true,
    notificationPreferences: { ...DISABLED_NOTIFICATION_PREFERENCES },
  }
}

export interface DemoStoryOptions {
  uid: string
  profile: User
  now?: Date
  routeCentre?: RouteCentre
}

export interface DemoStory {
  sessions: Session[]
  conflicts: Conflict[]
  planned: PlannedSession[]
}

export function buildDemoStory({
  uid,
  profile,
  now = new Date(),
  routeCentre = DEFAULT_ROUTE_CENTRE,
}: DemoStoryOptions): DemoStory {
  const thisWeekStart = startOfWeek(now)
  const sessions: Session[] = []

  WEEK_PLAN.forEach((week, weekIndex) => {
    const weekStart = addDays(thisWeekStart, -(DEMO_WEEKS - 1 - weekIndex) * 7)

    week.forEach((spec, dayIndex) => {
      const when = addDays(weekStart, spec.weekday)
      when.setHours(spec.hour, spec.minute, 0, 0)
      if (when.getTime() > now.getTime()) {
        if (!isSameLocalDay(when, now)) return
        const pulled = new Date(now.getTime() - 5 * 60_000)
        if (!isSameLocalDay(pulled, now)) return
        when.setTime(pulled.getTime())
      }

      sessions.push(
        buildSession({
          id: `demo-w${String(weekIndex).padStart(2, '0')}-${dayIndex}`,
          uid,
          profile,
          spec,
          when,
          withRoute: spec.gps === true && weekIndex >= GPS_FROM_WEEK,
          routeCentre,
        }),
      )
    })
  })

  sessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    sessions,
    conflicts: buildConflicts(sessions, profile),
    planned: buildPlannedSessions(uid, now),
  }
}

function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function buildSession(args: {
  id: string
  uid: string
  profile: User
  spec: DaySpec
  when: Date
  withRoute: boolean
  routeCentre: RouteCentre
}): Session {
  const { id, uid, profile, spec, when, withRoute, routeCentre } = args

  const loadScore = spec.minutes * spec.rpe
  const hr = estimateHRZone(spec.rpe, profile.maxHR)
  const base: Session = {
    id,
    userId: uid,
    sport: spec.sport,
    date: when.toISOString(),
    durationMinutes: spec.minutes,
    distanceKm: spec.distanceKm,
    rpe: spec.rpe,
    loadScore,
    notes: spec.notes,
    createdAt: new Date(when.getTime() + 12 * 60_000).toISOString(),
    estimatedCalories: estimateCalories(spec.sport, spec.minutes, spec.rpe, profile.weightKg),
    estimatedHRZone: { zone: hr.zone, name: hr.name, hrRange: hr.hrRange },
    pace: spec.distanceKm
      ? calculatePace(spec.sport, spec.minutes, spec.distanceKm)
      : null,
    title: spec.title,
    trackingMode: 'quick',
  }

  if (!withRoute || spec.distanceKm == null) return base

  const route = generateRoute(id, routeCentre, spec.distanceKm, spec.minutes, when)
  const splits: SessionSplit[] = computeSplits(route.points)
  const distanceKm = route.distanceM / 1000
  const movingSeconds = route.movingTimeMs / 1000

  return {
    ...base,
    distanceKm: Math.round(distanceKm * 100) / 100,
    trackingMode: 'live',
    routeCoordinates: route.points,
    gpsQuality: 'good',
    movingTimeMs: route.movingTimeMs,
    splits,
    elevationGain: computeElevationGain(route.points),
    averagePace: formatPaceValue(movingSeconds / distanceKm),
    pace: calculatePace(spec.sport, spec.minutes, Math.round(distanceKm * 100) / 100),
  }
}

function buildConflicts(sessions: Session[], profile: User): Conflict[] {
  const SEVEN_DAYS_MS = 7 * 86_400_000
  const seen = new Set<string>()
  const out: Conflict[] = []

  sessions.forEach((session, index) => {
    const at = new Date(session.date).getTime()
    const recent = sessions
      .slice(0, index + 1)
      .filter((s) => at - new Date(s.date).getTime() <= SEVEN_DAYS_MS)

    const weekStart = startOfWeek(new Date(session.date)).getTime()
    const weeklyHours =
      recent
        .filter((s) => new Date(s.date).getTime() >= weekStart)
        .reduce((sum, s) => sum + s.durationMinutes, 0) / 60

    for (const conflict of detectConflicts(session, recent, profile, weeklyHours)) {
      const key = conflictStorageKey(conflict)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        ...conflict,
        conflictId: `demo-conflict-${out.length}`,
        detectedAt: Timestamp.fromDate(new Date(session.date)),
        resolved: true,
      })
    }
  })

  out.sort((a, b) => b.detectedAt.toMillis() - a.detectedAt.toMillis())
  for (let i = 0; i < Math.min(UNRESOLVED_CONFLICTS, out.length); i++) {
    out[i] = { ...out[i], resolved: false }
  }
  return out
}

function buildPlannedSessions(uid: string, now: Date): PlannedSession[] {
  const createdAt = new Date(now.getTime() - 2 * 86_400_000).toISOString()
  const day = (offset: number) => localISODate(addDays(now, offset))

  return [
    {
      id: 'demo-plan-0',
      userId: uid,
      sport: 'combat',
      date: day(2),
      durationMinutes: 75,
      intensity: 8,
      createdAt,
    },
    {
      id: 'demo-plan-1',
      userId: uid,
      sport: 'running',
      date: day(3),
      durationMinutes: 45,
      intensity: 6,
      createdAt,
    },
    {
      id: 'demo-plan-2',
      userId: uid,
      sport: 'gym',
      date: day(5),
      durationMinutes: 50,
      intensity: 6,
      createdAt,
    },
  ]
}

export interface DemoCheck {
  name: string
  passed: boolean
  detail: string
  critical?: boolean
}

export function verifyDemoStory(
  story: DemoStory,
  profile: User,
  now: Date = new Date(),
): DemoCheck[] {
  const { sessions, conflicts, planned } = story

  const windowStart = now.getTime() - 42 * 86_400_000
  const windowed = sessions.filter((s) => new Date(s.date).getTime() >= windowStart)

  const trainingDays = countTrainingDays(sessions)
  const baseline = getBaselineState({ trainingDays, sessionsLogged: sessions.length })

  const progress = computeProgress(sessions, 'all', now, {
    baselineCTL: profile.baselineCTL,
    createdAt: profile.createdAt,
  })

  const daysSinceRegistration = Math.max(
    0,
    Math.floor((now.getTime() - new Date(profile.createdAt).getTime()) / 86_400_000),
  )
  const baselineATL = profile.baselineCTL != null ? profile.baselineCTL * 0.9 : undefined
  const dailyLoads = buildDailyLoads(windowed, 42, now)
  const ctl = calculateCTL(dailyLoads, { baselineCTL: profile.baselineCTL, daysSinceRegistration })
  const atl = calculateATL(dailyLoads, { baselineATL, daysSinceRegistration })
  const form = ctl - atl

  const recommenderInput = {
    sessions: windowed,
    profile: { sports: profile.sports, sportInteractions: profile.sportInteractions },
    metrics: { ctl, atl },
    now,
  }
  const plan = computeWeeklyPlan(recommenderInput)
  const recovery = computeRecoveryStatus(recommenderInput)
  const plannedConflicts = detectPlannedConflicts(planned, profile)

  const checks: DemoCheck[] = []

  checks.push({
    name: `${BASELINE_DAYS}+ distinct training days (Form Score unlocked)`,
    passed: trainingDays >= BASELINE_DAYS && !baseline.building,
    detail: `${trainingDays} distinct training days across ${sessions.length} sessions; hero shows ${
      baseline.building ? 'the BASELINE METER' : `a Form Score of ${form}`
    }.`,
    critical: true,
  })

  const status = getFormStatus(form, ctl)
  checks.push({
    name: 'Form Score lands in a defensible band',
    passed: form > -15 && form <= 15,
    detail: `CTL ${ctl}, ATL ${atl}, Form ${form} — hero reads "${status.status}: ${status.message}"`,
  })

  const top = progress.sports[0]
  checks.push({
    name: 'Three sports with a >60% leader (cross-training note fires)',
    passed: progress.sports.length >= 3 && (top?.share ?? 0) > 60,
    detail: progress.sports.map((s) => `${s.label} ${s.share}%`).join(', ') || 'no sports',
  })

  const complete = progress.weeks.filter((w) => !w.partial)
  const aboveIdx = complete.findIndex((w) => w.standing === 'above')
  const belowIdx = complete.findIndex((w, i) => w.standing === 'below' && i > aboveIdx)
  const insideCount = complete.filter((w) => w.standing === 'inside').length
  checks.push({
    name: 'Overreach week above the band, followed by a recovery week below it',
    passed: aboveIdx !== -1 && belowIdx === aboveIdx + 1 && insideCount > 0,
    detail: progress.band
      ? `band ${progress.band.low}-${progress.band.high} AU (CTL ${progress.band.ctl}); weeks: ` +
        complete.map((w) => `${w.load}${symbolFor(w.standing)}`).join(' ')
      : 'no band — CTL is zero',
  })

  const unresolved = conflicts.filter((c) => !c.resolved)
  const crossSport = conflicts.filter((c) => c.sports.length >= 2)
  const newest = conflicts.reduce(
    (max, c) => Math.max(max, c.detectedAt.toMillis()),
    0,
  )
  const newestAgeDays = Math.floor((now.getTime() - newest) / 86_400_000)
  checks.push({
    name: '2+ cross-sport conflicts, the newest recent and unresolved',
    passed: crossSport.length >= 2 && unresolved.length >= 1 && newestAgeDays <= 14,
    detail: `${conflicts.length} detected (${crossSport.length} cross-sport, ${unresolved.length} unresolved); newest ${newestAgeDays} days ago.`,
  })

  checks.push({
    name: 'Consistency streak of 3-5 weeks in range',
    passed: progress.streak >= 3 && progress.streak <= 5,
    detail: `${progress.streak} consecutive weeks inside the sustainable band.`,
  })

  const planOk =
    plan.status === 'ok' && plan.sessions.length >= 3 && plan.budgetFit === 'on_target'
  const recovering = recovery.filter((r) => r.status === 'recovering')
  checks.push({
    name: 'Recommender returns a 3-4 session plan, on target',
    passed: planOk,
    detail:
      plan.status === 'ok'
        ? `${plan.sessions.length} sessions, ${plan.budgetFit}, target ${plan.budget.target} AU, stance "${plan.budget.stance}" — ` +
          plan.sessions.map((s) => `${s.sport} ${s.durationMinutes}min@${s.rpe}`).join(', ')
        : `insufficient_data (${plan.trainingDays}/${RECOMMENDER_MIN_TRAINING_DAYS} training days in the 42-day window)`,
  })
  checks.push({
    name: 'At least one sport shows a recovery countdown',
    passed: recovering.length >= 1,
    detail:
      recovery
        .map((r) =>
          r.status === 'recovering'
            ? `${r.sport}: wait ${r.daysRemaining}d`
            : `${r.sport}: ${r.status}`,
        )
        .join(', ') || 'no sports on the profile',
  })

  const withRoutes = sessions.filter(
    (s) => s.sport === 'running' && (s.routeCoordinates?.length ?? 0) > 1,
  )
  checks.push({
    name: '3+ running sessions with GPS routes',
    passed: withRoutes.length >= 3,
    detail: withRoutes.length
      ? `${withRoutes.length} routes; ${withRoutes
          .slice(-3)
          .map((s) => `${s.distanceKm}km/${s.routeCoordinates?.length}pts`)
          .join(', ')}`
      : 'none',
  })

  checks.push({
    name: 'Planned week with a detected planned conflict',
    passed: planned.length >= 3 && plannedConflicts.length >= 1,
    detail: `${planned.length} planned sessions, ${plannedConflicts.length} planned conflicts.`,
  })

  const hours = new Set(sessions.map((s) => new Date(s.date).getHours()))
  const rpes = new Set(sessions.map((s) => s.rpe))
  checks.push({
    name: 'Varied times of day, RPE and notes',
    passed: hours.size >= 4 && rpes.size >= 4,
    detail: `${hours.size} distinct start hours, RPE ${Math.min(...rpes)}-${Math.max(
      ...rpes,
    )} (${rpes.size} values), ${sessions.filter((s) => s.notes).length} notes.`,
  })

  return checks
}

function symbolFor(standing: 'above' | 'inside' | 'below' | null): string {
  if (standing === 'above') return '^'
  if (standing === 'below') return 'v'
  if (standing === 'inside') return '='
  return '?'
}
