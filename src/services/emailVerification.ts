// Email verification: the two Firebase Auth calls behind the banner, wrapped so
// that neither the store nor a screen ever has to look at a raw error.
//
// ## What this is, and firmly is not
//
// Account hygiene. A verified address is what makes a password reset reach the
// athlete rather than whoever typed the address wrong, and that is the whole of
// the benefit. **Nothing in FORMA is gated on it** — a new user can log a
// session, read their dashboard and use every screen while the confirmation
// email is still in a queue somewhere. That is not an oversight to be tightened
// up later: the app is demonstrated by handing a stranger a phone at a pitch
// day, and an app that blocks its own first-run flow on an inbox nobody is
// holding is an app that cannot be demonstrated at all.
//
// So everything here is best-effort by construction. Both calls resolve rather
// than reject, and a failure leaves the user exactly where they were.
import { reload, sendEmailVerification, type User as FirebaseUser } from 'firebase/auth'

/**
 * How long the UI refuses to send again.
 *
 * Firebase enforces its own, much coarser, server-side quota and answers a
 * breach with `auth/too-many-requests` — a state that lasts *minutes* and that
 * the user can do nothing about. This countdown exists so an impatient athlete
 * tapping "Resend link" four times in a row is stopped by a visible timer they
 * understand rather than by an opaque server refusal they don't.
 */
export const RESEND_COOLDOWN_MS = 60_000

/**
 * What a resend attempt did.
 *
 * `already-verified` is a success, not an edge case: the reload that precedes
 * every send exists precisely to find it. Somebody who clicked the link in
 * their inbox and then came back to the app and tapped the button should be
 * told they are done, not sent a second email confirming what is already true.
 */
export type ResendOutcome =
  | { status: 'sent' }
  | { status: 'already-verified' }
  | { status: 'cooldown'; secondsRemaining: number }
  | { status: 'failed'; message: string }

/**
 * Messages for the failure modes worth naming, keyed by Firebase's code.
 *
 * Deliberately not `friendlyAuthError` from `utils/authErrors`: that map is
 * written for the login form, where "Too many attempts. Please try again later."
 * is exactly right because the user has been getting a password wrong. Here
 * nobody has attempted anything — they pressed one button — and the honest
 * message is about the mail quota, with a timescale attached.
 */
const SEND_ERROR_MESSAGES: Record<string, string> = {
  'auth/too-many-requests': 'Try again in a few minutes.',
  'auth/network-request-failed': 'Check your connection and try again.',
}

const GENERIC_SEND_ERROR = 'Something went wrong. Please try again.'

function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code
    return typeof code === 'string' ? code : undefined
  }
  return undefined
}

/** A sentence to put under "Couldn't send the email", never a Firebase code. */
export function friendlySendError(error: unknown): string {
  const code = errorCode(error)
  return (code && SEND_ERROR_MESSAGES[code]) ?? GENERIC_SEND_ERROR
}

/**
 * Re-read the account from Firebase and report whether it is verified now.
 *
 * `reload()` mutates the `User` object in place rather than returning a new one,
 * which is the single most important fact about this call: a store holding that
 * same object sees `emailVerified` flip with no reference change and therefore
 * no re-render. Callers must take the boolean this returns and put it in state
 * themselves — reading `auth.currentUser.emailVerified` from a component is a
 * value that silently never updates.
 *
 * Never rejects. A failed reload is an unanswered question, not a "no": the last
 * known flag stands and the next foreground asks again. The failure that matters
 * is the offline one, and telling a user on a train that their verified account
 * is unverified would be worse than telling them nothing.
 */
export async function refreshVerified(user: FirebaseUser): Promise<boolean> {
  try {
    await reload(user)
  } catch (error) {
    console.warn('[FORMA] could not refresh email verification state', error)
  }
  return user.emailVerified
}

/**
 * Send the verification email.
 *
 * Reloads first, unconditionally, so the "you already did this" case is caught
 * before an email goes out rather than after. Resolves with a `failed` outcome
 * instead of throwing, because every caller is a button on a screen that must
 * still be there afterwards.
 */
export async function sendVerification(user: FirebaseUser): Promise<ResendOutcome> {
  if (await refreshVerified(user)) return { status: 'already-verified' }

  try {
    // No `actionCodeSettings`: the link should open Firebase's hosted handler in
    // a browser, which completes the verification on its own. Pointing it back
    // at the app would need a deep link, a route to receive the `oobCode` and a
    // call to `applyActionCode` — real work for no gain, since the app already
    // notices the change on its next foreground.
    await sendEmailVerification(user)
    return { status: 'sent' }
  } catch (error) {
    return { status: 'failed', message: friendlySendError(error) }
  }
}

/** Whole seconds left on the cooldown; 0 when a send is allowed. */
export function cooldownRemaining(sentAt: number | null, now: number = Date.now()): number {
  if (sentAt == null) return 0
  const remaining = RESEND_COOLDOWN_MS - (now - sentAt)
  // A negative clock delta (the device's time moved backwards, or the app was
  // suspended across a timezone-less system clock change) must read as "ready",
  // not as a cooldown that outlives the app.
  if (remaining <= 0 || remaining > RESEND_COOLDOWN_MS) return 0
  return Math.ceil(remaining / 1000)
}
