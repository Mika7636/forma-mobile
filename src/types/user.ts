// The user-profile document shape.

import type { NotificationPreferences } from './notifications'
import type { SportType } from './session'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'

export type ConflictSensitivity = 'relaxed' | 'balanced' | 'strict'

export type SportInteractions = Record<string, number>

export interface User {
  uid: string
  displayName: string
  email: string
  createdAt: string
  sports: SportType[]
  weeklyBudgetHours: number
  experienceLevel: ExperienceLevel
  sportInteractions: SportInteractions
  onboardingCompleted: boolean
  baselineWeeklyLoad?: number
  baselineCTL?: number
  conflictSensitivity?: ConflictSensitivity
  weightKg?: number
  weightUnit?: WeightUnit
  maxHR?: number
  firstSessionCelebrated?: boolean
  isAdmin?: boolean
  lastActiveAt?: string
  notificationPreferences?: NotificationPreferences
}

export type WeightUnit = 'kg' | 'lb'
