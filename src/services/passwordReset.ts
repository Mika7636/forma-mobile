// Password reset: the one Firebase Auth call behind "Forgot password?", wrapped
// so that the screen never has to look at a raw error.
//
// ## What this is, and firmly is not
//
// A one-shot action from a signed-out screen. There is no user object, no
// session and nothing for the auth store to hear about: the email goes out, the
// athlete follows the link in a browser, and Firebase's hosted handler takes the
// new password. The app only finds out on the next ordinary sign-in.
//
// ## What it will not tell you
//
// Whether the address has an account. Every outcome that is not a mistake the
// user can fix reads as "sent", so this form cannot be used to test a list of
// addresses against the userbase. The screen's copy is written to match — it
// says a link is on its way *if* an account exists.
//
// Like `emailVerification`, the call resolves rather than rejects, and a
// failure leaves the user exactly where they were.
import { sendPasswordResetEmail } from 'firebase/auth'
import { auth } from '../config/firebase'
import { isDemoEmail } from '../config/demo'

/**
 * How long the UI refuses to send again.
 *
 * Firebase enforces its own, much coarser, server-side quota and answers a
 * breach with `auth/too-many-requests` — a state that lasts *minutes* and that
 * the user can do nothing about. This countdown exists so an athlete who hasn't
 * seen the email yet and taps "Send again" four times in a row is stopped by a
 * visible timer they understand rather than by an opaque server refusal.
 */
export const RESET_COOLDOWN_MS = 60_000

/**
 * What a reset attempt did.
 *
 * `sent` covers more than a delivered email — see {@link sendPasswordReset} for
 * the cases that report it deliberately. `cooldown` is never produced by the
 * network call itself; it is the screen's own guard, expressed in the same
 * vocabulary so that one switch handles every outcome.
 */
export type ResetOutcome =
  | { status: 'sent' }
  | { status: 'cooldown'; secondsRemaining: number }
  | { status: 'failed'; message: string }

/**
 * Messages for the failure modes worth naming, keyed by Firebase's code.
 *
 * Deliberately not `friendlyAuthError` from `utils/authErrors`: that map is
 * written for the login form and names `auth/user-not-found` outright, which is
 * exactly the fact this form must not give away.
 */
const RESET_ERROR_MESSAGES: Record<string, string> = {
  // The one real failure — a typo the user can see and fix.
  'auth/invalid-email': 'That email address looks invalid.',
  'auth/too-many-requests': 'Try again in a few minutes.',
  'auth/network-request-failed': 'Check your connection and try again.',
}

const GENERIC_RESET_ERROR = 'Something went wrong. Please try again.'

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

/**
 * Send the password-reset email.
 *
 * Never rejects: every caller is a button on a screen that must still be there
 * afterwards.
 *
 * - **The demo account reports `sent` without calling Firebase.** Its password
 *   is compiled into the APK and the account is handed to strangers at a pitch
 *   day; letting one of them reset it would break "Try Demo" for everybody after
 *   them. The response is deliberately identical to a real send, so the screen
 *   has no special case and nothing on it hints that this address is different.
 * - **`auth/user-not-found` reports `sent`.** Confirming which addresses have
 *   accounts would let anyone use this form to enumerate the userbase.
 *   Firebase's own email-enumeration protection does the same server-side on
 *   newer projects, so this also keeps behaviour identical whether or not that
 *   setting is on.
 * - **Everything else is `failed`** with a sentence from
 *   {@link RESET_ERROR_MESSAGES}, or a generic one — never a Firebase code.
 */
export async function sendPasswordReset(email: string): Promise<ResetOutcome> {
  if (isDemoEmail(email)) return { status: 'sent' }

  try {
    // No `actionCodeSettings`: the link opens Firebase's hosted handler in a
    // browser, which collects the new password on its own. Routing it back into
    // the app would need a deep link and a `confirmPasswordReset` screen for no
    // gain — the athlete signs in normally afterwards either way.
    await sendPasswordResetEmail(auth, email.trim())
    return { status: 'sent' }
  } catch (error) {
    const code = errorCode(error)
    if (code === 'auth/user-not-found') return { status: 'sent' }
    return {
      status: 'failed',
      message: (code && RESET_ERROR_MESSAGES[code]) ?? GENERIC_RESET_ERROR,
    }
  }
}

/** Whole seconds left on the cooldown; 0 when a send is allowed. */
export function resetCooldownRemaining(sentAt: number | null, now: number = Date.now()): number {
  if (sentAt == null) return 0
  const remaining = RESET_COOLDOWN_MS - (now - sentAt)
  // A negative clock delta (the device's time moved backwards, or the app was
  // suspended across a timezone-less system clock change) must read as "ready",
  // not as a cooldown that outlives the app.
  if (remaining <= 0 || remaining > RESET_COOLDOWN_MS) return 0
  return Math.ceil(remaining / 1000)
}
