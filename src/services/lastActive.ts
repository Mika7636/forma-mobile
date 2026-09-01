// The `lastActiveAt` heartbeat: a throttled server timestamp on the signed-in
// user's own profile document, so the Admin screen can say when each athlete
// last opened FORMA.
//
// ## Why it is throttled, and why the throttle is on disk
//
// "App came to the foreground" fires far more often than the figure it feeds
// changes: glancing at a notification and swiping away is a foreground event,
// and an athlete mid-workout generates a handful of them a minute. Writing on
// each one would spend a Firestore write, a radio wake and a battery slice to
// move a value nobody reads at that resolution — the admin list shows *days*.
//
// One write an hour is the resolution the UI actually needs. The last-write time
// therefore has to survive a process death, or a user who reopens the app ten
// times an hour after Android has reclaimed it writes ten times: module-scope
// memory resets with the JS context, AsyncStorage does not. The in-memory copy
// is kept anyway so the common case — a foreground event on a warm app — costs
// no storage read at all.
//
// ## What it deliberately does not do
//
// It never surfaces a failure. This is bookkeeping the athlete did not ask for
// and cannot act on; a toast saying "couldn't record that you opened the app"
// would be noise about a problem that fixes itself an hour later. A failed write
// also does not advance the throttle, so the next foreground retries.
import AsyncStorage from '@react-native-async-storage/async-storage'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

/** At most one write per hour, per account. */
export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000

const storageKey = (uid: string) => `forma.lastActive.v1.${uid}`

/** Last write time we know about, keyed by uid. Mirrors what's on disk. */
const memory = new Map<string, number>()

/** Guards a resume and a mount landing in the same tick. */
const inFlight = new Set<string>()

async function lastWrittenAt(uid: string): Promise<number> {
  const cached = memory.get(uid)
  if (cached != null) return cached
  try {
    const raw = await AsyncStorage.getItem(storageKey(uid))
    const parsed = raw ? Number(raw) : 0
    const at = Number.isFinite(parsed) ? parsed : 0
    memory.set(uid, at)
    return at
  } catch {
    // A storage read that fails leaves us no worse than a cold start: we write
    // once and remember it in memory for the rest of the session.
    return 0
  }
}

/**
 * Record that `uid` is using the app right now, unless we already did within
 * {@link HEARTBEAT_INTERVAL_MS}. Never rejects.
 *
 * The value written is `serverTimestamp()`, not the device clock: this is the
 * one field an admin compares *across* accounts, and a handset with a wrong
 * clock would otherwise sort itself to the top of the list forever.
 */
export async function touchLastActive(uid: string): Promise<void> {
  if (!uid || inFlight.has(uid)) return

  const now = Date.now()
  const written = await lastWrittenAt(uid)
  if (now - written < HEARTBEAT_INTERVAL_MS) return

  inFlight.add(uid)
  try {
    // A merge write of exactly one field. It passes the self-write rule in
    // firestore.rules because the merged document leaves `isAdmin` untouched.
    await setDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }, { merge: true })
    memory.set(uid, now)
    await AsyncStorage.setItem(storageKey(uid), String(now)).catch(() => {})
  } catch (err) {
    // Offline, or rules said no. Leave the throttle un-advanced so the next
    // foreground tries again, and stay silent — see the header note.
    console.warn('[FORMA] lastActiveAt heartbeat failed', err)
  } finally {
    inFlight.delete(uid)
  }
}

/** Drops the throttle for an account. Called on sign-out / account deletion. */
export async function clearLastActiveThrottle(uid: string | null): Promise<void> {
  if (!uid) return
  memory.delete(uid)
  await AsyncStorage.removeItem(storageKey(uid)).catch(() => {})
}
