// Registers the background location task at bundle scope.

import * as TaskManager from 'expo-task-manager'
import type * as Location from 'expo-location'
import {
  LIVE_LOCATION_TASK,
  ingestLocations,
  reconcileOrphanedFeed,
} from '../store/liveTrackingStore'

interface LocationTaskData {
  locations?: Location.LocationObject[]
}

async function handleOrphanedWake(): Promise<void> {
  try {
    await reconcileOrphanedFeed()
  } catch (err) {
    console.warn('[liveLocationTask] orphan cleanup failed', err)
  }
}

TaskManager.defineTask<LocationTaskData>(LIVE_LOCATION_TASK, async ({ data, error }) => {
  try {
    if (error) {
      console.warn('[liveLocationTask] location error', error.message)
      return
    }

    const locations = data?.locations
    console.log('[liveLocationTask] woke with', locations?.length ?? 0, 'fix(es)')
    if (!locations?.length) return

    await ingestLocations(locations, 'task')

    await handleOrphanedWake()
  } catch (err) {
    console.warn('[liveLocationTask] task failed', err)
  }
})

export function reconcileLiveTrackingOnStart(): void {
  void handleOrphanedWake()
}

export { LIVE_LOCATION_TASK }
