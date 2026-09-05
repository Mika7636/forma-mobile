// Firestore CRUD for planned sessions — the Planner's forward half.
//
// Kept apart from `sessionService` on purpose. That module's job is the *log*:
// it derives training estimates, writes a session, and runs the conflict engine
// against real history. A plan has no estimates to derive and nothing to persist
// downstream of it — its conflicts are computed on the fly (see
// `detectPlannedConflicts`) — so the two share nothing but the collection root.
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  updateDoc,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import type { PlannedSession, PlannedSessionInput } from '../types/planned'
import type { SportType } from '../types/session'

function plannedCol(userId: string) {
  return collection(db, 'users', userId, 'plannedSessions')
}

/**
 * Normalise a Firestore doc into the in-memory model.
 *
 * `date` is stored as a `YYYY-MM-DD` string by design (see {@link PlannedSession}),
 * but this still guards the shape: a doc written by hand, or by a future client
 * that stamps a Timestamp, must not turn every calendar lookup into `undefined`.
 */
export function toPlannedSession(id: string, data: DocumentData): PlannedSession {
  const rawDate: unknown = data.date
  const date =
    typeof rawDate === 'string'
      ? rawDate.slice(0, 10)
      : rawDate && typeof (rawDate as { toDate?: () => Date }).toDate === 'function'
        ? (rawDate as { toDate: () => Date }).toDate().toISOString().slice(0, 10)
        : ''

  return {
    id,
    userId: data.userId,
    sport: data.sport as SportType,
    date,
    durationMinutes: Number(data.durationMinutes) || 0,
    intensity: Number(data.intensity) || 0,
    createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
  }
}

/** Add a plan to the calendar. Returns it with its Firestore id attached. */
export async function addPlannedSession(
  userId: string,
  input: PlannedSessionInput,
): Promise<PlannedSession> {
  const docData: DocumentData = {
    userId,
    sport: input.sport,
    date: input.date,
    durationMinutes: input.durationMinutes,
    intensity: input.intensity,
    createdAt: new Date().toISOString(),
  }
  const ref = await addDoc(plannedCol(userId), docData)
  return { id: ref.id, ...docData } as PlannedSession
}

/** The fields a plan can be edited to. Identity and ownership are not among them. */
export type PlannedSessionChanges = Partial<
  Pick<PlannedSession, 'sport' | 'date' | 'durationMinutes' | 'intensity'>
>

/**
 * Change an existing plan in place.
 *
 * Added for the conflict resolutions, which move a plan to another day or swap
 * its sport. Both could have been done as delete-then-add, and deliberately are
 * not: that pair is two writes with a window between them where the plan does
 * not exist, and the live listener would render the gap as the session
 * vanishing and reappearing somewhere else. It also mints a new document id,
 * which quietly breaks anything holding the old one — including the very
 * conflict card the athlete is looking at when they tap.
 *
 * A partial update, so a reschedule touches only `date` and a substitution only
 * the sport and its shape. `userId` and `createdAt` are not in
 * {@link PlannedSessionChanges} and cannot be moved through here.
 */
export async function updatePlannedSession(
  userId: string,
  plannedId: string,
  changes: PlannedSessionChanges,
): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'plannedSessions', plannedId), changes)
}

/** Remove a plan. Nothing else references it, so there is no cascade. */
export async function deletePlannedSession(userId: string, plannedId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'plannedSessions', plannedId))
}
