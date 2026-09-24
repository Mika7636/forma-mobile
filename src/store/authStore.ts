// Auth store: Firebase Auth plus the Firestore profile.

import {
  createUserWithEmailAndPassword,
  deleteUser,
  onAuthStateChanged,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateAuthProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { AppState, type AppStateStatus } from 'react-native'
import { create } from 'zustand'
import { auth } from '../config/firebase'
import { DEMO_EMAIL, DEMO_PASSWORD, isDemoEmail } from '../config/demo'
import { createUserProfile, deleteUserProfile, readUserProfile } from '../services/userService'
import {
  clearProfileCache,
  peekProfileCache,
  readProfileCache,
  warmProfileCache,
  writeProfileCache,
} from '../services/profileCache'
import { clearLastActiveThrottle } from '../services/lastActive'
import {
  cooldownRemaining,
  refreshVerified,
  sendVerification,
  type ResendOutcome,
} from '../services/emailVerification'
import { cancelAllNotifications } from '../services/notificationService'
import { clearTrainingData } from '../services/sessionService'
import { friendlyAuthError } from '../utils/authErrors'
import type { User } from '../types/user'

void warmProfileCache()

export type ProfileStatus = 'unknown' | 'loading' | 'loaded' | 'missing' | 'error'

interface AuthState {
  user: FirebaseUser | null
  profile: User | null
  profileStatus: ProfileStatus
  authResolved: boolean
  loading: boolean
  error: string | null

  emailVerified: boolean
  verificationDismissed: boolean
  verificationSentAt: number | null
  verificationSending: boolean

  initialize: () => () => void
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signInDemo: () => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  setProfile: (profile: User) => void
  deleteAccount: () => Promise<void>
  clearError: () => void

  refreshEmailVerified: () => Promise<void>
  dismissVerificationBanner: () => void
  resendVerificationEmail: () => Promise<ResendOutcome>
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  profileStatus: 'unknown',
  authResolved: false,
  loading: true,
  error: null,
  emailVerified: false,
  verificationDismissed: false,
  verificationSentAt: null,
  verificationSending: false,

  initialize: () => {
    const unsubscribeAuth = onAuthStateChanged(auth, (firebaseUser) => {
      if (registering) return

      if (!firebaseUser) {
        cancelRetry()
        loadToken += 1
        confirmedFromServer = false
        set({
          user: null,
          profile: null,
          profileStatus: 'unknown',
          authResolved: true,
          loading: false,
          ...clearedVerification(),
        })
        return
      }

      const cached = peekProfileCache(firebaseUser.uid)
      const switchedAccount = get().user?.uid !== firebaseUser.uid
      set({
        user: firebaseUser,
        profile: cached,
        profileStatus: cached ? 'loaded' : 'unknown',
        authResolved: true,
        loading: !cached,
        ...(switchedAccount ? clearedVerification() : null),
        emailVerified: firebaseUser.emailVerified,
      })

      void get().refreshProfile()
      void get().refreshEmailVerified()
    })

    const onAppStateChange = (next: AppStateStatus) => {
      const wasBackgrounded = appState !== 'active'
      appState = next
      if (next !== 'active' || !wasBackgrounded) return

      const { user, profileStatus } = get()
      if (!user) return

      if (!get().emailVerified) void get().refreshEmailVerified()

      if (profileStatus === 'missing') return
      if (profileStatus === 'loaded' && confirmedFromServer) return
      cancelRetry()
      void get().refreshProfile()
    }

    const appStateSub = AppState.addEventListener('change', onAppStateChange)

    return () => {
      cancelRetry()
      appStateSub.remove()
      unsubscribeAuth()
    }
  },

  refreshProfile: async () => {
    const user = auth.currentUser ?? get().user
    if (!user) return
    if (inFlight) return

    const uid = user.uid
    const token = ++loadToken
    inFlight = true

    const stillCurrent = () => token === loadToken && get().user?.uid === uid

    try {
      let cached = peekProfileCache(uid)
      if (!cached) cached = await readProfileCache(uid)
      if (cached && stillCurrent() && get().profileStatus !== 'loaded') {
        set({ profile: cached, profileStatus: 'loaded', loading: false })
      }
      if (!cached && stillCurrent()) {
        set({ profileStatus: 'loading' })
      }

      const result = await readUserProfile(uid)
      if (!stillCurrent()) return

      if (result.status === 'found') {
        cancelRetry()
        confirmedFromServer = true
        set({ profile: result.profile, profileStatus: 'loaded', loading: false })
        void writeProfileCache(uid, result.profile)
        return
      }

      if (result.status === 'missing') {
        cancelRetry()
        void clearProfileCache(uid)
        set({ profile: null, profileStatus: 'missing', loading: false })
        return
      }

      set({
        profileStatus: cached ? 'loaded' : 'error',
        loading: false,
      })
      scheduleRetry()
    } catch (err) {
      if (!stillCurrent()) return
      console.warn('[FORMA] profile read failed; holding position and retrying', err)
      set({
        profileStatus: get().profile ? 'loaded' : 'error',
        loading: false,
      })
      scheduleRetry()
    } finally {
      inFlight = false
    }
  },

  signIn: async (email, password) => {
    set({ error: null })
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
    } catch (error) {
      const message = friendlyAuthError(error)
      set({ error: message })
      throw new Error(message)
    }
  },

  signInDemo: async () => {
    if (!DEMO_EMAIL || !DEMO_PASSWORD) {
      const message = 'Demo mode is not configured in this build.'
      set({ error: message })
      throw new Error(message)
    }
    await get().signIn(DEMO_EMAIL, DEMO_PASSWORD)
  },

  signUp: async (email, password, name) => {
    set({ error: null })
    registering = true
    try {
      const credential = await createUserWithEmailAndPassword(
        auth,
        email.trim(),
        password,
      )
      await updateAuthProfile(credential.user, { displayName: name.trim() })
      await createUserProfile(credential.user.uid, email.trim(), name.trim())

      void sendEmailVerification(credential.user).catch((err) => {
        console.warn('[FORMA] verification email failed to send at sign-up', err)
      })

      await firebaseSignOut(auth)
    } catch (error) {
      const message = friendlyAuthError(error)
      set({ error: message })
      throw new Error(message)
    } finally {
      registering = false
      set({
        user: null,
        profile: null,
        profileStatus: 'unknown',
        authResolved: true,
        loading: false,
        ...clearedVerification(),
      })
    }
  },

  signOut: async () => {
    await cancelAllNotifications().catch(() => {})
    const uid = get().user?.uid ?? null
    cancelRetry()
    loadToken += 1
    await firebaseSignOut(auth)
    await clearProfileCache(uid)
    await clearLastActiveThrottle(uid)
    set({ user: null, profile: null, profileStatus: 'unknown', error: null, ...clearedVerification() })
  },

  setProfile: (profile) => {
    set({ profile, profileStatus: 'loaded', loading: false })
    const uid = get().user?.uid
    if (uid) void writeProfileCache(uid, profile)
  },

  deleteAccount: async () => {
    const current = auth.currentUser
    if (!current) throw new Error('Not signed in')
    await cancelAllNotifications().catch(() => {})
    await clearTrainingData(current.uid)
    await deleteUserProfile(current.uid)
    await deleteUser(current)
    cancelRetry()
    loadToken += 1
    await clearProfileCache(current.uid)
    await clearLastActiveThrottle(current.uid)
    set({ user: null, profile: null, profileStatus: 'unknown', error: null, ...clearedVerification() })
  },

  clearError: () => set({ error: null }),

  refreshEmailVerified: async () => {
    const user = auth.currentUser ?? get().user
    if (!user) return
    if (get().emailVerified) return

    const uid = user.uid
    const verified = await refreshVerified(user)
    if (!verified || useAuthStore.getState().user?.uid !== uid) return
    set({ emailVerified: true })
  },

  dismissVerificationBanner: () => set({ verificationDismissed: true }),

  resendVerificationEmail: async () => {
    const user = auth.currentUser ?? get().user
    if (!user) return { status: 'failed', message: 'You are not signed in.' }

    const { verificationSending, verificationSentAt } = get()
    if (verificationSending) return { status: 'cooldown', secondsRemaining: 1 }

    const remaining = cooldownRemaining(verificationSentAt)
    if (remaining > 0) return { status: 'cooldown', secondsRemaining: remaining }

    const uid = user.uid
    set({ verificationSending: true })
    try {
      const outcome = await sendVerification(user)
      if (useAuthStore.getState().user?.uid !== uid) return outcome

      if (outcome.status === 'already-verified') {
        set({ emailVerified: true })
      } else if (outcome.status === 'sent') {
        set({ verificationSentAt: Date.now() })
      }
      return outcome
    } finally {
      if (useAuthStore.getState().user?.uid === uid) set({ verificationSending: false })
    }
  },
}))

export function useIsDemo(): boolean {
  return useAuthStore((state) => isDemoEmail(state.profile?.email ?? state.user?.email))
}

let registering = false

function clearedVerification() {
  return {
    emailVerified: false,
    verificationDismissed: false,
    verificationSentAt: null,
    verificationSending: false,
  } as const
}

let loadToken = 0

let inFlight = false

let appState: AppStateStatus = AppState.currentState

let confirmedFromServer = false

let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0

function retryDelay(attempt: number): number {
  return Math.min(2000 * 2 ** attempt, 30_000)
}

const MAX_RETRIES_WITH_PROFILE = 5

function scheduleRetry(): void {
  if (retryTimer) return
  const { profile } = useAuthStore.getState()
  if (profile && retryAttempt >= MAX_RETRIES_WITH_PROFILE) return

  const delay = retryDelay(retryAttempt)
  retryAttempt += 1
  retryTimer = setTimeout(() => {
    retryTimer = null
    const { user, profileStatus } = useAuthStore.getState()
    if (!user) return
    if (profileStatus === 'missing') return
    void useAuthStore.getState().refreshProfile()
  }, delay)
}

function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
}
