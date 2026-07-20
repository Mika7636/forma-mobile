// Firestore user-profile CRUD. Profiles live at /users/{uid} and back the
// FORMA training model (sports, budget, experience, conflict matrix). Ported &
// adapted from the web app for React Native (same Firestore project, forma-sp1).
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
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

/**
 * Creates the initial profile document for a freshly-registered user. Seeds the
 * training defaults (empty sports, 10h budget, beginner, balanced sensitivity,
 * 70kg, the default conflict matrix) with onboarding not yet completed.
 */
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

  // `serverTimestamp()` mirrors the web app's createdAt; we keep the ISO string
  // on the typed `createdAt` above for client use and stash the server value
  // under a separate field so the model stays a plain `User`.
  await setDoc(userDoc(uid), {
    ...profile,
    createdAtServer: serverTimestamp(),
  })
}

/** Reads a user profile; returns null if the document doesn't exist yet. */
export async function getUserProfile(uid: string): Promise<User | null> {
  const snapshot = await getDoc(userDoc(uid))
  if (!snapshot.exists()) return null
  return snapshot.data() as User
}

/**
 * Patches a profile with a partial update. Uses `setDoc(..., { merge: true })`
 * rather than `updateDoc` so it creates-or-merges: `updateDoc` REJECTS with
 * "No document to update" when /users/{uid} doesn't exist yet, which silently
 * broke onboarding's Finish when the profile doc was missing (e.g. the emulator
 * WebChannel error that drops us to onboarding with a null profile). A merge
 * write is safe whether or not the doc already exists.
 */
export async function updateUserProfile(
  uid: string,
  updates: Partial<User>,
): Promise<void> {
  await setDoc(userDoc(uid), updates, { merge: true })
}

/** Delete the user's profile document (used by full account deletion). */
export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(userDoc(uid))
}

export { DEFAULT_BUDGET_HOURS }
