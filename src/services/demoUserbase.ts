// The supporting cast: a handful of lighter accounts so the Admin screen has a
// userbase to describe.
//
// ## Why this exists at all
//
// Every chart on the Admin screen is an aggregate over *many* athletes — a sport
// distribution, a weekly-actives line, an hour-of-day heatmap, a cross-sport
// conflict matrix. Run against one account they all render correctly and all
// look broken: a pie with a single slice, a line at y=1, a heatmap with four lit
// cells. The screen is not wrong; it simply has nothing to average.
//
// So this generates six to eight accounts whose histories differ from each other
// in the specific dimensions those charts read:
//
//   * **Every sport in the picker appears**, or the distribution donut has holes
//     where the app claims to support something.
//   * **Training hours span morning, lunchtime and evening** across weekdays and
//     weekends, or the heatmap is a single vertical stripe.
//   * **Five accounts carry a deliberately stacked hard pair**, each a different
//     sport combination, so the conflict matrix fills in more than one cell. The
//     matrix recomputes conflicts from stored sessions rather than reading them
//     (admins cannot read `/users/{uid}/conflicts` — see `firestore.rules`), so
//     what it needs is the *sessions* that would produce a conflict, at the
//     right spacing and above the right RPE.
//   * **Account ages are spread**, two of them inside thirty days, so the "new
//     signups" KPI is not zero and the retention figure has both a numerator and
//     a denominator.
//   * **One account has lapsed**, because a userbase where everybody is still
//     active is the one shape a real one never has — and the median-gap KPI has
//     nothing to say without it.
//
// Deliberately lighter than the main demo account: two to four sessions a week,
// no GPS routes, no conflict documents. These accounts are never signed into
// during the pitch; they exist to be counted.
import { estimateCalories } from '../algorithms/calories'
import { estimateHRZone } from '../algorithms/heartRate'
import { calculatePace } from '../algorithms/pace'
import {
  DEFAULT_SPORT_INTERACTIONS,
  calculateBaselineCTL,
  calculateBaselineWeeklyLoad,
} from '../constants/training'
import { addDays, startOfWeek } from '../utils/dates'
import { DISABLED_NOTIFICATION_PREFERENCES } from '../types/notifications'
import type { Session, SportType } from '../types/session'
import type { ConflictSensitivity, ExperienceLevel, User } from '../types/user'

/** One session in an archetype's weekly pattern. `weekday` is 0 = Mon … 6 = Sun. */
interface PatternDay {
  weekday: number
  sport: SportType
  minutes: number
  rpe: number
  hour: number
  minute: number
  distanceKm?: number
  notes: string
}

interface Archetype {
  /** Slug used to build the email address and the deterministic ids. */
  key: string
  displayName: string
  sports: SportType[]
  experienceLevel: ExperienceLevel
  weeklyBudgetHours: number
  sensitivity: ConflictSensitivity
  weightKg: number
  maxHR: number
  /** How long ago the account registered. Bounds the history below it. */
  createdDaysAgo: number
  /** Weeks of history to write, counted back from {@link staleWeeks}. */
  weeks: number
  /** Weeks of silence at the end. Zero for an account still training. */
  staleWeeks: number
  pattern: PatternDay[]
}

/**
 * The cast.
 *
 * Each pattern is a single week repeated, which is what a casual athlete's
 * calendar genuinely looks like — the variation that stops it reading as a copy
 * comes from {@link jitter}, applied per week to duration, RPE and start time.
 *
 * Where a pattern has two sessions on consecutive days and the first is at RPE 7
 * or above, that is not an accident: it is the pair the Admin screen's conflict
 * matrix will recompute into a flagged cell. The pairs chosen are all level 2 or
 * 3 in the default interaction matrix — football/running, combat/strength,
 * cycling/running, gym/strength, running/gym — so five different cells light up
 * rather than the same one five times.
 */
