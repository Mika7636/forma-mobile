// The demo account's training history, as a deliberate story.
//
// ## Why this is a module and not a script
//
// The seed script (`scripts/seed-demo.ts`) runs in Node before the pitch; the
// "Reset demo data" button in Settings runs on the handset between testers.
// Those two have to produce byte-for-byte the same account, or the reset button
// quietly becomes a second, divergent seeder — and the first tester after a
// reset gets a different app from the one that was rehearsed. So the *story*
// lives here, pure and platform-free, and each caller supplies only its own way
// of writing documents.
//
// Nothing in this file imports Firebase's app/auth/firestore instances, React
// Native, or any store. The single Firebase import is `Timestamp`, which is a
// plain value class and runs happily in Node — that is what lets the seed script
// typecheck and execute against exactly the algorithms the phone runs.
//
// ## The story it tells, and why each part of it is there
//
// Twelve weeks of a multi-sport athlete, arranged so that every screen in FORMA
// has something true and interesting to show within two seconds of a stranger
// opening it:
//
//   * **54+ distinct training days**, so the 42-day baseline gate is cleared and
//     the Dashboard hero is a real Form Score rather than a progress meter. This
//     is the load-bearing condition — everything else is decoration if the hero
//     still says "building your baseline".
//   * **Three sports, deliberately lopsided** (~64% running), so Sport Balance
//     has a shape and the over-60% cross-training note fires.
//   * **One overreaching week and one recovery week**, five and four weeks back,
//     so the twelve-week chart carries an `above` bar, a `below` bar and a run
//     of `inside` ones — warn, muted and accent, rather than one flat colour.
//   * **A three-to-four week consistency streak**, because the overreach/recovery
//     pair breaks the run at exactly the right distance behind today.
//   * **Around nine detected conflicts**, the most recent inside the last
//     complete week so it is on the Dashboard banner, spread across the twelve
//     weeks so the conflict strip has markers to draw.
//   * **A recent week light enough** that fatigue sits just under fitness, which
//     keeps the recommender in its `maintain` stance and its plan `on_target`.
//
// ## The arithmetic is load-bearing, so it is written down
//
// The Progress screen classifies all twelve weeks against a single band derived
// from *today's* CTL: `CTL x 0.8 x 7` to `CTL x 1.3 x 7`. CTL is itself the mean
// daily load over the last 42 days, so the weeks and the band that judges them
// are two views of the same numbers, and picking weekly loads is a fixed-point
// problem rather than a free choice.
//
// Solved by construction: the six weeks inside the CTL window carry ~1456,
// ~1595, 2335, 575, 1456 and 1486 AU, which average to a CTL of roughly 204-218
// depending on which weekday the account is opened on. That puts the band at
// roughly [1142, 1975] — comfortably around the ordinary weeks, comfortably
// below the overreach week, comfortably above the recovery week, on every day of
// the week. {@link verifyDemoStory} re-derives all of it from the app's own
// modules rather than trusting this paragraph.
//
// The last two weeks are made identical on purpose. Fatigue (ATL) is a rolling
// seven-day mean, so a seven-day window that straddles two identical weeks sums
// to the same figure whichever day it is read on — which is what keeps the Form
// Score in the -8..+5 band regardless of when the demo is given, instead of
// swinging into "Overreaching" if the pitch happens to fall on a Monday.
import { Timestamp } from 'firebase/firestore'
import { buildDailyLoads, calculateATL, calculateCTL } from '../algorithms/ctlAtl'
import { getFormStatus } from '../algorithms/formScore'
import { detectConflicts } from '../algorithms/conflictDetector'
import { estimateCalories } from '../algorithms/calories'
import { estimateHRZone } from '../algorithms/heartRate'
import { calculatePace } from '../algorithms/pace'
import { computeSplits, computeElevationGain } from '../algorithms/movingTime'
import {
  computeRecoveryStatus,
  computeWeeklyPlan,
  RECOMMENDER_MIN_TRAINING_DAYS,
} from '../algorithms/recommender'
import {
  DEFAULT_SPORT_INTERACTIONS,
  calculateBaselineCTL,
  calculateBaselineWeeklyLoad,
} from '../constants/training'
import { BASELINE_DAYS, countTrainingDays, getBaselineState } from '../utils/calibration'
import { computeProgress } from '../utils/progressMetrics'
import { detectPlannedConflicts } from '../algorithms/conflictDetector'
import { addDays, localISODate, startOfWeek } from '../utils/dates'
import { formatPaceValue } from '../utils/geo'
import { conflictStorageKey, type Conflict } from '../types/conflict'
import { DISABLED_NOTIFICATION_PREFERENCES } from '../types/notifications'
import type { PlannedSession } from '../types/planned'
import type { Session, SessionSplit, SportType } from '../types/session'
import type { User } from '../types/user'
import { DEFAULT_ROUTE_CENTRE, generateRoute, type RouteCentre } from './demoRoute'

