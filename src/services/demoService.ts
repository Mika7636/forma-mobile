// The handset half of demo mode: restoring the seeded account between testers.
//
// This is the same operation `scripts/seed-demo.ts` performs, through the same
// two modules — `demoStory` builds it, `demoWriter` writes it — so the reset
// button cannot produce an account that differs from the seeded one. The only
// thing this file adds is the app's own Firestore instance and a check that the
// caller is actually the demo user.
import { db } from '../config/firebase'
import { isDemoEmail } from '../config/demo'
import { buildDemoProfile, buildDemoStory, verifyDemoStory } from './demoStory'
import { writeDemoStory } from './demoWriter'
import type { User } from '../types/user'

export interface DemoResetResult {
  sessions: number
  conflicts: number
  planned: number
  /** The profile as it was written, for the caller to push into the auth store. */
  profile: User
  /**
   * Conditions the rebuilt story failed, by name. Empty on a healthy reset.
   *
   * Surfaced rather than thrown: the account has already been rewritten by the
   * time this is known, and refusing to report success would leave the operator
   * unsure whether to reset again. A named failure tells them which screen to
   * check before handing the phone over.
   */
  failedChecks: string[]
}

/**
 * Restore the demo account to its seeded state.
 *
 * Re-anchored to *now* on every call, which is the point: the story is defined
 * relative to today ("five weeks ago the athlete overreached"), so a reset on
 * the afternoon of the pitch produces a twelve-week window ending that
 * afternoon rather than replaying whatever window existed when the script was
 * last run. A demo seeded on Monday and reset on Friday is still a demo whose
 * most recent session was yesterday.
 *
 * Rejects for a non-demo account. That guard is not paranoia about the UI — the
 * button is only rendered in demo mode — but about what the function does: it
 * deletes every session, conflict and plan the account has, and a wiring mistake
 * that pointed it at a real athlete would be unrecoverable.
 */
export async function resetDemoData(
  uid: string,
  email: string | null | undefined,
): Promise<DemoResetResult> {
  if (!isDemoEmail(email)) {
    throw new Error('resetDemoData refused: this is not the demo account')
  }

  const now = new Date()
  const profile = buildDemoProfile({ uid, email: email as string })
  const story = buildDemoStory({ uid, profile, now })

  await writeDemoStory(db, uid, profile, story)

  return {
    sessions: story.sessions.length,
    conflicts: story.conflicts.length,
    planned: story.planned.length,
    profile,
    failedChecks: verifyDemoStory(story, profile, now)
      .filter((check) => !check.passed)
      .map((check) => check.name),
  }
}