const ARCHETYPES: Archetype[] = [
  {
    key: 'priya',
    displayName: 'Priya Nair',
    sports: ['running', 'cycling'],
    experienceLevel: 'intermediate',
    weeklyBudgetHours: 7,
    sensitivity: 'balanced',
    weightKg: 61,
    maxHR: 188,
    createdDaysAgo: 300,
    weeks: 11,
    staleWeeks: 0,
    pattern: [
      { weekday: 0, sport: 'running', minutes: 45, rpe: 6, hour: 6, minute: 30, distanceKm: 8.1, notes: 'Before work. Cool and quiet.' },
      { weekday: 2, sport: 'cycling', minutes: 70, rpe: 5, hour: 18, minute: 0, distanceKm: 26.4, notes: 'Steady spin on the river path.' },
      { weekday: 5, sport: 'running', minutes: 80, rpe: 7, hour: 9, minute: 0, distanceKm: 14.8, notes: 'Long run with the club.' },
    ],
  },
  {
    key: 'tom',
    displayName: 'Tom Okafor',
    sports: ['football', 'running', 'gym'],
    experienceLevel: 'intermediate',
    weeklyBudgetHours: 6,
    sensitivity: 'balanced',
    weightKg: 84,
    maxHR: 191,
    createdDaysAgo: 210,
    weeks: 10,
    staleWeeks: 0,
    // Tuesday match into a Wednesday run: football/running is level 2, and the
    // match clears the RPE-7 threshold.
    pattern: [
      { weekday: 1, sport: 'football', minutes: 90, rpe: 8, hour: 20, minute: 0, notes: 'League match. Full ninety.' },
      { weekday: 2, sport: 'running', minutes: 35, rpe: 6, hour: 7, minute: 0, distanceKm: 6.2, notes: 'Legs heavy from last night.' },
      { weekday: 4, sport: 'gym', minutes: 50, rpe: 6, hour: 18, minute: 30, notes: 'Full body, nothing heavy.' },
    ],
  },
  {
    key: 'mei',
    displayName: 'Mei Lin',
    sports: ['swimming', 'gym'],
    experienceLevel: 'beginner',
    weeklyBudgetHours: 4,
    sensitivity: 'relaxed',
    weightKg: 57,
    maxHR: 193,
    createdDaysAgo: 150,
    weeks: 9,
    // Stopped a month ago. Somebody has to have, or the median-gap KPI and the
    // downward slope of the weekly-actives line are both fictions.
    staleWeeks: 4,
    pattern: [
      { weekday: 0, sport: 'swimming', minutes: 50, rpe: 6, hour: 6, minute: 0, distanceKm: 1.8, notes: 'Early lanes. 40 x 50m.' },
      { weekday: 3, sport: 'swimming', minutes: 55, rpe: 7, hour: 6, minute: 0, distanceKm: 2.1, notes: 'Technique set then a hard 400.' },
      { weekday: 5, sport: 'gym', minutes: 60, rpe: 6, hour: 11, minute: 0, notes: 'Weekend session, no rush.' },
    ],
  },
  {
    key: 'jonas',
    displayName: 'Jonas Weber',
    sports: ['combat', 'strength'],
    experienceLevel: 'advanced',
    weeklyBudgetHours: 9,
    sensitivity: 'strict',
    weightKg: 79,
    maxHR: 185,
    createdDaysAgo: 95,
    weeks: 8,
    staleWeeks: 0,
    // Combat into strength the next day: level 2, and the class is RPE 8.
    pattern: [
      { weekday: 1, sport: 'combat', minutes: 80, rpe: 8, hour: 19, minute: 30, notes: 'Grappling. Rough rounds.' },
      { weekday: 2, sport: 'strength', minutes: 55, rpe: 6, hour: 18, minute: 0, notes: 'Deadlifts and accessories.' },
      { weekday: 6, sport: 'combat', minutes: 75, rpe: 7, hour: 10, minute: 30, notes: 'Open mat. Lighter than Tuesday.' },
    ],
  },
  {
    key: 'ana',
    displayName: 'Ana Sousa',
    sports: ['cycling', 'running', 'gym'],
    experienceLevel: 'advanced',
    weeklyBudgetHours: 11,
    sensitivity: 'balanced',
    weightKg: 64,
    maxHR: 187,
    createdDaysAgo: 340,
    weeks: 12,
    staleWeeks: 0,
    // Thursday run into a Friday ride: cycling/running is level 2, run is RPE 7.
    pattern: [
      { weekday: 0, sport: 'cycling', minutes: 90, rpe: 6, hour: 17, minute: 30, distanceKm: 34.2, notes: 'Commute plus a loop on the way home.' },
      { weekday: 3, sport: 'running', minutes: 50, rpe: 7, hour: 6, minute: 45, distanceKm: 10.1, notes: 'Threshold reps on the track.' },
      { weekday: 4, sport: 'cycling', minutes: 60, rpe: 5, hour: 7, minute: 0, distanceKm: 22.0, notes: 'Easy spin, legs flat.' },
      { weekday: 6, sport: 'running', minutes: 65, rpe: 6, hour: 8, minute: 0, distanceKm: 12.0, notes: 'Sunday long, felt good.' },
    ],
  },
  {
    key: 'sam',
    displayName: 'Sam Idris',
    sports: ['gym', 'strength', 'running'],
    experienceLevel: 'beginner',
    weeklyBudgetHours: 5,
    sensitivity: 'balanced',
    weightKg: 88,
    maxHR: 194,
    // Inside thirty days, so the "new signups" KPI is not a zero.
    createdDaysAgo: 26,
    weeks: 3,
    staleWeeks: 0,
    // Gym into strength: level 3, the highest pair in the default matrix.
    pattern: [
      { weekday: 0, sport: 'gym', minutes: 45, rpe: 7, hour: 12, minute: 30, notes: 'Lunchtime session. Pushed the squat.' },
      { weekday: 1, sport: 'strength', minutes: 50, rpe: 6, hour: 12, minute: 30, notes: 'Same muscles, second day running. Felt it.' },
      { weekday: 3, sport: 'running', minutes: 40, rpe: 6, hour: 19, minute: 0, distanceKm: 6.4, notes: 'First 5k without stopping.' },
    ],
  },
  {
    key: 'leah',
    displayName: 'Leah Brennan',
    sports: ['running', 'swimming'],
    experienceLevel: 'beginner',
    weeklyBudgetHours: 4,
    sensitivity: 'balanced',
    createdDaysAgo: 20,
    weeks: 2,
    staleWeeks: 0,
    weightKg: 66,
    maxHR: 196,
    pattern: [
      { weekday: 2, sport: 'running', minutes: 45, rpe: 6, hour: 6, minute: 15, distanceKm: 7.0, notes: 'Getting back into it.' },
      { weekday: 5, sport: 'swimming', minutes: 45, rpe: 5, hour: 7, minute: 30, distanceKm: 1.4, notes: 'Easy lengths.' },
      { weekday: 6, sport: 'running', minutes: 55, rpe: 7, hour: 16, minute: 0, distanceKm: 9.2, notes: 'Longest run so far.' },
    ],
  },
]