/* ------------------------------------------------------------------ */
/* The schedule                                                        */
/* ------------------------------------------------------------------ */

/** One planned entry in a week template. `weekday` is 0 = Monday … 6 = Sunday. */
interface DaySpec {
  weekday: number
  sport: SportType
  minutes: number
  rpe: number
  /** Local start time. Varied across the week so the hour-of-day heatmap fills. */
  hour: number
  minute: number
  distanceKm?: number
  title?: string
  notes: string
  /**
   * Attach a generated GPS trail.
   *
   * Only honoured for the last four weeks — see {@link GPS_FROM_WEEK}. A route
   * is several hundred points, and writing one onto every run in twelve weeks
   * would push a lot of bytes into Firestore to draw maps nobody scrolls back
   * far enough to see.
   */
  gps?: boolean
}

/**
 * The ordinary week: five sessions, five distinct days, ~1456 AU.
 *
 * Three runs and a gym session, with the hard run on Thursday and the long one
 * on Sunday — the shape a club runner who also lifts actually trains, and the
 * shape that keeps running near two thirds of the load without any single
 * session looking invented.
 */
const WEEK_A: DaySpec[] = [
  {
    weekday: 0,
    sport: 'gym',
    minutes: 55,
    rpe: 6,
    hour: 18,
    minute: 30,
    title: 'Lower body + core',
    notes: 'Squats, RDLs, calf raises. Legs felt heavy from Sunday but moved fine.',
  },
  {
    weekday: 1,
    sport: 'running',
    minutes: 40,
    rpe: 5,
    hour: 7,
    minute: 10,
    distanceKm: 6.9,
    title: 'Easy morning run',
    notes: 'Conversational the whole way. Cold start, warmed up after 10 minutes.',
  },
  {
    weekday: 3,
    sport: 'running',
    minutes: 42,
    rpe: 8,
    hour: 6,
    minute: 45,
    distanceKm: 8.8,
    title: 'Tempo intervals',
    notes: '5 x 5 min at threshold, 90s float. Last rep was a grind.',
    gps: true,
  },
  {
    weekday: 5,
    sport: 'running',
    minutes: 35,
    rpe: 4,
    hour: 8,
    minute: 30,
    distanceKm: 6.0,
    title: 'Shakeout',
    notes: 'Deliberately slow. Legs opening up before tomorrow.',
  },
  {
    weekday: 6,
    sport: 'running',
    minutes: 75,
    rpe: 6,
    hour: 9,
    minute: 15,
    distanceKm: 14.1,
    title: 'Sunday long run',
    notes: 'Steady all the way, negative split the last 4 km. Good session.',
    gps: true,
  },
]

/**
 * The same week with the Monday gym session pushed to RPE 7.
 *
 * Used for the two most recent weeks, and it is doing one specific job: at RPE 7
 * the Monday session clears `detectConflicts`' sport-overlap threshold, so
 * Tuesday's run raises a gym/running warning *inside the last complete week*.
 * That is what puts a genuinely recent finding on the Dashboard banner without
 * having to move a combat session into a week where it would distort the sport
 * split. The Sunday run is trimmed to 70 minutes to keep the week's total
 * fractionally under the plain week, which is what holds the Form Score in the
 * pleasant middle of its range rather than letting fatigue drift above fitness.
 */
const WEEK_A_RECENT: DaySpec[] = WEEK_A.map((day) => {
  if (day.weekday === 0) {
    return {
      ...day,
      rpe: 7,
      notes: 'Heavy day — worked up to a top set of 5 on squats. Properly cooked after.',
    }
  }
  if (day.weekday === 3) {
    // RPE 7 rather than 8, and this is the difference between a plan with three
    // sessions in it and one with two. An RPE-8 run leaves a five-day recovery
    // window against every sport on this profile, and with a seven-day horizon
    // that is enough to lock the whole week out — see the note on the
    // combat/running pair below. Longer, so the week's load is unchanged.
    return { ...day, minutes: 48, rpe: 7, distanceKm: 9.9 }
  }
  if (day.weekday === 6) {
    // A genuinely easy long run, and the RPE matters as much as the distance.
    // At RPE 6 this session leaves gym one day short of trainable and combat
    // four, which pushes the recommender's first placement to Thursday and then
    // there is nowhere legal left for a run. At RPE 5 the same distance clears
    // gym immediately and combat in two days, so the week the athlete is
    // offered has all three of their sports available to it.
    return {
      ...day,
      minutes: 85,
      rpe: 5,
      distanceKm: 16.0,
      notes: 'Deliberately easy the whole way. Time on feet, not a workout.',
    }
  }
  return day
})

