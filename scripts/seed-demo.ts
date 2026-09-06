// Seed the FORMA demo account — and, on request, a supporting userbase for the
// Admin screen.
//
//   npm run seed:demo -- --dry-run     build and verify, write nothing
//   npm run seed:demo                  seed the demo account
//   npm run seed:demo -- --userbase    …and create the 7 supporting accounts
//
// ## Credentials
//
// Read from the environment, never from the repository:
//
//   FORMA_DEMO_EMAIL       the pre-seeded demo account
//   FORMA_DEMO_PASSWORD    its password
//   FORMA_DEMO_NAME        display name (optional, defaults to "Alex Rivera")
//   FORMA_DEMO_LAT/LNG     where the generated GPS routes are drawn (optional)
//   FORMA_DEMO_USERBASE_PASSWORD   password for the supporting accounts
//                                  (optional, defaults to FORMA_DEMO_PASSWORD)
//
// A `.env` in the project root is loaded automatically, which is the same file
// `npx expo` reads — so one set of values configures both the app build and this
// script, and there is no second place to keep them in step. `.gitignore`
// already excludes the whole `.env*` family.
//
// ## Why this uses the client SDK and not firebase-admin
//
// Because it does not need to be privileged, and asking for privilege it does
// not need would mean a service-account key on somebody's laptop. Every document
// this writes lives under `/users/{uid}/…` for a user it has just signed in as,
// which `firestore.rules` already permits to that user. The one thing it
// therefore *cannot* do is grant the admin flag — that is server-owned by
// design, and the rules reject it from any client. See the note printed at the
// end of a `--userbase` run.
//
// ## Why the verification is not a checklist in a README
//
// The conditions the pitch depends on ("past the calibration gate", "the plan is
// 3-4 sessions", "the streak is 3 to 5 weeks") are not properties of the data —
// they are properties of what the app *computes* from the data, through six
// modules with their own windows, thresholds and cold-start blends. The only
// honest way to confirm them is to run those modules, so
// {@link verifyDemoStory} does exactly that, and this script refuses to report
// success when a critical one fails.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { initializeApp } from 'firebase/app'
import {
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
  type Auth,
} from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'
import { buildDemoProfile, buildDemoStory, verifyDemoStory } from '../src/services/demoStory'
import { buildDemoUserbase, MAX_DEMO_USERS } from '../src/services/demoUserbase'
import { writeDemoStory } from '../src/services/demoWriter'
import { DEFAULT_ROUTE_CENTRE } from '../src/services/demoRoute'

/**
 * The same Firebase project the app talks to (forma-sp1).
 *
 * Duplicated from `src/config/firebase.ts` rather than imported, because that
 * module wires AsyncStorage-backed auth persistence and a React Native Firestore
 * cache — importing it here would drag React Native into a Node process. The
 * values are the app's public web config, which is not a secret; the account
 * credentials, which are, come from the environment below.
 */
const firebaseConfig = {
  apiKey: 'AIzaSyCO-JSS3gdsngWM8QwlXPzkH8oSRt2vTsw',
  authDomain: 'forma-sp1.firebaseapp.com',
  projectId: 'forma-sp1',
  storageBucket: 'forma-sp1.firebasestorage.app',
  messagingSenderId: '711554288092',
  appId: '1:711554288092:web:c24b505c849f3ef4472719',
}

/* ------------------------------------------------------------------ */
/* Environment                                                         */
/* ------------------------------------------------------------------ */

/**
 * Load `.env` into `process.env` without taking a dependency on dotenv.
 *
 * Deliberately minimal and deliberately non-overriding: a value already exported
 * in the shell wins, which is what makes `FORMA_DEMO_PASSWORD=… npm run
 * seed:demo` work for anyone who would rather not put the password in a file at
 * all. Handles `KEY=value`, `export KEY=value`, quotes and `#` comments; it is
 * not a general parser and does not need to be.
 */
function loadDotEnv(): void {
  for (const file of ['.env.local', '.env']) {
    let raw: string
    try {
      raw = readFileSync(resolve(process.cwd(), file), 'utf8')
    } catch {
      continue
    }
    for (const line of raw.split(/\r?\n/)) {
      const match = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line)
      if (!match) continue
      let value = match[2].trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      } else {
        value = value.split(' #')[0].trim()
      }
      if (process.env[match[1]] === undefined) process.env[match[1]] = value
    }
  }
}

function required(name: string): string {
  const value = process.env[name]
  if (!value) {
    fail(
      `${name} is not set.\n\n` +
        '  Put it in a .env file in the project root (git-ignored), or export it:\n' +
        `    ${name}=…\n`,
    )
  }
  return value as string
}

