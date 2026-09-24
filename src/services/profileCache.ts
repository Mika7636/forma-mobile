// A local AsyncStorage mirror of the signed-in user's profile.

import AsyncStorage from '@react-native-async-storage/async-storage'
import type { User } from '../types/user'

const VERSION = 1

const profileKey = (uid: string) => `forma.profileCache.v${VERSION}.${uid}`

const LAST_UID_KEY = `forma.profileCache.v${VERSION}.lastUid`

interface CachedProfile {
  uid: string
  cachedAt: number
  profile: User
}

const memory = new Map<string, User>()

let warmed: Promise<void> | null = null

export function warmProfileCache(): Promise<void> {
  if (warmed) return warmed
  warmed = (async () => {
    try {
      const uid = await AsyncStorage.getItem(LAST_UID_KEY)
      if (uid) await readProfileCache(uid)
    } catch {
    }
  })()
  return warmed
}

export function peekProfileCache(uid: string): User | null {
  return memory.get(uid) ?? null
}

export async function readProfileCache(uid: string): Promise<User | null> {
  const cached = memory.get(uid)
  if (cached) return cached
  try {
    const raw = await AsyncStorage.getItem(profileKey(uid))
    if (!raw) return null
    const parsed = JSON.parse(raw) as CachedProfile
    if (!parsed?.profile || parsed.uid !== uid) return null
    memory.set(uid, parsed.profile)
    return parsed.profile
  } catch {
    return null
  }
}

export async function writeProfileCache(uid: string, profile: User): Promise<void> {
  memory.set(uid, profile)
  const payload: CachedProfile = { uid, cachedAt: Date.now(), profile }
  try {
    await AsyncStorage.multiSet([
      [profileKey(uid), JSON.stringify(payload)],
      [LAST_UID_KEY, uid],
    ])
  } catch {
  }
}

export async function clearProfileCache(uid: string | null): Promise<void> {
  if (uid) memory.delete(uid)
  try {
    await AsyncStorage.multiRemove(uid ? [profileKey(uid), LAST_UID_KEY] : [LAST_UID_KEY])
  } catch {
  }
}
