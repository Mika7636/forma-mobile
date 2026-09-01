import type { NotificationPreferences } from './notifications'
import type { SportType } from './session'

export type ExperienceLevel = 'beginner' | 'intermediate' | 'advanced'

export type ConflictSensitivity = 'relaxed' | 'balanced' | 'strict'

/**
 * Pairwise sport-conflict weights, keyed by an underscore-joined sport pair
 * (e.g. "combat_football"). Higher = the two sports interfere more when
 * trained close together. Seeded at registration from a default matrix.
 */
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
  /**
   * Seed "fitness" (CTL) from onboarding, so a new athlete isn't shown a wildly
   * negative Form while the 42-day CTL average is still filling up. Blended out
   * over the first 21 days by {@link calculateCTL}. Set at onboarding.
   */
  baselineCTL?: number
  conflictSensitivity?: ConflictSensitivity
  // Body metrics, used to derive calorie and heart-rate estimates. Optional —
  // users can skip sharing them; algorithms fall back to sensible defaults.
  weightKg?: number
  weightUnit?: WeightUnit
  /** Max heart rate (bpm). Defaults to 190 in estimates when unset. */
  maxHR?: number
  /**
   * True once the one-time "first session" celebration has been shown.
   *
   * Lives on the profile rather than in AsyncStorage so it is the *account's*
   * fact, not the handset's: a reinstall, a new phone, or a second device must
   * not replay a moment that only makes sense once. Absent on every account
   * created before the celebration existed, which is why it is optional and
   * why the Log screen retires it on the next save without showing anything to
   * an athlete who already has history.
   */
  firstSessionCelebrated?: boolean
  /**
   * Server-owned admin flag, mirrored here so the tab bar can decide whether to
   * render the Admin tab.
   *
   * Absent on every ordinary account, which is why it is optional and why every
   * read defaults it to `false` — see `toUser`. It is granted from the Firebase
   * console (or a trusted backend) and **never** from the client:
   * `firestore.rules` rejects any client update that changes it, and
   * `updateUserProfile` strips it from outgoing writes so an accidental
   * round-trip of a whole profile object can't trip that rule.
   *
   * Treat it as a hint about what to *show*, never as an authorisation: a user
   * who forged it locally would still have every admin query denied by the
   * rules, which is the only place this is actually enforced.
   */
  isAdmin?: boolean
  /**
   * When the athlete last opened the app, as an ISO string.
   *
   * Written server-side (`serverTimestamp()`) at most once an hour by the
   * foreground heartbeat in `services/lastActive.ts`. There is no backfill, so
   * it is absent on every account that hasn't opened the app since the feature
   * shipped — the admin list renders those as "never" rather than guessing.
   */
  lastActiveAt?: string
  /**
   * Local-notification settings. `undefined` means we have never asked for
   * permission — RootNavigator uses exactly that to decide whether to show the
   * one-time permission screen, so don't default it at read time.
   */
  notificationPreferences?: NotificationPreferences
}

export type WeightUnit = 'kg' | 'lb'