/**
 * The combat week: same skeleton, with Wednesday's class replacing a run.
 *
 * Wednesday evening into Friday morning is thirty-six hours, which is inside the
 * conflict engine's forty-eight — so an RPE-8 combat session followed by a run
 * raises the level-3 warning that is FORMA's whole pitch. It happens once every
 * three or four weeks rather than weekly, which is what keeps combat near an
 * eighth of the load while still appearing often enough to mark the conflict
 * strip repeatedly.
 */
const WEEK_B: DaySpec[] = [
  {
    weekday: 0,
    sport: 'gym',
    minutes: 50,
    rpe: 6,
    hour: 18,
    minute: 30,
    title: 'Upper body',
    notes: 'Press, rows, pull-ups. Kept it short.',
  },
  {
    weekday: 1,
    sport: 'running',
    minutes: 40,
    rpe: 5,
    hour: 7,
    minute: 10,
    distanceKm: 6.9,
    title: 'Easy morning run',
    notes: 'Legs fine. Saving something for the class tomorrow.',
  },
  {
    weekday: 2,
    sport: 'combat',
    minutes: 70,
    rpe: 8,
    hour: 19,
    minute: 0,
    title: 'Boxing class',
    notes: 'Pad work then four rounds of sparring. Hardest session of the week by far.',
  },
  {
    weekday: 4,
    sport: 'running',
    minutes: 35,
    rpe: 5,
    hour: 6,
    minute: 50,
    distanceKm: 6.0,
    title: 'Recovery run',
    notes: 'Shoulders and hips still sore from Wednesday. Kept it very easy.',
  },
  {
    weekday: 6,
    sport: 'running',
    minutes: 60,
    rpe: 6,
    hour: 9,
    minute: 15,
    distanceKm: 11.3,
    title: 'Sunday long run',
    notes: 'Shorter than usual — the week had already taken enough out of me.',
    gps: true,
  },
]

/**
 * The week that went wrong: six sessions, 2335 AU, and three separate warnings.
 *
 * Deliberately the most eventful week in the account. It stacks a hard gym
 * session into a hard run, then an RPE-9 combat class into an RPE-8 run twelve
 * hours later — which trips the sport-overlap check *and* the nervous-system
 * check, because those are two different findings about the same pair and the
 * history keeps both. Sitting five weeks back, it is far enough behind today to
 * have broken the consistency streak at the right distance and near enough to be
 * plainly visible on every twelve-week chart.
 */
const WEEK_OVERREACH: DaySpec[] = [
  {
    weekday: 0,
    sport: 'gym',
    minutes: 55,
    rpe: 7,
    hour: 18,
    minute: 30,
    title: 'Heavy legs',
    notes: 'Squat triples. Ambitious start to the week.',
  },
  {
    weekday: 1,
    sport: 'running',
    minutes: 45,
    rpe: 8,
    hour: 6,
    minute: 45,
    distanceKm: 9.3,
    title: 'Threshold run',
    notes: 'Should not have run this hard the morning after squats. Quads were flat.',
  },
  {
    weekday: 2,
    sport: 'combat',
    minutes: 70,
    rpe: 9,
    hour: 19,
    minute: 0,
    title: 'Sparring night',
    notes: 'Six rounds. Went far harder than planned.',
  },
  {
    weekday: 3,
    sport: 'running',
    minutes: 40,
    rpe: 8,
    hour: 6,
    minute: 50,
    distanceKm: 8.4,
    title: 'Intervals',
    notes: 'Legs were gone from the start. Finished it out of stubbornness.',
  },
  {
    weekday: 5,
    sport: 'running',
    minutes: 70,
    rpe: 7,
    hour: 9,
    minute: 0,
    distanceKm: 13.4,
    title: 'Long run',
    notes: 'Grim. Right calf tight for the last half hour.',
  },
  {
    weekday: 6,
    sport: 'gym',
    minutes: 30,
    rpe: 5,
    hour: 10,
    minute: 0,
    title: 'Mobility + light circuit',
    notes: 'Barely a session. Everything ached.',
  },
]

/**
 * The week after: three easy sessions, 575 AU, well under the floor.
 *
 * Every RPE here is 5 or below, which is what keeps the conflict engine silent
 * through it — a recovery week that still generated warnings would undercut the
 * story the two weeks are told to tell together.
 */
const WEEK_RECOVERY: DaySpec[] = [
  {
    weekday: 1,
    sport: 'running',
    minutes: 35,
    rpe: 4,
    hour: 7,
    minute: 20,
    distanceKm: 6.1,
    title: 'Easy reset',
    notes: 'Backing right off after last week. Calf behaving.',
  },
  {
    weekday: 3,
    sport: 'gym',
    minutes: 40,
    rpe: 4,
    hour: 18,
    minute: 30,
    title: 'Light full body',
    notes: 'Half the usual weight, twice the attention to form.',
  },
  {
    weekday: 6,
    sport: 'running',
    minutes: 55,
    rpe: 5,
    hour: 9,
    minute: 30,
    distanceKm: 9.6,
    title: 'Easy long run',
    notes: 'Felt human again. Ready to build back up.',
  },
]

