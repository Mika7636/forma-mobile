// Zustand auth store. Wraps Firebase Auth (email/password) and the Firestore
// user profile that backs FORMA's training model. Adapted from the web app for
// React Native — the Firebase `auth` instance here is AsyncStorage-backed
// (see src/config/firebase.ts), so sessions survive app restarts.
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile as updateAuthProfile,
  type User as FirebaseUser,
} from 'firebase/auth'
import { create } from 'zustand'
import { auth } from '../config/firebase'
import { createUserProfile, getUserProfile } from '../services/userService'
import { friendlyAuthError } from '../utils/authErrors'
import type { User } from '../types/user'

interface AuthState {
  /** The raw Firebase auth user, or null when signed out. */
  user: FirebaseUser | null
  /** The Firestore profile at /users/{uid}, loaded after auth resolves. */
  profile: User | null
  /**
   * True until the very first `onAuthStateChanged` result (and any profile
   * load) has settled. RootNavigator shows a splash while this is true so we
   * never flash the login screen before a persisted session restores.
   */
  loading: boolean
  /** Last auth error, as a friendly message ready to show under the inputs. */
  error: string | null

  /** Attaches the auth-state listener. Returns an unsubscribe fn. */
  initialize: () => () => void
  signIn: (email: string, password: string) => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  /** Replaces the cached profile (e.g. after onboarding writes to Firestore). */
  setProfile: (profile: User) => void
  clearError: () => void
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  profile: null,
  loading: true,
  error: null,

  initialize: () => {
    return onAuthStateChanged(auth, async (firebaseUser) => {
      // While a registration is mid-flight we deliberately ignore auth events:
      // createUserWithEmailAndPassword auto-signs-in, but the Register flow
      // wants the user sent back to Login, so signUp suppresses the gate and
      // signs out itself. Skipping here avoids a flash of the onboarding screen.
      if (registering) return

      if (firebaseUser) {
        // Load the profile before flipping `loading` off so RootNavigator can
        // route straight to Onboarding vs. Dashboard without an intermediate
        // flash.
        try {
          const profile = await getUserProfile(firebaseUser.uid)
          set({ user: firebaseUser, profile, loading: false })
        } catch {
          set({ user: firebaseUser, profile: null, loading: false })
        }
      } else {
        set({ user: null, profile: null, loading: false })
      }
    })
  },

  signIn: async (email, password) => {
    set({ error: null })
    try {
      await signInWithEmailAndPassword(auth, email.trim(), password)
      // The listener sets user + profile; RootNavigator swaps to the app.
    } catch (error) {
      const message = friendlyAuthError(error)
      set({ error: message })
      throw new Error(message)
    }
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
      // Set the Firebase display name and seed the Firestore profile.
      await updateAuthProfile(credential.user, { displayName: name.trim() })
      await createUserProfile(credential.user.uid, email.trim(), name.trim())
      // Per spec: do NOT auto-login. Sign out so the user lands on Login.
      await firebaseSignOut(auth)
    } catch (error) {
      const message = friendlyAuthError(error)
      set({ error: message })
      throw new Error(message)
    } finally {
      registering = false
      // We suppressed the listener throughout, so make sure state reflects the
      // signed-out reality.
      set({ user: null, profile: null })
    }
  },

  signOut: async () => {
    await firebaseSignOut(auth)
    set({ user: null, profile: null, error: null })
  },

  setProfile: (profile) => set({ profile }),

  clearError: () => set({ error: null }),
}))

// Module-scoped guard read by the auth listener. Kept outside the store state
// because it's purely internal plumbing, not something the UI should react to.
let registering = false
