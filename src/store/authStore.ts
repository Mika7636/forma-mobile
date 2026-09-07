// Zustand auth store. Wraps Firebase Auth (email/password) and the Firestore
// user profile that backs FORMA's training model. Adapted from the web app for
// React Native — the Firebase `auth` instance here is AsyncStorage-backed
// (see src/config/firebase.ts), so sessions survive app restarts.
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

// Start the AsyncStorage read for the last known profile the moment this module
// is imported — before React mounts, and in parallel with Firebase Auth
// restoring its own persisted session. On an A7 those two reads overlapping
// rather than queueing is the difference between a splash frame and three.
void warmProfileCache()

/**
 * How the profile read is going. Kept separate from `profile` because the gate
 * in RootNavigator has to tell four different kinds of "no profile object"
 * apart, and collapsing them into `profile === null` is what sent returning
 * users to the onboarding wizard.
 *
 * - `unknown` — no answer yet, and nothing cached. Show a splash.
 * - `loading` — a read is in flight. Show a splash.
 * - `loaded`  — we have a profile (from the mirror or from Firestore).
 * - `missing` — the *backend* confirmed there is no profile. The one and only
 *               state that may route to onboarding.
 * - `error`   — the read failed. Explicitly NOT `missing`: hold position, retry.
 */
export type ProfileStatus = 'unknown' | 'loading' | 'loaded' | 'missing' | 'error'

interface AuthState {
  /** The raw Firebase auth user, or null when signed out. */
  user: FirebaseUser | null
  /** The Firestore profile at /users/{uid}, loaded after auth resolves. */
  profile: User | null
  /** Which of the five profile states we're in. See {@link ProfileStatus}. */
  profileStatus: ProfileStatus
  /**
   * False until the very first `onAuthStateChanged` result. RootNavigator shows
   * a splash while it is false so we never flash the login screen before a
   * persisted session restores.
   */
  authResolved: boolean
  /**
   * True while the app cannot yet decide what to render: auth unresolved, or
   * authed with no profile answer of any kind. Derived from the two fields
   * above and kept in state so consumers don't have to recompute it.
   */
  loading: boolean
  /** Last auth error, as a friendly message ready to show under the inputs. */
  error: string | null

  /**
   * Whether the signed-in address has been confirmed.
   *
   * Mirrored into state rather than read from `auth.currentUser.emailVerified`
   * at the point of use, and that is not a convenience. `reload()` mutates the
   * `User` object in place: the flag flips, the object reference does not, and
   * every component reading it through the store or through `auth.currentUser`
   * re-renders never. A copy here is what actually makes the banner disappear.
   *
   * Nothing in the app is gated on it — see `services/emailVerification`.
   */
  emailVerified: boolean
  /**
   * The Dashboard banner has been dismissed for this run of the app.
   *
   * Deliberately *not* persisted. A dismissal that survived a restart would
   * silently become permanent for the one user who taps × out of reflex on day
   * one, and the address would then stay unverified forever with nothing on
   * screen ever mentioning it again. Session-scoped means the nudge is easy to
   * get rid of now and still there tomorrow. Settings shows the state
   * unconditionally, so there is always a way back to it either way.
   */
  verificationDismissed: boolean
  /** `Date.now()` of the last successful send. Drives the resend countdown. */
  verificationSentAt: number | null
  /** True while a send (or the reload before it) is in flight. */
  verificationSending: boolean

  /**
   * Attaches the auth-state listener *and* the AppState resume hook. Returns a
   * single unsubscribe fn that detaches both.
   */
  initialize: () => () => void
  /**
   * (Re)read the profile for the signed-in user. Safe to call at any time;
   * no-ops when there is no user or a read is already in flight.
   */
  refreshProfile: () => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  /**
   * Sign into the pre-seeded demo account, using the credentials this build was
   * compiled with.
   *
   * A thin wrapper over {@link signIn} and nothing more — deliberately, because
   * the *state* of being in demo mode is not set here. It is derived from the
   * signed-in email by {@link useIsDemo}, so it survives the app being killed
   * and relaunched, which a flag written on this code path would not.
   */
  signInDemo: () => Promise<void>
  signUp: (email: string, password: string, name: string) => Promise<void>
  signOut: () => Promise<void>
  /** Replaces the cached profile (e.g. after onboarding writes to Firestore). */
  setProfile: (profile: User) => void
  /**
   * Permanently delete the account: wipe Firestore training data + profile,
   * then the Firebase Auth user. May reject with `auth/requires-recent-login`,
   * which the caller should surface as "log in again to confirm".
   */
  deleteAccount: () => Promise<void>
  clearError: () => void