/**
 * Twelve weeks, oldest first. Index 11 is the week in progress.
 *
 * The order is the whole design. The overreach/recovery pair sits at 6 and 7 so
 * that the three complete weeks after it (8, 9, 10) form the consistency streak
 * and the recovery week breaks it — which is what lands the streak in the
 * three-to-five range the demo is specified to show.
 */
const WEEK_PLAN: DaySpec[][] = [
  WEEK_A, // 0
  WEEK_A, // 1
  WEEK_B, // 2
  WEEK_A, // 3
  WEEK_A, // 4
  WEEK_B, // 5
  WEEK_OVERREACH, // 6
  WEEK_RECOVERY, // 7
  WEEK_A, // 8
  WEEK_B, // 9
  WEEK_A_RECENT, // 10 — last complete week; carries the recent conflict
  WEEK_A_RECENT, // 11 — in progress, truncated at today
]

export const DEMO_WEEKS = WEEK_PLAN.length

/** Routes are attached from this week index onward. See {@link DaySpec.gps}. */
const GPS_FROM_WEEK = 8

/** How many of the newest conflicts are left unresolved for the banner. */
const UNRESOLVED_CONFLICTS = 3

/* ------------------------------------------------------------------ */
/* Profile                                                             */
/* ------------------------------------------------------------------ */

/** How long ago the demo account claims to have registered. */
const ACCOUNT_AGE_DAYS = 420

export interface DemoProfileOptions {
  uid: string
  email: string
  displayName?: string
}

/**
 * The demo athlete's profile.
 *
 * Two fields here are doing quiet but essential work.
 *
 * `createdAt` is over a year old, and it has to be. `calculateCTL` blends the
 * onboarding baseline into the real average for the first twenty-one days of an
 * account's life, so a demo profile created this morning would have its Form
 * Score dragged toward a seeded constant no matter what the sessions say — the
 * numbers on screen would not be the numbers the history implies, and the whole
 * point of seeding a history would be lost.
 *
 * `notificationPreferences` is present, and set to everything-off. Present,
 * because `RootNavigator` shows the one-time permission screen to any profile
 * where the field is `undefined`, and a tester who taps "Try Demo" should land
 * on the Dashboard rather than on a permissions prompt. Off, because this is a
 * handset being passed between strangers and a daily training reminder firing
 * mid-pitch is not a feature anyone wants demonstrated.
 */
export function buildDemoProfile({ uid, email, displayName }: DemoProfileOptions): User {
  const weeklyBudgetHours = 8
  const experienceLevel = 'advanced' as const

  return {
    uid,
    displayName: displayName?.trim() || 'Alex Rivera',
    email,
    createdAt: new Date(Date.now() - ACCOUNT_AGE_DAYS * 86_400_000).toISOString(),
    sports: ['running', 'gym', 'combat'],
    weeklyBudgetHours,
    experienceLevel,
    conflictSensitivity: 'balanced',
    sportInteractions: { ...DEFAULT_SPORT_INTERACTIONS },
    onboardingCompleted: true,
    baselineCTL: calculateBaselineCTL(weeklyBudgetHours, experienceLevel),
    baselineWeeklyLoad: calculateBaselineWeeklyLoad(weeklyBudgetHours, experienceLevel),
    weightKg: 72,
    weightUnit: 'kg',
    maxHR: 189,
    // Fifty-plus sessions in; the one-time celebration would be absurd here, and
    // it fires on the next save if the flag is absent.
    firstSessionCelebrated: true,
    notificationPreferences: { ...DISABLED_NOTIFICATION_PREFERENCES },
  }
}

/* ------------------------------------------------------------------ */
/* Building the story                                                  */
/* ------------------------------------------------------------------ */

export interface DemoStoryOptions {
  uid: string
  profile: User
  /** The moment the story is anchored to. Defaults to now. */
  now?: Date
  /** Where the generated GPS routes are drawn. */
  routeCentre?: RouteCentre
}

export interface DemoStory {
  sessions: Session[]
  conflicts: Conflict[]
  planned: PlannedSession[]
}

/**
 * Materialise the twelve-week schedule into documents.
 *
 * Sessions carry deterministic ids (`demo-w06-2`), which is what makes the whole
 * thing idempotent: reseeding writes over the same document paths rather than
 * appending a second history beside the first, and a conflict can name the
 * sessions it links without a round-trip to find out what id they were given.
 */
