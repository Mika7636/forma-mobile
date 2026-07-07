import AsyncStorage from '@react-native-async-storage/async-storage'
import { initializeApp } from 'firebase/app'
import { initializeAuth } from 'firebase/auth'
// `getReactNativePersistence` ships in Firebase's React Native build (Metro
// resolves `firebase/auth` to its RN entry) but is absent from the web type
// definitions, so TypeScript can't see it. It is valid at runtime.
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'

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

export const app = initializeApp(firebaseConfig)

// React Native adaptation: the web app uses `getAuth(app)`, which on native
// would keep the session only in memory (lost on app restart). We instead use
// `initializeAuth` with AsyncStorage-backed persistence so the user stays
// logged in across restarts.
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage),
})

export const db = getFirestore(app)
