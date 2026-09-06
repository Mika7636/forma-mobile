// Demo mode: what it is, how the app knows it is in it, and what it forbids.
//
// ## What demo mode is for
//
// A handset on a table at a pitch day, passed to strangers who are invited to
// use the app properly — log a session, edit one, look around. The account they
// land in is pre-seeded with twelve weeks of a deliberate training story (see
// `services/demoStory`), and that story is the demo: it is what makes the Form
// Score real, the charts non-empty and the conflict banner meaningful.
//
// So demo mode has exactly one job beyond signing in: **protect the story from
// the tester while letting the tester use the app.**
//
// ## Which is why the line is drawn where it is
//
// Logging and editing sessions is allowed, deliberately. It is the thing testers
// most want to try, it is what the app is *for*, and one extra session on top of
// fifty-nine moves nothing that matters — the Form Score shifts by a point or
// two and everything else is unchanged. "Reset demo data" in Settings puts even
// that back between testers.
//
// Settings changes are blocked, and the reason is that they are not additive.
// Deselecting a sport, dragging the weekly budget, or changing the interaction
// matrix does not add to the story, it *reinterprets* the whole of it: the
// sustainable band is derived from the budget, the conflict engine reads the
// matrix, and the sport list decides what the recommender is even allowed to
// suggest. A single slider drag can take the account from a rich Progress screen
// to an empty one, and the next tester would never know why.
//
// Appearance is the exception and is left alone: the theme lives in
// AsyncStorage on the handset, not on the profile, so it cannot touch the story
// — and letting somebody flip the app to dark mode is a good thing to be able to
// show off.
//
// ## Identity is derived, never stored
//
// Whether this session is a demo is decided by comparing the signed-in email
// against the configured one, not by a flag set when the button was tapped.
// Firebase Auth persists sessions across restarts (see `config/firebase`), so a
// flag would be lost the first time somebody force-closed the app — and the
// handset would come back up signed into the demo account with the badge gone
// and Settings unlocked, which is precisely the state this exists to prevent.
import Constants from 'expo-constants'

interface DemoAccount {
  email: string
  password: string
}

/**
 * The credentials, injected at build time by `app.config.js` from
 * `FORMA_DEMO_EMAIL` / `FORMA_DEMO_PASSWORD`.
 *
 * `undefined` in any build that did not set them, which is the normal case: demo
 * mode is a pitch-day affordance, not a shipping feature, and a build without
 * the variables behaves exactly as it did before this existed.
 */
const configured = Constants.expoConfig?.extra?.demoAccount as DemoAccount | undefined

/** True when this build can offer "Try Demo" at all. */
export const DEMO_AVAILABLE: boolean =
  typeof configured?.email === 'string' &&
  configured.email.length > 0 &&
  typeof configured?.password === 'string' &&
  configured.password.length > 0

export const DEMO_EMAIL: string | null = DEMO_AVAILABLE ? configured!.email : null
export const DEMO_PASSWORD: string | null = DEMO_AVAILABLE ? configured!.password : null

/**
 * Is this email the demo account?
 *
 * Case- and whitespace-insensitive, because the address the tester's session was
 * created with can differ in case from the one baked into the build — Firebase
 * preserves the case it was given at sign-in, and `alex@…` and `Alex@…` are the
 * same account. Getting this wrong in the false direction unlocks Settings on
 * the demo handset.
 */
export function isDemoEmail(email: string | null | undefined): boolean {
  if (!DEMO_EMAIL || !email) return false
  return email.trim().toLowerCase() === DEMO_EMAIL.trim().toLowerCase()
}

/**
 * The message shown when demo mode refuses a Settings change.
 *
 * One sentence, and it explains rather than scolds: a stranger who taps
 * something and is told "not allowed" learns that the app is broken, while one
 * who is told what the restriction protects learns what the app does.
 */
export const DEMO_BLOCKED_TITLE = 'Not available in demo mode'
export const DEMO_BLOCKED_DESCRIPTION =
  'This demo account has twelve weeks of training behind it, and changing these settings would change what every screen shows. Logging and editing sessions still works.'