export function buildDemoStory({
  uid,
  profile,
  now = new Date(),
  routeCentre = DEFAULT_ROUTE_CENTRE,
}: DemoStoryOptions): DemoStory {
  const thisWeekStart = startOfWeek(now)
  const sessions: Session[] = []

  WEEK_PLAN.forEach((week, weekIndex) => {
    const weekStart = addDays(thisWeekStart, -(DEMO_WEEKS - 1 - weekIndex) * 7)

    week.forEach((spec, dayIndex) => {
      const when = addDays(weekStart, spec.weekday)
      when.setHours(spec.hour, spec.minute, 0, 0)
      // The week in progress stops at the clock, not at Sunday: a session dated
      // in the future would sit in the chart's unrendered tail, count toward a
      // training day nobody has trained, and read as a bug to anyone who noticed.
      //
      // Today's sessions are pulled back rather than dropped, and that is not
      // cosmetic. Fatigue is a *seven-day* mean keyed on calendar days, so on a
      // morning when last Monday's session has just fallen out of the window and
      // this Monday's has not happened yet, the window is a session short and the
      // Form Score jumps by that session's load divided by seven. Seeded at 8am
      // on a Monday, the hero read "+51, Peaked, optimal for competition" for an
      // athlete midway through an ordinary training block — arithmetically
      // correct and impossible to defend across a table. Dating the session to
      // earlier this morning keeps every seven-day window whole, whatever hour
      // the account is seeded at.
      if (when.getTime() > now.getTime()) {
        if (!isSameLocalDay(when, now)) return
        // Five minutes, not forty. The gap between "last week's instance of this
        // session left the seven-day window" and "this week's happened" is the
        // hole that swings Form, so it has to be closed at *every* seeding hour,
        // not most of them. At forty minutes a seed run at 00:15 on a Monday
        // could not place Monday's session earlier the same day, left the window
        // a session short, and certified a demo whose hero read "+51, Peaked,
        // optimal for competition". Five minutes narrows that to the first five
        // minutes after midnight, and the Form-status check below catches even
        // that rather than trusting this to be enough.
        const pulled = new Date(now.getTime() - 5 * 60_000)
        // Seeded in the first minutes of a day, "earlier today" is yesterday.
        if (!isSameLocalDay(pulled, now)) return
        when.setTime(pulled.getTime())
      }

      sessions.push(
        buildSession({
          id: `demo-w${String(weekIndex).padStart(2, '0')}-${dayIndex}`,
          uid,
          profile,
          spec,
          when,
          withRoute: spec.gps === true && weekIndex >= GPS_FROM_WEEK,
          routeCentre,
        }),
      )
    })
  })

  sessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())

  return {
    sessions,
    conflicts: buildConflicts(sessions, profile),
    planned: buildPlannedSessions(uid, now),
  }
}

/** Same local calendar day, in the timezone the seeding machine is set to. */
function isSameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

/** Everything `logSession` derives at save time, derived the same way here. */
function buildSession(args: {
  id: string
  uid: string
  profile: User
  spec: DaySpec
  when: Date
  withRoute: boolean
  routeCentre: RouteCentre
}): Session {
  const { id, uid, profile, spec, when, withRoute, routeCentre } = args

  const loadScore = spec.minutes * spec.rpe
  const hr = estimateHRZone(spec.rpe, profile.maxHR)
  const base: Session = {
    id,
    userId: uid,
    sport: spec.sport,
    date: when.toISOString(),
    durationMinutes: spec.minutes,
    distanceKm: spec.distanceKm,
    rpe: spec.rpe,
    loadScore,
    notes: spec.notes,
    // Logged at the time it happened. Not `date` verbatim — a session is saved a
    // few minutes after it ends, and `createdAt` is what the session list falls
    // back to when a document has no usable date.
    createdAt: new Date(when.getTime() + 12 * 60_000).toISOString(),
    estimatedCalories: estimateCalories(spec.sport, spec.minutes, spec.rpe, profile.weightKg),
    estimatedHRZone: { zone: hr.zone, name: hr.name, hrRange: hr.hrRange },
    pace: spec.distanceKm
      ? calculatePace(spec.sport, spec.minutes, spec.distanceKm)
      : null,
    title: spec.title,
    trackingMode: 'quick',
  }

  if (!withRoute || spec.distanceKm == null) return base

  const route = generateRoute(id, routeCentre, spec.distanceKm, spec.minutes, when)
  const splits: SessionSplit[] = computeSplits(route.points)
  const distanceKm = route.distanceM / 1000
  const movingSeconds = route.movingTimeMs / 1000

  return {
    ...base,
    // The measured trail, not the planned figure — the map and the number under
    // it are then the same fact rather than two claims that nearly agree.
    distanceKm: Math.round(distanceKm * 100) / 100,
    trackingMode: 'live',
    routeCoordinates: route.points,
    gpsQuality: 'good',
    movingTimeMs: route.movingTimeMs,
    splits,
    elevationGain: computeElevationGain(route.points),
    averagePace: formatPaceValue(movingSeconds / distanceKm),
    pace: calculatePace(spec.sport, spec.minutes, Math.round(distanceKm * 100) / 100),
  }
}

