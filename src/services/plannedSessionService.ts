// Firestore CRUD for planned sessions.

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

export type PlannedSessionChanges = Partial<
  Pick<PlannedSession, 'sport' | 'date' | 'durationMinutes' | 'intensity'>
>

export async function updatePlannedSession(
  userId: string,
  plannedId: string,
  changes: PlannedSessionChanges,
): Promise<void> {
  await updateDoc(doc(db, 'users', userId, 'plannedSessions', plannedId), changes)
}

export async function deletePlannedSession(userId: string, plannedId: string): Promise<void> {
  await deleteDoc(doc(db, 'users', userId, 'plannedSessions', plannedId))
}
