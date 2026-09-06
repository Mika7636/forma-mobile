// Writing a {@link DemoStory} to Firestore.
//
// Separate from `demoStory` (which decides *what* the account contains) and from
// both of its callers, because the two callers run on different platforms with
// different Firestore instances: the seed script initialises its own app in
// Node, while "Reset demo data" uses the handset's `config/firebase` singleton.
// Passing the `Firestore` in is what lets one implementation serve both — and
// what keeps this file free of the React Native import that would stop the seed
// script from loading it.
//
// ## Why it clears before it writes
//
// The reset button exists so the next tester starts from the same place as the
// last one, which means the previous tester's sessions have to be gone, not
// merely outnumbered. Overwriting the seeded documents by id would leave behind
// anything a tester added, and "mostly the seeded story plus a stranger's
// 3-hour RPE-10 swim" is exactly the state the reset is there to prevent — one
// invented session in the current week is enough to move the Form Score, break
// the streak and change the recommended plan.
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  type DocumentData,
  type Firestore,
} from 'firebase/firestore'
import type { Conflict } from '../types/conflict'
import type { PlannedSession } from '../types/planned'
import type { Session } from '../types/session'
import type { User } from '../types/user'
import type { DemoStory } from './demoStory'

/** Firestore's hard ceiling on writes in one batch. */
const BATCH_LIMIT = 500

/**
 * Session documents carry a few hundred GPS fixes each, so a batch is capped
 * well below {@link BATCH_LIMIT} by request size long before it is capped by
 * count. Sixty keeps the largest commit comfortably inside the 10 MiB request
 * limit even when every session in it is a live-tracked long run.
 */
const SESSION_BATCH = 60

type Collection = 'sessions' | 'conflicts' | 'plannedSessions'

function subcollection(db: Firestore, uid: string, name: Collection) {
  return collection(db, 'users', uid, name)
}

/** Delete every document in one of the user's training subcollections. */
async function clearCollection(db: Firestore, uid: string, name: Collection): Promise<number> {
  const snapshot = await getDocs(subcollection(db, uid, name))
  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const document of snapshot.docs.slice(i, i + BATCH_LIMIT)) batch.delete(document.ref)
    await batch.commit()
  }
  return snapshot.size
}

/**
 * Strip `undefined` from a document.
 *
 * Firestore rejects an `undefined` field value outright, and the session model
 * is full of optional fields that are legitimately absent — a gym session has no
 * distance, a quick-logged run has no splits. `logSession` handles this by
 * building its document conditionally, field by field; here the shape comes from
 * a typed object, so the same job is one pass.
 */
function defined<T extends object>(value: T): DocumentData {
  const out: DocumentData = {}
  for (const [key, entry] of Object.entries(value)) {
    if (entry !== undefined) out[key] = entry
  }
  return out
}

export interface DemoWriteResult {
  sessions: number
  conflicts: number
  planned: number
  /** Documents removed before the new ones went in. */
  cleared: { sessions: number; conflicts: number; planned: number }
}

/**
 * Replace the account's training data with the seeded story.
 *
 * The profile is written first and merged rather than replaced: `isAdmin` is
 * server-owned and `firestore.rules` rejects any client write that changes it,
 * so a full overwrite from a client that cannot see the current value would fail
 * the rule and take the whole seed down with it. A merge that never mentions the
 * field compares equal and passes — see `adminFlagUnchanged()` in the rules.
 */
export async function writeDemoStory(
  db: Firestore,
  uid: string,
  profile: User,
  story: DemoStory,
): Promise<DemoWriteResult> {
  await setDoc(doc(db, 'users', uid), defined(profile), { merge: true })

  const cleared = {
    sessions: await clearCollection(db, uid, 'sessions'),
    conflicts: await clearCollection(db, uid, 'conflicts'),
    planned: await clearCollection(db, uid, 'plannedSessions'),
  }

  await writeAll(db, uid, 'sessions', story.sessions, SESSION_BATCH, (s: Session) => s.id)
  await writeAll(
    db,
    uid,
    'conflicts',
    story.conflicts,
    BATCH_LIMIT,
    (c: Conflict) => c.conflictId,
  )
  await writeAll(
    db,
    uid,
    'plannedSessions',
    story.planned,
    BATCH_LIMIT,
    (p: PlannedSession) => p.id,
  )

  return {
    sessions: story.sessions.length,
    conflicts: story.conflicts.length,
    planned: story.planned.length,
    cleared,
  }
}

async function writeAll<T extends object>(
  db: Firestore,
  uid: string,
  name: Collection,
  items: T[],
  chunk: number,
  idOf: (item: T) => string,
): Promise<void> {
  const target = subcollection(db, uid, name)
  for (let i = 0; i < items.length; i += chunk) {
    const batch = writeBatch(db)
    for (const item of items.slice(i, i + chunk)) {
      batch.set(doc(target, idOf(item)), defined(item))
    }
    await batch.commit()
  }
}
