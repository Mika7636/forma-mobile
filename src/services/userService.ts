// Firestore user-profile CRUD. Profiles live at /users/{uid} and back the
// FORMA training model (sports, budget, experience, conflict matrix). Ported &
// adapted from the web app for React Native (same Firestore project, forma-sp1).
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

/**
 * Fields the client never authors. They are stripped from every outgoing
 * profile write.
 *
 * `isAdmin` is the security-relevant one: `firestore.rules` rejects a self-write
 * that changes it, and since almost every profile save in the app is a partial
 * merge of an object the UI got *back* from Firestore, an unstripped write would
 * fail the rule and take an unrelated settings save down with it. Stripping is
 * belt-and-braces, not the enforcement — the rule is.
 *
 * `lastActiveAt` is here for a plainer reason: it is a server timestamp owned by
 * the heartbeat, and a client echoing back the ISO string it happens to be
 * holding would quietly overwrite a fresher server value with a stale one.
 */
const SERVER_OWNED_FIELDS = ['isAdmin', 'lastActiveAt'] as const

/**
 * Normalise a Firestore user document into the in-memory {@link User} model.
 *
 * The counterpart of `toSession`, and it exists for the same two reasons.
 * Firestore stores `lastActiveAt` as a Timestamp while the app — and the
 * AsyncStorage profile mirror, which is plain JSON — works in ISO strings, so an
 * unconverted value would reach the mirror as `{seconds, nanoseconds}` and come
 * back as an unparseable date. And `isAdmin` is absent on every account created
 * before it existed, so it is defaulted here, once, rather than at each of the
 * places that ask.
 */
export function toUser(data: DocumentData): User {
  const toISO = (value: unknown): string | undefined => {
    if (value && typeof (value as Timestamp).toDate === 'function') {
      return (value as Timestamp).toDate().toISOString()
    }
    return typeof value === 'string' ? value : undefined
  }

  return {
    ...(data as User),
    // `=== true` rather than a truthy check: this decides whether a tab appears,
    // and a stray "false" string or a 0 should not be able to open it.
    isAdmin: data.isAdmin === true,
    lastActiveAt: toISO(data.lastActiveAt),
  }
}

/** Reads a user profile; returns null if the document doesn't exist yet. */
export async function getUserProfile(uid: string): Promise<User | null> {
  const snapshot = await getDoc(userDoc(uid))
  if (!snapshot.exists()) return null
  return toUser(snapshot.data())
}

/**
 * The outcome of a profile read, with "there is no profile" kept strictly
 * separate from "we could not find out".
 *
 * The onboarding gate turns `missing` into the setup wizard, so `missing` has
 * to mean the *server* said the document does not exist — nothing weaker.
 */
export type ProfileRead =
  | { status: 'found'; profile: User }
  /** Authoritative: the backend confirmed there is no /users/{uid}. */
  | { status: 'missing' }
  /** Offline and the document isn't cached. We know nothing; ask again later. */
  | { status: 'unknown' }

/**
 * Reads /users/{uid} and reports which of the three states above holds.
 *
 * ## The `fromCache` check is the whole point
 *
 * With offline persistence on, `getDoc` never rejects just because the network
 * is down — it resolves out of the local cache and sets
 * `snapshot.metadata.fromCache`. A document that was never cached therefore
 * comes back as a perfectly ordinary "does not exist" snapshot, which is
 * indistinguishable from a genuinely new account unless you look at that flag.
 *
 * Reading a cached miss as `missing` would take an offline user with a
 * cold cache and route them into onboarding — the exact bug this function was
 * written to close, reintroduced by the fix for it. So: a non-existent document
 * is only authoritative when the snapshot came from the server.
 */
export async function readUserProfile(uid: string): Promise<ProfileRead> {
  const snapshot = await getDoc(userDoc(uid))
  if (snapshot.exists()) return { status: 'found', profile: toUser(snapshot.data()) }
  return { status: snapshot.metadata.fromCache ? 'unknown' : 'missing' }
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
  // See SERVER_OWNED_FIELDS: never let a client-held copy of `isAdmin` or
  // `lastActiveAt` ride along on an ordinary profile save.
  const safe: Record<string, unknown> = { ...updates }
  for (const field of SERVER_OWNED_FIELDS) delete safe[field]
  await setDoc(userDoc(uid), safe, { merge: true })
}

/** Delete the user's profile document (used by full account deletion). */
export async function deleteUserProfile(uid: string): Promise<void> {
  await deleteDoc(userDoc(uid))
}

export { DEFAULT_BUDGET_HOURS }