/**
 * Run the real conflict engine over the seeded history, exactly as the app runs
 * it on every save.
 *
 * Not a hand-written list of plausible-looking warnings, and that distinction is
 * the point: whatever a tester taps into, the advice they read was produced by
 * the same function that would have produced it had they logged those sessions
 * themselves. If the thresholds are ever tuned, the demo's warnings move with
 * them instead of quietly describing a version of the product that no longer
 * exists.
 *
 * `detectedAt` is backdated to the session that triggered it. The twelve-week
 * conflict strip buckets by that field, so a stamp of "now" would pile every
 * marker onto the current week and the strip would report a catastrophic
 * fortnight that never happened.
 */
function buildConflicts(sessions: Session[], profile: User): Conflict[] {
  const SEVEN_DAYS_MS = 7 * 86_400_000
  const seen = new Set<string>()
  const out: Conflict[] = []

  sessions.forEach((session, index) => {
    const at = new Date(session.date).getTime()
    // The same window `logSession` hands the engine: everything from the last
    // seven days, including the session itself, which the engine filters by id.
    const recent = sessions
      .slice(0, index + 1)
      .filter((s) => at - new Date(s.date).getTime() <= SEVEN_DAYS_MS)

    const weekStart = startOfWeek(new Date(session.date)).getTime()
    const weeklyHours =
      recent
        .filter((s) => new Date(s.date).getTime() >= weekStart)
        .reduce((sum, s) => sum + s.durationMinutes, 0) / 60

    for (const conflict of detectConflicts(session, recent, profile, weeklyHours)) {
      const key = conflictStorageKey(conflict)
      if (seen.has(key)) continue
      seen.add(key)
      out.push({
        ...conflict,
        conflictId: `demo-conflict-${out.length}`,
        detectedAt: Timestamp.fromDate(new Date(session.date)),
        resolved: true,
      })
    }
  })

  // Newest first, then un-resolve the leading few. An athlete who has been using
  // the app for three months has dismissed the old warnings and not yet got to
  // this week's, so a history where everything is still outstanding would look
  // like an app nobody had actually used.
  out.sort((a, b) => b.detectedAt.toMillis() - a.detectedAt.toMillis())
  for (let i = 0; i < Math.min(UNRESOLVED_CONFLICTS, out.length); i++) {
    out[i] = { ...out[i], resolved: false }
  }
  return out
}

/**
 * Three plans for the coming week, two of which clash.
 *
 * Placed by offset from today rather than on named weekdays, so the Planner has
 * something in it whichever day the demo is given. The combat/running pair two
 * and three days out is the planned-conflict case: level 3 in the matrix, an
 * RPE-8 intention first, one day apart — which is what puts the resolution chips
 * on screen without a tester having to build a clashing week themselves.
 */
function buildPlannedSessions(uid: string, now: Date): PlannedSession[] {
  const createdAt = new Date(now.getTime() - 2 * 86_400_000).toISOString()
  const day = (offset: number) => localISODate(addDays(now, offset))

  return [
    {
      id: 'demo-plan-0',
      userId: uid,
      sport: 'combat',
      date: day(2),
      durationMinutes: 75,
      intensity: 8,
      createdAt,
    },
    {
      id: 'demo-plan-1',
      userId: uid,
      sport: 'running',
      date: day(3),
      durationMinutes: 45,
      intensity: 6,
      createdAt,
    },
    {
      id: 'demo-plan-2',
      userId: uid,
      sport: 'gym',
      date: day(5),
      durationMinutes: 50,
      intensity: 6,
      createdAt,
    },
  ]
}

/* ------------------------------------------------------------------ */
/* Verification                                                        */
/* ------------------------------------------------------------------ */

/** One condition the demo depends on, and whether the seeded data meets it. */
export interface DemoCheck {
  /** Short label for the printed summary. */
  name: string
  passed: boolean
  /** What was actually measured, with the figures in it. */
  detail: string
  /**
   * True for conditions the whole demo collapses without.
   *
   * Only the baseline gate is critical: below it the Dashboard hero reverts to a
   * progress meter, and a pitch that opens on "building your baseline" has lost
   * before anybody has scrolled.
   */
  critical?: boolean
}

/**
 * Re-derive every promised condition from the generated data, using the app's
 * own modules.
 *
 * The point of running the real `computeProgress`, `computeWeeklyPlan` and
 * `getBaselineState` rather than re-checking the arithmetic by hand is that a
 * hand-check can only confirm what the author already believed. This confirms
 * what the phone will actually render — and it fails loudly the day somebody
 * retunes a threshold in a way the seeded story no longer satisfies.
 */