/** How many accounts are available. The script may seed fewer. */
export const MAX_DEMO_USERS = ARCHETYPES.length

export interface DemoUserSeed {
  key: string
  email: string
  displayName: string
  /** Profile, less the uid — which is only known once the account exists. */
  buildProfile: (uid: string) => User
  buildSessions: (uid: string) => Session[]
}

/**
 * Derive the supporting accounts' email addresses from the main demo address.
 *
 * Plus-addressing, so seven accounts need one real mailbox: every major provider
 * routes `you+demo-priya@example.com` to `you@example.com`, while Firebase Auth
 * treats each as a distinct identity. Any existing `+suffix` on the base address
 * is stripped first, or reseeding from an already-plus-addressed address would
 * compound into `you+a+b@…` and stop resolving.
 */
export function demoUserEmail(baseEmail: string, key: string): string {
  const [local, domain] = baseEmail.trim().toLowerCase().split('@')
  if (!domain) throw new Error(`Not an email address: ${baseEmail}`)
  return `${local.split('+')[0]}+demo-${key}@${domain}`
}

/**
 * Small deterministic wobble, in [-1, 1].
 *
 * Enough to stop twelve identical weeks looking like twelve copies of one week,
 * small enough that the archetype stays recognisable. Deterministic so a reseed
 * reproduces the same userbase and the Admin figures do not move between two
 * runs of the same script.
 */
function jitter(seed: number): number {
  const x = Math.sin(seed * 12.9898) * 43_758.5453
  return (x - Math.floor(x)) * 2 - 1
}

export function buildDemoUserbase(baseEmail: string, count: number, now: Date): DemoUserSeed[] {
  return ARCHETYPES.slice(0, Math.max(1, Math.min(count, ARCHETYPES.length))).map(
    (archetype, index) => ({
      key: archetype.key,
      email: demoUserEmail(baseEmail, archetype.key),
      displayName: archetype.displayName,
      buildProfile: (uid: string) => buildProfile(archetype, uid, baseEmail, now),
      buildSessions: (uid: string) => buildSessions(archetype, uid, index, now),
    }),
  )
}

