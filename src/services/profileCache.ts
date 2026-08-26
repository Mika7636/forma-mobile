// A local mirror of the signed-in user's Firestore profile.
//
// ## Why this exists
//
// The onboarding gate in `navigation/RootNavigator` has to answer one question
// before it can render anything: *has this user finished onboarding?* That
// answer lives in `/users/{uid}.onboardingCompleted`, in Firestore — i.e. behind
// a network call that, on a resumed app with no connectivity, does not return.
//
// Firebase Auth restores its session from AsyncStorage synchronously-ish and
// offline, so `user` comes back fine. The profile read is the half that fails,
// and a failed read used to be indistinguishable from "this user has no
// profile" — which is the definition of a new user, which is onboarding. That
// is the whole bug: the app told a two-month-old account it had never seen it
// before, because a `getDoc` timed out.
//
// So we keep our own copy. It is written every time we learn the real profile
// and read back before any network call is attempted, which makes the gate's
// decision instant and offline-proof. Firestore remains the source of truth —
// this is a cache that gets corrected, never a second database.
import AsyncStorage from '@react-native-async-storage/async-storage'
import type { User } from '../types/user'

/** Bumped if the shape below ever changes incompatibly; a mismatch is discarded. */
const VERSION = 1

const profileKey = (uid: string) => `forma.profileCache.v${VERSION}.${uid}`

/**
 * The uid whose profile we cached most recently.
 *
 * Read at startup so we can warm the cache *before* Firebase Auth has told us
 * who is signed in. Auth restoring its own session is itself an async
 * AsyncStorage read, and racing it saves a splash frame or two on the A7.
 */
const LAST_UID_KEY = `forma.profileCache.v${VERSION}.lastUid`

interface CachedProfile {
  uid: string
  /** When this copy was written, so a stale mirror is at least identifiable. */
  cachedAt: number
  profile: User
}

/**
 * In-memory copy of what's on disk, so the gate can be answered synchronously
 * on every render after the first hydration. AsyncStorage is fast but it is
 * still a bridge round-trip, and this is read on the app's hottest path.
 */
const memory = new Map<string, User>()

/** Resolves once the initial `lastUid` read has finished. */
let warmed: Promise<void> | null = null

/**
 * Load the most recently cached profile into memory. Safe to call repeatedly —
 * the work happens once. Call it at module scope from the auth store so the
 * read is already in flight by the time React mounts.
 */
export function warmProfileCache(): Promise<void> {
  if (warmed) return warmed
  warmed = (async () => {
    try {
      const uid = await AsyncStorage.getItem(LAST_UID_KEY)
      if (uid) await readProfileCache(uid)
    } catch {
      // A cache that won't load is a cache miss, not an error. The gate falls
      // back to "unknown" and waits for Firestore, which is the safe direction.
    }
  })()
  return warmed
}

/** The cached profile for `uid` if we've already read it into memory this run. */
export function peekProfileCache(uid: string): User | null {
  return memory.get(uid) ?? null
}

/** Read `uid`'s cached profile from disk, populating the in-memory copy. */
export async function readProfileCache(uid: string): Promise<User | null> {
  const cached = memory.get(uid)
  if (cached) return cached
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedProfile
    // A cache written for someone else is not this user's profile. Belt and
    // braces against a key collision after a sign-out/sign-in on a shared phone.
    if (!parsed?.profile || parsed.uid !== uid) return null
    memory.set(uid, parsed.profile)
    return parsed.profile
  } catch {
    return null
  }
}

/**
 * Mirror a freshly-loaded profile to disk.
 *
 * Called on every successful Firestore read *and* on every local profile edit
 * (onboarding's Finish, the notification-permission choice, Settings), so the
 * mirror never lags the thing it mirrors by more than one write.
 */
export async function writeProfileCache(uid: string, profile: User): Promise<void> {
  memory.set(uid, profile)
  const payload: CachedProfile = { uid, cachedAt: Date.now(), profile }
  try {
    await AsyncStorage.multiSet([
      [profileKey(uid), JSON.stringify(payload)],
      [LAST_UID_KEY, uid],
    ])
  } catch {
    // Out of disk, or AsyncStorage unavailable. The app works without the
    // mirror; it just loses the offline-resume guarantee until the next write.
  }
}

/**
 * Drop a user's mirror. Sign-out and account deletion only.
 *
 * Deliberately NOT called when a profile read fails — a failed read is exactly
 * when the mirror is the only thing standing between the user and a bogus
 * onboarding screen.
 */
export async function clearProfileCache(uid: string | null): Promise<void> {
  if (uid) memory.delete(uid)
  try {
    await AsyncStorage.multiRemove(uid ? [profileKey(uid), LAST_UID_KEY] : [LAST_UID_KEY])
  } catch {
    // Nothing actionable; the next successful write overwrites it anyway.
  }
}