export function verifyDemoStory(
  story: DemoStory,
  profile: User,
  now: Date = new Date(),
): DemoCheck[] {
  const { sessions, conflicts, planned } = story

  // The stores' own windows, reproduced: the baseline gate counts all history,
  // everything else reasons over the last 42 days.
  const windowStart = now.getTime() - 42 * 86_400_000
  const windowed = sessions.filter((s) => new Date(s.date).getTime() >= windowStart)

  const trainingDays = countTrainingDays(sessions)
  const baseline = getBaselineState({ trainingDays, sessionsLogged: sessions.length })

  const progress = computeProgress(sessions, 'all', now, {
    baselineCTL: profile.baselineCTL,
    createdAt: profile.createdAt,
  })

  // ---- CTL / ATL ----
  //
  // Computed by calling `metricsStore`'s own three functions, on the same
  // windowed list the store would hand them, with the same baseline blend.
  //
  // This used to be a local reimplementation — bucket by day, take a 42-day mean
  // and a 7-day mean — and it was subtly not the same calculation. It bucketed
  // by *local* day where `buildDailyLoads` bucketed by *UTC* day, and it anchored
  // its own seven-day window instead of taking the last seven keys of the map.
  // The two agreed in London and diverged by fifty points in Bangkok, so the seed
  // script cheerfully certified a Form Score of +5 for an account the phone then
  // rendered at -43 with an "Overreaching / high injury risk" hero.
  //
  // A verifier that reimplements the thing it is verifying can only ever confirm
  // that its author understood the code, which is precisely the thing in doubt.
  // Calling the real functions is what makes this check mean "the phone will show
  // this" rather than "I believe the phone will show this".
  const daysSinceRegistration = Math.max(
    0,
    Math.floor((now.getTime() - new Date(profile.createdAt).getTime()) / 86_400_000),
  )
  const baselineATL = profile.baselineCTL != null ? profile.baselineCTL * 0.9 : undefined
  const dailyLoads = buildDailyLoads(windowed, 42, now)
  const ctl = calculateCTL(dailyLoads, { baselineCTL: profile.baselineCTL, daysSinceRegistration })
  const atl = calculateATL(dailyLoads, { baselineATL, daysSinceRegistration })
  const form = ctl - atl

  const recommenderInput = {
    sessions: windowed,
    profile: { sports: profile.sports, sportInteractions: profile.sportInteractions },
    metrics: { ctl, atl },
    now,
  }
  const plan = computeWeeklyPlan(recommenderInput)
  const recovery = computeRecoveryStatus(recommenderInput)
  const plannedConflicts = detectPlannedConflicts(planned, profile)

  const checks: DemoCheck[] = []

  /* 1 — the one that matters most. */
  checks.push({
    name: `${BASELINE_DAYS}+ distinct training days (Form Score unlocked)`,
    passed: trainingDays >= BASELINE_DAYS && !baseline.building,
    detail: `${trainingDays} distinct training days across ${sessions.length} sessions; hero shows ${
      baseline.building ? 'the BASELINE METER' : `a Form Score of ${form}`
    }.`,
    critical: true,
  })

  /* 1b — and the number it publishes has to be defensible.
   *
   * Clearing the gate only means the hero shows a *number*; this is about which
   * number. Form is CTL minus a seven-day mean, and seven-day means of weekly
   * training have a hole in them — between the moment last week's session leaves
   * the window and the moment this week's lands, fatigue reads low and Form
   * spikes. Seeded at the wrong hour the demo account has read "+51, Peaked,
   * optimal for competition" for an athlete midway through an ordinary block,
   * and (before the day-bucketing fix below it) "-43, Overreaching, high injury
   * risk" for the same account on the same data.
   *
   * Both are indefensible across a table, so neither is allowed to ship silently.
   * The band is the four middle states — Building, Balanced, Fresh, and the
   * shoulder of Heavy load — which is what an athlete training five times a week
   * should actually read.
   */
  const status = getFormStatus(form, ctl)
  checks.push({
    name: 'Form Score lands in a defensible band',
    passed: form > -15 && form <= 15,
    detail: `CTL ${ctl}, ATL ${atl}, Form ${form} — hero reads "${status.status}: ${status.message}"`,
  })

  /* 2 — three sports, lopsided, over the concentration threshold. */
  const top = progress.sports[0]
  checks.push({
    name: 'Three sports with a >60% leader (cross-training note fires)',
    passed: progress.sports.length >= 3 && (top?.share ?? 0) > 60,
    detail: progress.sports.map((s) => `${s.label} ${s.share}%`).join(', ') || 'no sports',
  })

  /* 3 — the chart has all three colours, in the right order. */
  const complete = progress.weeks.filter((w) => !w.partial)
  const aboveIdx = complete.findIndex((w) => w.standing === 'above')
  const belowIdx = complete.findIndex((w, i) => w.standing === 'below' && i > aboveIdx)
  const insideCount = complete.filter((w) => w.standing === 'inside').length
  checks.push({
    name: 'Overreach week above the band, followed by a recovery week below it',
    passed: aboveIdx !== -1 && belowIdx === aboveIdx + 1 && insideCount > 0,
    detail: progress.band
      ? `band ${progress.band.low}-${progress.band.high} AU (CTL ${progress.band.ctl}); weeks: ` +
        complete.map((w) => `${w.load}${symbolFor(w.standing)}`).join(' ')
      : 'no band — CTL is zero',
  })

  /* 4 — conflicts, and at least one still on the banner. */
  const unresolved = conflicts.filter((c) => !c.resolved)
  const crossSport = conflicts.filter((c) => c.sports.length >= 2)
  const newest = conflicts.reduce(
    (max, c) => Math.max(max, c.detectedAt.toMillis()),
    0,
  )
  const newestAgeDays = Math.floor((now.getTime() - newest) / 86_400_000)
  checks.push({
    name: '2+ cross-sport conflicts, the newest recent and unresolved',
    passed: crossSport.length >= 2 && unresolved.length >= 1 && newestAgeDays <= 14,
    detail: `${conflicts.length} detected (${crossSport.length} cross-sport, ${unresolved.length} unresolved); newest ${newestAgeDays} days ago.`,
  })

  /* 5 — the streak lands in the specified window. */
  checks.push({
    name: 'Consistency streak of 3-5 weeks in range',
    passed: progress.streak >= 3 && progress.streak <= 5,
    detail: `${progress.streak} consecutive weeks inside the sustainable band.`,
  })

  /* 6 — a full plan, and something actually recovering. */
  const planOk =
    plan.status === 'ok' && plan.sessions.length >= 3 && plan.budgetFit === 'on_target'
  const recovering = recovery.filter((r) => r.status === 'recovering')
  checks.push({
    name: 'Recommender returns a 3-4 session plan, on target',
    passed: planOk,
    detail:
      plan.status === 'ok'
        ? `${plan.sessions.length} sessions, ${plan.budgetFit}, target ${plan.budget.target} AU, stance "${plan.budget.stance}" — ` +
          plan.sessions.map((s) => `${s.sport} ${s.durationMinutes}min@${s.rpe}`).join(', ')
        : `insufficient_data (${plan.trainingDays}/${RECOMMENDER_MIN_TRAINING_DAYS} training days in the 42-day window)`,
  })
  // The condition is "not everything reads Ready", not "something reads Ready".
  // A day on which all three sports are still clearing fatigue is a legitimate
  // — and, for an athlete who trains five times a week, common — reading, and
  // failing the seed over it would be asserting a stricter promise than the one
  // the demo makes.
  checks.push({
    name: 'At least one sport shows a recovery countdown',
    passed: recovering.length >= 1,
    detail:
      recovery
        .map((r) =>
          r.status === 'recovering'
            ? `${r.sport}: wait ${r.daysRemaining}d`
            : `${r.sport}: ${r.status}`,
        )
        .join(', ') || 'no sports on the profile',
  })

  /* 7 — maps have something to draw. */
  const withRoutes = sessions.filter(
    (s) => s.sport === 'running' && (s.routeCoordinates?.length ?? 0) > 1,
  )
  checks.push({
    name: '3+ running sessions with GPS routes',
    passed: withRoutes.length >= 3,
    detail: withRoutes.length
      ? `${withRoutes.length} routes; ${withRoutes
          .slice(-3)
          .map((s) => `${s.distanceKm}km/${s.routeCoordinates?.length}pts`)
          .join(', ')}`
      : 'none',
  })

  /* 8 — the Planner has a week, and a clash to resolve. */
  checks.push({
    name: 'Planned week with a detected planned conflict',
    passed: planned.length >= 3 && plannedConflicts.length >= 1,
    detail: `${planned.length} planned sessions, ${plannedConflicts.length} planned conflicts.`,
  })

  /* 9 — sanity on the texture the brief asks for. */
  const hours = new Set(sessions.map((s) => new Date(s.date).getHours()))
  const rpes = new Set(sessions.map((s) => s.rpe))
  checks.push({
    name: 'Varied times of day, RPE and notes',
    passed: hours.size >= 4 && rpes.size >= 4,
    detail: `${hours.size} distinct start hours, RPE ${Math.min(...rpes)}-${Math.max(
      ...rpes,
    )} (${rpes.size} values), ${sessions.filter((s) => s.notes).length} notes.`,
  })

  return checks
}

function symbolFor(standing: 'above' | 'inside' | 'below' | null): string {
  if (standing === 'above') return '^'
  if (standing === 'below') return 'v'
  if (standing === 'inside') return '='
  return '?'
}
