// The throttled lastActiveAt heartbeat on the user profile.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'
import { db } from '../config/firebase'

export const HEARTBEAT_INTERVAL_MS = 60 * 60 * 1000

const storageKey = (uid: string) => `forma.lastActive.v1.${uid}`

const memory = new Map<string, number>()

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
    return 0
  }
}

export async function touchLastActive(uid: string): Promise<void> {
  if (!uid || inFlight.has(uid)) return

  const now = Date.now()
  const written = await lastWrittenAt(uid)
  if (now - written < HEARTBEAT_INTERVAL_MS) return

  inFlight.add(uid)
  try {
    await setDoc(doc(db, 'users', uid), { lastActiveAt: serverTimestamp() }, { merge: true })
    memory.set(uid, now)
    await AsyncStorage.setItem(storageKey(uid), String(now)).catch(() => {})
  } catch (err) {
    console.warn('[FORMA] lastActiveAt heartbeat failed', err)
  } finally {
    inFlight.delete(uid)
  }
}

export async function clearLastActiveThrottle(uid: string | null): Promise<void> {
  if (!uid) return
  memory.delete(uid)
  await AsyncStorage.removeItem(storageKey(uid)).catch(() => {})
}
