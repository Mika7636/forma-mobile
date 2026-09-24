// Firebase app, auth and Firestore singletons for React Native.

import AsyncStorage from '@react-native-async-storage/async-storage'
import { getApp, getApps, initializeApp } from 'firebase/app'
import { getAuth, initializeAuth, type Auth } from 'firebase/auth'
// @ts-ignore
import { getReactNativePersistence } from 'firebase/auth'
import {
  getFirestore,
  initializeFirestore,
  memoryLocalCache,
  persistentLocalCache,
  persistentSingleTabManager,
} from 'firebase/firestore'

const firebaseConfig = {
  apiKey: 'AIzaSyCO-JSS3gdsngWM8QwlXPzkH8oSRt2vTsw',
  authDomain: 'forma-sp1.firebaseapp.com',
  projectId: 'forma-sp1',
  storageBucket: 'forma-sp1.firebasestorage.app',
  messagingSenderId: '711554288092',
  appId: '1:711554288092:web:c24b505c849f3ef4472719',
}

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp()

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

function supportsIndexedDb(): boolean {
  try {
    return typeof globalThis !== 'undefined' && typeof globalThis.indexedDB !== 'undefined'
  } catch {
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
    return getFirestore(app)
  }
}

export const db = resolveDb()
