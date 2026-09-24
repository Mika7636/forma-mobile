// Writes a built demo story to Firestore.

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

const BATCH_LIMIT = 500

const SESSION_BATCH = 60

type Collection = 'sessions' | 'conflicts' | 'plannedSessions'

function subcollection(db: Firestore, uid: string, name: Collection) {
  return collection(db, 'users', uid, name)
}

async function clearCollection(db: Firestore, uid: string, name: Collection): Promise<number> {
  const snapshot = await getDocs(subcollection(db, uid, name))
  for (let i = 0; i < snapshot.docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    for (const document of snapshot.docs.slice(i, i + BATCH_LIMIT)) batch.delete(document.ref)
    await batch.commit()
  }
  return snapshot.size
}

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
  cleared: { sessions: number; conflicts: number; planned: number }
}

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
