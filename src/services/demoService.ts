// Restores the seeded demo account between testers.

import { db } from '../config/firebase'
import { isDemoEmail } from '../config/demo'
import { buildDemoProfile, buildDemoStory, verifyDemoStory } from './demoStory'
import { writeDemoStory } from './demoWriter'
import type { User } from '../types/user'

export interface DemoResetResult {
  sessions: number
  conflicts: number
  planned: number
  profile: User
  failedChecks: string[]
}

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