/* ------------------------------------------------------------------ */
/* Output                                                              */
/* ------------------------------------------------------------------ */

const TICK = '✓'
const CROSS = '✗'

function heading(text: string): void {
  console.log(`\n${text}\n${'-'.repeat(text.length)}`)
}

function fail(message: string): never {
  console.error(`\n${CROSS} ${message}`)
  process.exit(1)
}

/* ------------------------------------------------------------------ */
/* Main                                                                */
/* ------------------------------------------------------------------ */

interface Args {
  dryRun: boolean
  userbase: boolean
  userCount: number
}

function parseArgs(argv: string[]): Args {
  const countArg = argv.find((a) => a.startsWith('--users='))
  const parsed = countArg ? Number.parseInt(countArg.split('=')[1], 10) : MAX_DEMO_USERS
  if (countArg && (!Number.isFinite(parsed) || parsed < 1)) {
    fail(`--users must be a positive integer (got "${countArg.split('=')[1]}").`)
  }
  return {
    dryRun: argv.includes('--dry-run'),
    // `--userbase` is its own flag precisely so the supporting accounts are
    // created once and not on every reseed between testers: creating them is the
    // only irreversible thing this script does, and re-running it without the
    // flag leaves them exactly as they are.
    userbase: argv.includes('--userbase'),
    userCount: Math.min(parsed, MAX_DEMO_USERS),
  }
}

async function main(): Promise<void> {
  loadDotEnv()
  const args = parseArgs(process.argv.slice(2))

  const email = required('FORMA_DEMO_EMAIL')
  const password = args.dryRun ? '' : required('FORMA_DEMO_PASSWORD')
  const displayName = process.env.FORMA_DEMO_NAME
  const now = new Date()

  const routeCentre = {
    latitude: Number(process.env.FORMA_DEMO_LAT ?? DEFAULT_ROUTE_CENTRE.latitude),
    longitude: Number(process.env.FORMA_DEMO_LNG ?? DEFAULT_ROUTE_CENTRE.longitude),
  }
  if (!Number.isFinite(routeCentre.latitude) || !Number.isFinite(routeCentre.longitude)) {
    fail('FORMA_DEMO_LAT / FORMA_DEMO_LNG must be numbers.')
  }

  console.log(`FORMA demo seed  ${now.toISOString()}`)
  console.log(`  project   forma-sp1`)
  console.log(`  account   ${email}`)
  console.log(`  routes    ${routeCentre.latitude.toFixed(4)}, ${routeCentre.longitude.toFixed(4)}`)
  if (args.dryRun) console.log('  mode      DRY RUN — nothing will be written')

  // ---- Build and verify before signing in ------------------------------
  //
  // Ordered this way on purpose: a story that does not satisfy its own
  // conditions should be caught before anything is deleted, not after. The uid
  // is unknown until sign-in, so the build uses a placeholder and the real one is
  // substituted below — nothing in the verification reads it.
  const placeholderUid = 'demo-uid'
  const draftProfile = buildDemoProfile({ uid: placeholderUid, email, displayName })
  const draftStory = buildDemoStory({
    uid: placeholderUid,
    profile: draftProfile,
    now,
    routeCentre,
  })

  heading('Story verification')
  const checks = verifyDemoStory(draftStory, draftProfile, now)
  for (const check of checks) {
    console.log(`  ${check.passed ? TICK : CROSS} ${check.name}`)
    console.log(`      ${check.detail}`)
  }

  const failed = checks.filter((c) => !c.passed)
  const critical = failed.filter((c) => c.critical)
  if (critical.length > 0) {
    fail(
      `${critical.length} critical condition(s) failed — refusing to seed.\n` +
        '  The demo depends on these; fix src/services/demoStory.ts before the pitch.',
    )
  }
  if (failed.length > 0) {
    console.log(
      `\n  !  ${failed.length} non-critical condition(s) failed. The account will still seed,\n` +
        '     but the screens above will not look the way the demo script assumes.',
    )
  }

  if (args.dryRun) {
    heading('Dry run complete')
    console.log(`  ${draftStory.sessions.length} sessions, ${draftStory.conflicts.length} conflicts, ${draftStory.planned.length} planned sessions were built and discarded.`)
    return
  }

  // ---- Seed the demo account -------------------------------------------
  const app = initializeApp(firebaseConfig)
  const auth = getAuth(app)
  const db = getFirestore(app)

  heading('Demo account')
  const uid = await signIn(auth, email, password)
  console.log(`  signed in as ${uid}`)

  const profile = buildDemoProfile({ uid, email, displayName })
  const story = buildDemoStory({ uid, profile, now, routeCentre })
  const result = await writeDemoStory(db, uid, profile, story)

  console.log(
    `  cleared   ${result.cleared.sessions} sessions, ${result.cleared.conflicts} conflicts, ${result.cleared.planned} planned`,
  )
  console.log(
    `  wrote     ${result.sessions} sessions, ${result.conflicts} conflicts, ${result.planned} planned`,
  )

  // ---- Optionally seed the supporting userbase --------------------------
  if (args.userbase) {
    await seedUserbase(auth, db, email, args.userCount, now)
  }

  await signOut(auth).catch(() => {})

  heading('Done')
  console.log(`  ${TICK} Demo account ready. Tap "Try Demo" on the login screen.`)
  if (!args.userbase) {
    console.log('     Run again with --userbase to populate the Admin screen (once only).')
  }
  console.log(
    '\n  Admin tab: `isAdmin` is server-owned and cannot be set from a client, so\n' +
      '  this script cannot grant it. Set isAdmin: true on the demo account in the\n' +
      '  Firebase console (Firestore → users → <uid>) if the Admin tab is wanted.',
  )
}

