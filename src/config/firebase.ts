import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, initializeAuth, type Auth } from 'firebase/auth'
// `getReactNativePersistence` ships in Firebase's React Native build (Metro
// resolves `firebase/auth` to its RN entry) but is absent from the web type
// definitions, so TypeScript can't see it. It is valid at runtime.
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
} from 'firebase/firestore'

// Same Firebase project as the FORMA web app (project id: forma-sp1) — same
// database, same auth, same everything. Only the auth persistence wiring below
// differs from the web config.
const firebaseConfig = {
  apiKey: 'AIzaSyCO-JSS3gdsngWM8QwlXPzkH8oSRt2vTsw',
  authDomain: 'forma-sp1.firebaseapp.com',
  projectId: 'forma-sp1',
  storageBucket: 'forma-sp1.firebasestorage.app',
  messagingSenderId: '711554288092',
  appId: '1:711554288092:web:c24b505c849f3ef4472719',
}

// Every one of these three initializers throws if called twice for the same app
// (`app/duplicate-app`, `auth/already-initialized`, Firestore's
// `failed-precondition`). On a Fast Refresh this module's top level re-runs
// while the previous Firebase instances are still live, so each must be a
// singleton: reuse the existing instance instead of re-initializing.
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

// React Native adaptation: the web app uses `getAuth(app)`, which on native
// would keep the session only in memory (lost on app restart). We instead use
// `initializeAuth` with AsyncStorage-backed persistence so the user stays
// logged in across restarts. On a reload where auth already exists,
// `initializeAuth` throws — fall back to `getAuth`, which returns the instance
// that already has the persistence wired up.
function resolveAuth(): Auth {
  try {
    return initializeAuth(app, {
      persistence: getReactNativePersistence(AsyncStorage),
    })
  } catch {
    return getAuth(app)
  }
}

export const auth = resolveAuth()

// `initializeFirestore` (not `getFirestore`) so we can tune the transport and
// cache for React Native:
//
//  - experimentalAutoDetectLongPolling: RN's default streaming transport
//    (WebChannel/fetch) intermittently mishandles the Watch existence filter,
//    surfacing recoverable-but-noisy "BloomFilterError" logs and forcing full
//    re-queries whenever a *listened* collection churns — e.g. the conflicts
//    collection having docs deleted and re-added on a session edit. Long
//    polling avoids that path; auto-detect keeps normal streaming where it works.
//
//  - memoryLocalCache: no on-device persistence layer for the SDK to reconcile
//    against the server's existence filter, removing the other BloomFilterError
//    source. FORMA already treats Firestore as the live source of truth (every
//    read is a snapshot listener), so we don't rely on an offline cache.
//
// Like auth above, this throws if Firestore was already initialized on a
// reload; reuse the existing instance in that case.
function resolveDb() {
  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache: memoryLocalCache(),
    })
  } catch {
    return getFirestore(app)
  }
}

export const db = resolveDb()
