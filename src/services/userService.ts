// Firestore user-profile CRUD.

import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
  type DocumentData,
} from 'firebase/firestore'
import { db } from '../config/firebase'
import {
  DEFAULT_BUDGET_HOURS,
  DEFAULT_SPORT_INTERACTIONS,
} from '../constants/training'
import type { User } from '../types/user'

const USERS_COLLECTION = 'users'

function userDoc(uid: string) {
  return doc(db, USERS_COLLECTION, uid)
}

export async function createUserProfile(
  uid: string,
  email: string,
  displayName: string,
): Promise<void> {
  const profile: User = {
    uid,
    displayName,
    email,
    createdAt: new Date().toISOString(),
    sports: [],
    weeklyBudgetHours: 10,
    experienceLevel: 'beginner',
    onboardingCompleted: false,
    weightKg: 70,
    weightUnit: 'kg',
    conflictSensitivity: 'balanced',
    sportInteractions: { ...DEFAULT_SPORT_INTERACTIONS },
  }

  await setDoc(userDoc(uid), {
    ...profile,
    createdAtServer: serverTimestamp(),
  })
}

const SERVER_OWNED_FIELDS = ['isAdmin', 'lastActiveAt'] as const

export function toUser(data: DocumentData): User {
  const toISO = (value: unknown): string | undefined => {
    if (value && typeof (value as Timestamp).toDate === 'function') {
      return (value as Timestamp).toDate().toISOString()
    }
    return typeof value === 'string' ? value : undefined
  }

  return {
    ...(data as User),
    isAdmin: data.isAdmin === true,
    lastActiveAt: toISO(data.lastActiveAt),
  }
}

export async function getUserProfile(uid: string): Promise<User | null> {
  const snapshot = await getDoc(userDoc(uid))
  if (!snapshot.exists()) return null
  return toUser(snapshot.data())
}

export type ProfileRead =
  | { status: 'found'; profile: User }
  | { status: 'missing' }
  | { status: 'unknown' }

export async function readUserProfile(uid: string): Promise<ProfileRead> {
  const snapshot = await getDoc(userDoc(uid))
  if (snapshot.exists()) return { status: 'found', profile: toUser(snapshot.data()) }
  return { status: snapshot.metadata.fromCache ? 'unknown' : 'missing' }
}

export async function updateUserProfile(
  uid: string,
  updates: Partial<User>,
): Promise<void> {
  const safe: Record<string, unknown> = { ...updates }
  for (const field of SERVER_OWNED_FIELDS) delete safe[field]
  await setDoc(userDoc(uid), safe, { merge: true })
}

export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(userDoc(uid))
}

export { DEFAULT_BUDGET_HOURS }
