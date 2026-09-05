// Zustand sessions store. Owns the single real-time listener on
// /users/{uid}/sessions and keeps CTL/ATL/Form in the metrics store in sync
// with it, so a session logged on any device (or the web app) lands on the
// dashboard without a refresh.
import { collection, onSnapshot } from 'firebase/firestore'
import { create } from 'zustand'
import { db } from '../config/firebase'
import { toSession } from '../services/sessionService'
import { countTrainingDays } from '../utils/calibration'
import type { Session } from '../types/session'
import { useMetricsStore } from './metricsStore'

/** How much history the dashboard reasons over (also the CTL window). */
export const HISTORY_WINDOW_DAYS = 42
const WEEK_DAYS = 7

interface SessionsState {
  /** Last {@link HISTORY_WINDOW_DAYS} of sessions, newest first. */
  sessions: Session[]
  /** Subset of `sessions` from the last 7 days. */
  weekSessions: Session[]
  /**
   * Distinct calendar days carrying a session across the athlete's **whole**
   * history — the baseline gate's meter.
   *
   * Counted here rather than by the gate's consumers because it is the one
   * figure on this screen that must not be windowed. `sessions` above is
   * deliberately cut to {@link HISTORY_WINDOW_DAYS} for the CTL maths, and
   * counting training days inside that rolling window would cap the gate at
   * "trained all 42 of the last 42 days" — leaving a three-times-a-week athlete
   * parked around 18 for ever, never unlocking. The snapshot already holds all
   * of it (the listener is unfiltered), so this costs a pass, not a read.
   */
  trainingDays: number
  /** Sessions across all history, for the same reason. */
  totalSessions: number
  /** True while a listener is attached but its first snapshot hasn't landed. */
  loading: boolean
  /**
   * The uid whose snapshot is currently in `sessions`, or null before the first
   * one lands. Consumers compare this against the signed-in uid to tell "still
   * loading" from "loaded and genuinely empty" — and to be sure they're never
   * rendering the previous account's data after a user switch.
   */
  loadedUid: string | null
  error: Error | null
  /**
   * Attach the listener for `uid`. Ref-counted: many screens may call this, but
   * only one Firestore listener exists at a time. Returns an unsubscribe fn.
   */
  subscribe: (uid: string) => () => void
  clear: () => void
}

function cutoffDate(daysAgo: number): number {
  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - daysAgo)
  return cutoff.getTime()
}

const emptyState = {
  sessions: [] as Session[],
  weekSessions: [] as Session[],
  trainingDays: 0,
  totalSessions: 0,
  loading: false,
  loadedUid: null as string | null,
  error: null as Error | null,
}

export const useSessionsStore = create<SessionsState>((set) => ({
  ...emptyState,

  subscribe: (uid) => {
    // Someone is already listening for this user — just share it.
    if (listener && listener.uid === uid) {
      listener.refs += 1
      return () => release(uid)
    }
    // A different user signed in; drop the old listener and its data.
    teardown()

    set({
      sessions: [],
      weekSessions: [],
      trainingDays: 0,
      totalSessions: 0,
      loading: true,
      loadedUid: null,
      error: null,
    })

    // Deliberately an unfiltered, unordered collection listener.
    //
    // The web app writes `date` as an ISO string; this app writes a Firestore
    // Timestamp. Firestore orders by *type* before value, so a range filter
    // only ever matches docs whose `date` has the same type as the bound —
    // where('date','>=',<Timestamp>) would silently hide every web-logged
    // session, and the ISO-string bound the web uses would hide every session
    // logged from this app. orderBy('date') is likewise type-partitioned. So we
    // read the collection, normalise both shapes via toSession(), then window
    // and sort in memory where the types are uniform.
    const unsubscribe = onSnapshot(
      collection(db, 'users', uid, 'sessions'),
      (snapshot) => {
        const cutoff = cutoffDate(HISTORY_WINDOW_DAYS)
        const weekCutoff = cutoffDate(WEEK_DAYS)

        // The whole history, normalised, before anything is windowed. The
        // baseline gate is counted from this; everything else from the slice
        // below it.
        const all = snapshot.docs.map((d) => toSession(d.id, d.data()))

        const sessions = all
          .filter((s) => new Date(s.date).getTime() >= cutoff)
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

        const weekSessions = sessions.filter(
          (s) => new Date(s.date).getTime() >= weekCutoff,
        )

        set({
          sessions,
          weekSessions,
          trainingDays: countTrainingDays(all),
          totalSessions: all.length,
          loading: false,
          loadedUid: uid,
          error: null,
        })
        // Keep derived training metrics in lockstep with the raw sessions.
        useMetricsStore.getState().recalculate(sessions)
      },
      (error) => set({ error, loading: false }),
    )

    listener = { uid, refs: 1, unsubscribe }
    return () => release(uid)
  },

  clear: () => {
    teardown()
    set({ ...emptyState })
    useMetricsStore.getState().reset()
  },
}))

/* --- Module-scoped listener bookkeeping ------------------------------- */
// Kept outside store state: it's plumbing, not something the UI renders.

interface ActiveListener {
  uid: string
  refs: number
  unsubscribe: () => void
}

let listener: ActiveListener | null = null

function teardown() {
  listener?.unsubscribe()
  listener = null
}

/** Drop one subscriber; detach Firestore once the last one goes away. */
function release(uid: string) {
  if (!listener || listener.uid !== uid) return
  listener.refs -= 1
  if (listener.refs > 0) return
  teardown()
  useSessionsStore.setState({ ...emptyState })
  useMetricsStore.getState().reset()
}