  /**
   * Ask Firebase whether the address has been confirmed since we last looked,
   * and publish the answer. Called on every background→active edge, which is
   * what lets somebody click the link in their inbox, swipe back to FORMA and
   * find the banner already gone.
   */
  refreshEmailVerified: () => Promise<void>
  /** Hide the Dashboard banner for the rest of this session. */
  dismissVerificationBanner: () => void
  /**
   * Reload, then send a fresh verification email if it is still needed.
   * Enforces the 60-second cooldown and never rejects — see {@link ResendOutcome}.
   */
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
      // While a registration is mid-flight we deliberately ignore auth events:
      // createUserWithEmailAndPassword auto-signs-in, but the Register flow
      // wants the user sent back to Login, so signUp suppresses the gate and
      // signs out itself. Skipping here avoids a flash of the onboarding screen.
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

      // Auth has resolved even though the profile hasn't. Publishing the user
      // straight away lets every uid-keyed hook start its listener now instead
      // of waiting on a Firestore round-trip.
      //
      // `loading` deliberately stays true: knowing *who* is signed in is not the
      // same as knowing *where to send them*, and the gap between those two is
      // precisely where the app used to flash onboarding at an existing user.
      const cached = peekProfileCache(firebaseUser.uid)
      // A different account arriving must not inherit the previous one's
      // dismissal or its cooldown — both are about a person and an inbox, not
      // about the handset. Re-signing into the *same* account (a token refresh
      // re-emits here) keeps them, so a resend countdown isn't reset by an event
      // the user never caused.
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
      // The cached flag above is whatever Firebase last persisted, which for a
      // restored session can be weeks stale. Ask for the truth straight away:
      // the common case is an account verified on another device since, and the
      // cost of being wrong is a banner shown to somebody who is already done.
      void get().refreshEmailVerified()
    })

    // The resume path — the one the bug report is actually about.
    //
    // A cold start is easy: everything initialises in order. What broke was
    // Android reclaiming FORMA's process in the background and rebuilding it
    // from the recents entry, where the JS restarts but the OS restores state
    // around it, and any profile read that was in flight died with the old
    // process. Firebase Auth does not re-emit for that, so without this hook
    // nothing would ever ask again and the gate would sit on whatever half-
    // resolved state it woke up in.
    const onAppStateChange = (next: AppStateStatus) => {
      const wasBackgrounded = appState !== 'active'
      appState = next
      if (next !== 'active' || !wasBackgrounded) return

      const { user, profileStatus } = get()
      if (!user) return

      // The other half of the resume path, and the one the verification banner
      // depends on: the user leaves FORMA, opens their mail app, taps the link,
      // and comes back. Nothing about that round trip touches this process, so
      // without asking here the banner would sit there — telling somebody who
      // has just verified their email to verify their email — until the app was
      // killed and relaunched.
      //
      // Once verified, an address never becomes unverified, so this stops for
      // good the first time it comes back true. That is what keeps it from
      // being a network call on every glance at the app for the entire life of
      // the account.
      if (!get().emailVerified) void get().refreshEmailVerified()

      // `missing` is settled by the backend and re-reading it on every glance at
      // the app would be pure battery burn. Everything else — including a
      // `loaded` that came from the mirror rather than from Firestore — is a
      // question we still owe the user, and a resume is the moment connectivity
      // is most likely to have come back.
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

    // A result from a previous uid (or from before a sign-out) must never be
    // allowed to land. Every write below goes through this.
    const stillCurrent = () => token === loadToken && get().user?.uid === uid

    try {
      // 1 · The mirror. Answers the gate offline and without a network call, so
      //     a resumed app renders the right screen on its first frame.
      let cached = peekProfileCache(uid)
      if (!cached) cached = await readProfileCache(uid)
      if (cached && stillCurrent() && get().profileStatus !== 'loaded') {
        set({ profile: cached, profileStatus: 'loaded', loading: false })
      }
      if (!cached && stillCurrent()) {
        set({ profileStatus: 'loading' })
      }

      // 2 · Firestore, which is still the source of truth. When it disagrees
      //     with the mirror it wins; when it can't answer, the mirror stands.
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
        // The backend confirmed there is no profile document. This is the only
        // path to onboarding, and it is a genuinely new (or freshly deleted)
        // account — so the stale mirror, if any, is what's wrong here.
        cancelRetry()
        void clearProfileCache(uid)
        set({ profile: null, profileStatus: 'missing', loading: false })
        return
      }

      // 'unknown': offline with nothing cached for this document. Not an error
      // and emphatically not "no profile" — we simply don't know yet.
      set({
        profileStatus: cached ? 'loaded' : 'error',
        loading: false,
      })
      scheduleRetry()
    } catch (err) {
      if (!stillCurrent()) return
      // A failed read is an unanswered question, never an answer. Keep whatever
      // profile we already had, mark the uncertainty, and try again.
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
      // The listener sets user + profile; RootNavigator swaps to the app.
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
      // Set the Firebase display name and seed the Firestore profile.
      await updateAuthProfile(credential.user, { displayName: name.trim() })
      await createUserProfile(credential.user.uid, email.trim(), name.trim())

      // Send the confirmation email — and, emphatically, do not wait to find out
      // whether it worked.
      //
      // Registration has already succeeded by this line: the account exists and
      // the profile is written. A mail send that is slow, rate-limited or simply
      // failing must not turn that into a failed sign-up, because the catch
      // below would show "Something went wrong", the user would try again, and
      // the second attempt would be met with "an account with that email already
      // exists" — locking a real new user out of an account they just created
      // over an email they were never blocked on in the first place.
      //
      // Its own `.catch` rather than the shared one, and no `await`: it runs
      // while the sign-out below proceeds. Firebase resolves it against the
      // credential it was handed, so signing out mid-flight doesn't cancel it.
      // If it never arrives, the banner on the Dashboard offers a resend.
      void sendEmailVerification(credential.user).catch((err) => {
        console.warn('[FORMA] verification email failed to send at sign-up', err)
      })

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
    // Drop every scheduled notification first. They're scheduled on the device,
    // not the account, so a signed-out phone would otherwise keep nagging with
    // the previous user's reminders. They're rebuilt from the saved preferences
    // by useNotificationSync on the next sign-in.
    await cancelAllNotifications().catch(() => {})
    const uid = get().user?.uid ?? null
    cancelRetry()
    loadToken += 1
    await firebaseSignOut(auth)
    // Drop the mirror too. It is keyed by uid so it wouldn't leak across
    // accounts, but leaving a signed-out user's profile on disk is not
    // something to do by accident.
    await clearProfileCache(uid)
    // The lastActiveAt throttle is per-uid bookkeeping with no reason to
    // outlive the session; clearing it also means signing back in records the
    // return straight away rather than up to an hour later.
    await clearLastActiveThrottle(uid)
    set({ user: null, profile: null, profileStatus: 'unknown', error: null, ...clearedVerification() })
  },

  setProfile: (profile) => {
    // Onboarding's Finish, the notification-permission choice and every
    // Settings edit come through here. Mirroring on the same call keeps the
    // offline copy from ever being a step behind the live one — and it is what
    // makes "finish onboarding on a train with no signal, kill the app, reopen"
    // land on the dashboard rather than back at step 1.
    set({ profile, profileStatus: 'loaded', loading: false })
    const uid = get().user?.uid
    if (uid) void writeProfileCache(uid, profile)
  },

  deleteAccount: async () => {
    const current = auth.currentUser
    if (!current) throw new Error('Not signed in')
    // Data first, then the account. If deleteUser needs a recent login it throws
    // here and the caller re-auths; the orphaned-data window is acceptable for a
    // user who is deliberately deleting everything.
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
    // Already true is already settled — an address cannot be un-verified, so
    // there is no answer this call could return that would change anything.
    if (get().emailVerified) return

    const uid = user.uid
    const verified = await refreshVerified(user)
    // A slow reload belonging to an account that has since signed out (or been
    // swapped) must not land, exactly as with the profile read above.
    if (!verified || useAuthStore.getState().user?.uid !== uid) return
    set({ emailVerified: true })
  },

  dismissVerificationBanner: () => set({ verificationDismissed: true }),

  resendVerificationEmail: async () => {
    const user = auth.currentUser ?? get().user
    if (!user) return { status: 'failed', message: 'You are not signed in.' }

    const { verificationSending, verificationSentAt } = get()
    // A second tap while the first send is still in flight is a double-tap, not
    // a request for two emails.
    if (verificationSending) return { status: 'cooldown', secondsRemaining: 1 }

    const remaining = cooldownRemaining(verificationSentAt)
    if (remaining > 0) return { status: 'cooldown', secondsRemaining: remaining }

    const uid = user.uid
    set({ verificationSending: true })
    try {
      const outcome = await sendVerification(user)
      // Signed out mid-send: publish nothing, because `emailVerified` and the
      // cooldown both belong to an account that is no longer on screen.
      if (useAuthStore.getState().user?.uid !== uid) return outcome

      if (outcome.status === 'already-verified') {
        // The reload inside `sendVerification` found it. No email went out, so
        // no cooldown starts — the banner is about to vanish anyway.
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

/**
 * Whether this session is the demo account.
 *
 * Derived from the signed-in identity rather than remembered, so it is correct
 * on a cold start, after a force-close, and after Firebase restores a persisted
 * session — every path by which the demo handset can arrive at the Dashboard
 * without anybody having tapped "Try Demo" in this process. A remembered flag
 * would be false on all of them, and a demo phone with the badge missing and
 * Settings unlocked is exactly the failure this avoids.
 *
 * Reads the Firestore profile's email first and the auth user's second: they are
 * the same address, but the profile is what the rest of the app treats as the
 * account's identity, and it is present before the auth object on a cache-warm
 * start.
 */
export function useIsDemo(): boolean {
  return useAuthStore((state) => isDemoEmail(state.profile?.email ?? state.user?.email))
}

/* ------------------------------------------------------------------ */
/* Module-scoped plumbing                                              */
/*                                                                     */
/* All of this is internal bookkeeping rather than UI state, so it sits */
/* outside the store: putting it in state would re-render every         */
/* subscriber each time a retry timer ticked.                          */
/* ------------------------------------------------------------------ */

/** Set while a registration is mid-flight; makes the auth listener stand down. */
let registering = false

/**
 * The verification fields, back to their signed-out values.
 *
 * Every one of them describes a person and their inbox rather than the handset,
 * so all four have to go together whenever the account does. Leaving the
 * cooldown behind would silently rate-limit the *next* account to sign in on
 * this phone — which on the demo handset is every tester after the first.
 */
function clearedVerification() {
  return {
    emailVerified: false,
    verificationDismissed: false,
    verificationSentAt: null,
    verificationSending: false,
  } as const
}

/**
 * Incremented on every profile load and on every sign-out. A load compares the
 * token it captured against this before writing, so a slow read belonging to a
 * previous session can't overwrite the current one — the classic way a
 * signed-out app briefly shows the previous user's data.
 */
let loadToken = 0

/** Guards against two overlapping reads (resume + auth event in the same tick). */
let inFlight = false

/** Last AppState we saw, so we only act on a real background→active edge. */
let appState: AppStateStatus = AppState.currentState

/**
 * True once Firestore itself has returned a profile this session, as opposed to
 * us rendering one out of the AsyncStorage mirror. Distinguishes "settled" from
 * "good enough to render", which is what decides whether a resume re-reads.
 */
let confirmedFromServer = false

let retryTimer: ReturnType<typeof setTimeout> | null = null
let retryAttempt = 0

/** 2s, 4s, 8s, 16s, then every 30s. Capped so a long offline spell stays cheap. */
function retryDelay(attempt: number): number {
  return Math.min(2000 * 2 ** attempt, 30_000)
}

/**
 * How many times to keep asking when we already have a cached profile on
 * screen. A stale profile is a perfectly good profile — the app is fully usable
 * — so this is only a best-effort refresh and does not deserve an open-ended
 * 30-second poll against a radio that is plainly not connected. With nothing
 * cached we do keep asking, because the alternative is a splash screen forever.
 */
const MAX_RETRIES_WITH_PROFILE = 5

/**
 * Queue another profile read after a failed or inconclusive one.
 *
 * This is the "retry" half of *never route to onboarding on an error*: the gate
 * holds the user where they are, and this is what eventually resolves the
 * uncertainty without them having to restart the app.
 */
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

/** Stop retrying and reset the backoff — a settled answer, or a signed-out app. */
function cancelRetry(): void {
  if (retryTimer) clearTimeout(retryTimer)
  retryTimer = null
  retryAttempt = 0
}
