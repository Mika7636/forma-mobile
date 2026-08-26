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
  persistentLocalCache,
  persistentSingleTabManager,
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
//  - persistentLocalCache: reads are served from disk when the network is gone,
//    which is what lets a resumed-while-offline app load the user's profile
//    instead of hanging on a `getDoc` that never returns. This replaces the
//    memory-only cache we used to run: that cache is why reopening FORMA
//    offline dropped the user onto the onboarding wizard, because the profile
//    read had nowhere to come from and the gate read the failure as "new user".
//
//    Single-tab manager, not multi-tab: multi-tab coordination is a browser
//    concern (it leases the cache across tabs via IndexedDB), and there is
//    exactly one "tab" in a React Native app.
//
// ## The caveat, and why `services/profileCache.ts` exists as well
//
// The JS SDK's persistent cache is IndexedDB-backed, and IndexedDB is a browser
// API that React Native does not provide. So on this platform — the platform
// FORMA actually ships on — the persistent cache is *not available*, and asking
// for it anyway gets us nothing.
//
// It is requested conditionally rather than unconditionally on purpose. The SDK
// does degrade to an in-memory cache when it can't open IndexedDB, but that
// puts a load-bearing property of the login flow at the mercy of a fallback path
// inside a dependency: something we neither control nor test, on the exact code
// path where a wrong answer logs an existing athlete out of their account.
// Probing for the API and choosing the cache ourselves makes the outcome
// deterministic and inspectable in the log.
//
// Which means: on React Native, this is memory-cached Firestore, and the
// AsyncStorage mirror in `services/profileCache.ts` is what actually makes the
// onboarding gate survive an offline resume. The persistent branch is here so a
// web build (or a future RN IndexedDB shim) gets real offline reads for free,
// not because it is doing the work today.
function supportsIndexedDb(): boolean {
  try {
    return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined'
  } catch {
    // Touching `indexedDB` throws outright in some sandboxed runtimes.
    return false
  }
}

function resolveDb() {
  const localCache = supportsIndexedDb()
    ? persistentLocalCache({ tabManager: persistentSingleTabManager(undefined) })
    : memoryLocalCache()

  try {
    return initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
      localCache,
    })
  } catch {
    // Firestore was already initialized on a Fast Refresh; reuse it.
    return getFirestore(app)
  }
}

export const db = resolveDb()
