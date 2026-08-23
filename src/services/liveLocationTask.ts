/**
 * Registers the background location task that keeps a run recording while the
 * screen is off.
 *
 * ## Read this before moving anything in here
 *
 * `TaskManager.defineTask` **must run in the global scope of the JS bundle**,
 * not inside a component, an effect or a lazy import. The reason is the whole
 * point of the feature: when the OS has a location batch to deliver and FORMA is
 * not running, it spins the JS bundle up *headlessly* — no React tree is
 * mounted, no navigator exists — runs the task, and shuts the process back down.
 * If the definition were behind a component lifecycle it would simply never be
 * registered in that context, and the batch would be dropped.
 *
 * That is why `App.tsx` imports this module for its side effect at module scope,
 * and why the handler must not touch anything React-shaped.
 *
 * The task registration itself is persisted by the OS across launches, so a task
 * name that was ever registered can be woken even by a build that no longer
 * defines it — hence {@link handleOrphanedWake} below.
 */
import * as TaskManager from 'expo-task-manager'
import type * as Location from 'expo-location'
import {
  LIVE_LOCATION_TASK,
  ingestLocations,
  reconcileOrphanedFeed,
} from '../store/liveTrackingStore'

/** Payload expo-location hands the task: a batch of one or more new fixes. */
interface LocationTaskData {
  locations?: Location.LocationObject[]
}

/**
 * Wake with no session to accumulate onto — the workout was saved or discarded,
 * but a stale registration survived (an OS-level registration outlives the JS
 * context that made it, and can outlive an app update). Shut the service and its
 * notification down rather than quietly burning battery.
 */
async function handleOrphanedWake(): Promise<void> {
  try {
    await reconcileOrphanedFeed()
  } catch (err) {
    console.warn('[liveLocationTask] orphan cleanup failed', err)
  }
}

TaskManager.defineTask<LocationTaskData>(LIVE_LOCATION_TASK, async ({ data, error }) => {
  // Everything here is wrapped: this executor is invoked by the native task
  // manager, outside React and outside any error boundary, and in a release
  // build an unhandled rejection here is fatal — it would take down the very
  // process that is meant to be recording the run.
  try {
    if (error) {
      // Typically a revoked permission or location services switched off
      // mid-run. Nothing to accumulate; the UI's staleness timer will surface
      // "GPS signal lost" next time the athlete looks at the screen.
      console.warn('[liveLocationTask] location error', error.message)
      return
    }

    const locations = data?.locations
    if (!locations?.length) return

    // `ingestLocations` hydrates the persisted session first, so this is correct
    // even in a JS context that was created seconds ago purely to receive this
    // batch and has never seen the workout.
    await ingestLocations(locations)

    // If that batch landed on no session at all, the registration is debris:
    // `ingestLocations` silently no-ops, so this is the only thing that would
    // ever notice. Cheap — the store is already hydrated by this point, and it
    // returns immediately while a workout is in progress.
    await handleOrphanedWake()
  } catch (err) {
    console.warn('[liveLocationTask] task failed', err)
  }
})

/**
 * Stop a background feed left running by a workout that no longer exists.
 *
 * Called once on app start (`App.tsx`). The failure mode it prevents is a
 * persistent "FORMA is tracking your run" notification with nothing behind it —
 * which is both alarming and a real battery drain, and which the user cannot
 * dismiss because a foreground-service notification is not swipeable.
 */
export function reconcileLiveTrackingOnStart(): void {
  void handleOrphanedWake()
}

export { LIVE_LOCATION_TASK }