function buildProfile(archetype: Archetype, uid: string, baseEmail: string, now: Date): User {
  const created = new Date(now.getTime() - archetype.createdDaysAgo * 86_400_000)
  return {
    uid,
    displayName: archetype.displayName,
    email: demoUserEmail(baseEmail, archetype.key),
    createdAt: created.toISOString(),
    sports: archetype.sports,
    weeklyBudgetHours: archetype.weeklyBudgetHours,
    experienceLevel: archetype.experienceLevel,
    conflictSensitivity: archetype.sensitivity,
    sportInteractions: { ...DEFAULT_SPORT_INTERACTIONS },
    onboardingCompleted: true,
    baselineCTL: calculateBaselineCTL(archetype.weeklyBudgetHours, archetype.experienceLevel),
    baselineWeeklyLoad: calculateBaselineWeeklyLoad(
      archetype.weeklyBudgetHours,
      archetype.experienceLevel,
    ),
    weightKg: archetype.weightKg,
    weightUnit: 'kg',
    maxHR: archetype.maxHR,
    firstSessionCelebrated: true,
    notificationPreferences: { ...DISABLED_NOTIFICATION_PREFERENCES },
    // Written here rather than left to the heartbeat: the admin user list renders
    // a missing value as "never", and seven accounts that have all apparently
    // never opened the app is not the impression a populated userbase is for.
    // The heartbeat will overwrite it the moment anybody actually signs in.
    lastActiveAt: lastActiveFor(archetype, now).toISOString(),
  }
}

/** When this athlete last opened the app — shortly after their last session. */
function lastActiveFor(archetype: Archetype, now: Date): Date {
  const lastWeekStart = addDays(startOfWeek(now), -archetype.staleWeeks * 7)
  const lastDay = Math.max(...archetype.pattern.map((p) => p.weekday))
  const at = addDays(lastWeekStart, lastDay)
  at.setHours(21, 0, 0, 0)
  return at.getTime() > now.getTime() ? new Date(now.getTime() - 3_600_000) : at
}

function buildSessions(
  archetype: Archetype,
  uid: string,
  archetypeIndex: number,
  now: Date,
): Session[] {
  const thisWeekStart = startOfWeek(now)
  // History can never predate the account. An account created three weeks ago
  // with eleven weeks of sessions is the sort of detail that survives a demo and
  // then gets asked about in the viva.
  const maxWeeks = Math.max(1, Math.floor(archetype.createdDaysAgo / 7))
  const weeks = Math.min(archetype.weeks, maxWeeks)

  const sessions: Session[] = []

  for (let w = 0; w < weeks; w++) {
    // `staleWeeks` shifts the whole block back, leaving a run of empty weeks
    // between the last session and today.
    const weeksAgo = archetype.staleWeeks + (weeks - 1 - w)
    const weekStart = addDays(thisWeekStart, -weeksAgo * 7)

    archetype.pattern.forEach((day, i) => {
      const seed = archetypeIndex * 1000 + w * 10 + i
      const when = addDays(weekStart, day.weekday)
      when.setHours(day.hour, Math.round(day.minute + jitter(seed) * 12), 0, 0)
      if (when.getTime() > now.getTime()) return
      if (when.getTime() < now.getTime() - archetype.createdDaysAgo * 86_400_000) return

      // Duration moves by up to ±12%, RPE by at most one point. Both are clamped
      // to the ranges the rest of the app assumes: a zero-minute session throws
      // in `calculateLoadScore`, and an RPE outside 1-10 throws too.
      const minutes = Math.max(15, Math.round(day.minutes * (1 + jitter(seed + 1) * 0.12)))
      const rpe = Math.max(1, Math.min(10, day.rpe + Math.round(jitter(seed + 2) * 0.9)))
      const distanceKm =
        day.distanceKm != null
          ? Math.round(day.distanceKm * (minutes / day.minutes) * 10) / 10
          : undefined

      const hr = estimateHRZone(rpe, archetype.maxHR)
      sessions.push({
        id: `demo-${archetype.key}-w${String(w).padStart(2, '0')}-${i}`,
        userId: uid,
        sport: day.sport,
        date: when.toISOString(),
        durationMinutes: minutes,
        distanceKm,
        rpe,
        loadScore: minutes * rpe,
        notes: day.notes,
        createdAt: new Date(when.getTime() + 9 * 60_000).toISOString(),
        estimatedCalories: estimateCalories(day.sport, minutes, rpe, archetype.weightKg),
        estimatedHRZone: { zone: hr.zone, name: hr.name, hrRange: hr.hrRange },
        pace: distanceKm ? calculatePace(day.sport, minutes, distanceKm) : null,
        trackingMode: 'quick',
      })
    })
  }

  return sessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
}
