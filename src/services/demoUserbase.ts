// Supporting demo accounts, so Admin has a userbase to show.

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
  key: string
  displayName: string
  sports: SportType[]
  experienceLevel: ExperienceLevel
  weeklyBudgetHours: number
  sensitivity: ConflictSensitivity
  weightKg: number
  maxHR: number
  createdDaysAgo: number
  weeks: number
  staleWeeks: number
  pattern: PatternDay[]
}

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
    createdDaysAgo: 26,
    weeks: 3,
    staleWeeks: 0,
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

export const MAX_DEMO_USERS = ARCHETYPES.length

export interface DemoUserSeed {
  key: string
  email: string
  displayName: string
  buildProfile: (uid: string) => User
  buildSessions: (uid: string) => Session[]
}

export function demoUserEmail(baseEmail: string, key: string): string {
  const [local, domain] = baseEmail.trim().toLowerCase().split('@')
  if (!domain) throw new Error(`Not an email address: ${baseEmail}`)
  return `${local.split('+')[0]}+demo-${key}@${domain}`
}

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
    lastActiveAt: lastActiveFor(archetype, now).toISOString(),
  }
}

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
  const maxWeeks = Math.max(1, Math.floor(archetype.createdDaysAgo / 7))
  const weeks = Math.min(archetype.weeks, maxWeeks)

  const sessions: Session[] = []

  for (let w = 0; w < weeks; w++) {
    const weeksAgo = archetype.staleWeeks + (weeks - 1 - w)
    const weekStart = addDays(thisWeekStart, -weeksAgo * 7)

    archetype.pattern.forEach((day, i) => {
      const seed = archetypeIndex * 1000 + w * 10 + i
      const when = addDays(weekStart, day.weekday)
      when.setHours(day.hour, Math.round(day.minute + jitter(seed) * 12), 0, 0)
      if (when.getTime() > now.getTime()) return
      if (when.getTime() < now.getTime() - archetype.createdDaysAgo * 86_400_000) return

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