/** Sign in, creating the account on first run. */
async function signIn(auth: Auth, email: string, password: string): Promise<string> {
  try {
    const credential = await signInWithEmailAndPassword(auth, email, password)
    return credential.user.uid
  } catch (error) {
    const code = (error as { code?: string }).code
    if (code !== 'auth/user-not-found' && code !== 'auth/invalid-credential') {
      fail(`Could not sign in as ${email}: ${code ?? (error as Error).message}`)
    }
    // `invalid-credential` covers a wrong password as well as a missing account
    // in newer Identity Platform projects, so creation is attempted and its own
    // error is what gets reported if the account did in fact exist.
    try {
      const created = await createUserWithEmailAndPassword(auth, email, password)
      console.log('  created the account (it did not exist yet)')
      return created.user.uid
    } catch (createError) {
      const createCode = (createError as { code?: string }).code
      if (createCode === 'auth/email-already-in-use') {
        fail(`${email} exists but the password in FORMA_DEMO_PASSWORD is wrong.`)
      }
      fail(`Could not create ${email}: ${createCode ?? (createError as Error).message}`)
    }
  }
}

/**
 * Create (or refresh) the supporting accounts.
 *
 * Each is signed into in turn, because the rules only let a user write their own
 * subtree — which is the whole reason this needs no service-account key. Signing
 * in as somebody else is also why the demo account is re-signed-in by the caller
 * afterwards, rather than this being folded into the main flow.
 */
async function seedUserbase(
  auth: Auth,
  db: Firestore,
  baseEmail: string,
  count: number,
  now: Date,
): Promise<void> {
  const password = process.env.FORMA_DEMO_USERBASE_PASSWORD ?? required('FORMA_DEMO_PASSWORD')
  const seeds = buildDemoUserbase(baseEmail, count, now)

  heading(`Supporting userbase (${seeds.length} accounts)`)

  let totalSessions = 0
  for (const seed of seeds) {
    const uid = await signIn(auth, seed.email, password)
    await updateProfile(auth.currentUser!, { displayName: seed.displayName }).catch(() => {})

    const profile = seed.buildProfile(uid)
    const sessions = seed.buildSessions(uid)
    await writeDemoStory(db, uid, profile, { sessions, conflicts: [], planned: [] })

    totalSessions += sessions.length
    console.log(
      `  ${TICK} ${seed.displayName.padEnd(14)} ${String(sessions.length).padStart(3)} sessions  ${seed.email}`,
    )
  }

  console.log(`\n  ${seeds.length} accounts, ${totalSessions} sessions total.`)
  console.log(`  Sign back in as the demo account to continue.`)
  await signInAsDemo(auth, baseEmail)
}

/**
 * Return to the demo account.
 *
 * Only so the process ends holding the identity the operator expects; nothing
 * below depends on it. Failures are swallowed because the seeding has already
 * succeeded by this point and a sign-in wobble here is not worth failing over.
 */
async function signInAsDemo(auth: Auth, email: string): Promise<void> {
  try {
    await signInWithEmailAndPassword(auth, email, required('FORMA_DEMO_PASSWORD'))
  } catch {
    /* ignore — the seeding is already done */
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error('\nUnexpected failure:')
    console.error(error)
    process.exit(1)
  })
