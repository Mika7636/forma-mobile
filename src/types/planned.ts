import type { SportType } from './session'

/**
 * A session the athlete intends to do — the Planner's forward half.
 *
 * ## Why this is not a `Session`
 *
 * A logged {@link Session} is a record of something that happened: it carries a
 * wall-clock timestamp, a measured duration, an RPE the athlete actually felt,
 * and derived estimates (load, calories, HR zone). A plan has none of that. It
 * is an *intention* pinned to a calendar day, with a rough duration and a target
 * intensity, and it must never enter the training-load model — a planned week
 * that shows up in CTL/ATL would let an athlete "get fit" by typing.
 *
 * So the two live in separate collections and separate types, and only one thing
 * crosses between them: {@link detectPlannedConflicts} reads the same sport
 * interaction matrix the logged detector does, so the advice is the same advice.
 */
export interface PlannedSession {
  id: string
  userId: string
  sport: SportType
  /**
   * Local calendar day, `YYYY-MM-DD`.
   *
   * Deliberately a plain day string rather than a Firestore `Timestamp`. A plan
   * is a day, not a moment — "Tuesday" is the whole of the information — and
   * storing it as text sidesteps the trap the logged sessions live with, where
   * `date` is a Timestamp from this app and an ISO string from the web app, so
   * a Firestore range filter silently matches only one of the two shapes.
   */
  date: string
  durationMinutes: number
  /** Target effort on the same 1–10 RPE scale a logged session uses. */
  intensity: number
  createdAt: string
}

/** What the add-a-plan sheet collects; the rest is filled in by the service. */
export interface PlannedSessionInput {
  sport: SportType
  date: string
  durationMinutes: number
  intensity: number
}
