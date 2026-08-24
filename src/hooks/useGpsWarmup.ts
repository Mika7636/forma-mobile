/**
 * Warm the GPS receiver up while the athlete is still on the pre-start screen.
 *
 * ## Why
 *
 * A cold GPS start takes 30-60 seconds: the receiver has to download almanac and
 * ephemeris data before it can produce anything better than a 100 m cell-tower
 * estimate. If the first `watchPositionAsync` call of the session happens when
 * the athlete taps Start, that whole cold start lands *inside* the run — which
 * is exactly why the first kilometre of a tracked run is always the worst one,
 * and why the tracker used to sit on "Searching for GPS…" for the first minute.
 *
 * Opening a cheap watcher while the ready screen is on-screen moves that cost to
 * the seconds the athlete spends putting their headphones in. By the time they
 * tap Start the receiver has a lock, so the session begins with real fixes
 * instead of a warm-up.
 *
 * It also gives them something Strava has and we didn't: a light that says
 * whether it is worth waiting five more seconds before setting off.
 *
 * ## Cost
 *
 * `Accuracy.High` at one fix per two seconds, only while the screen is mounted,
 * torn down in the effect's cleanup. Nothing is accumulated — this hook never
 * touches `liveTrackingStore`, so a warm-up fix can never end up in a session's
 * distance.
 */
import { useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import {
  GPS_GOOD_ACCURACY_M,
  GPS_GOOD_MAX_AGE_MS,
  GPS_LOST_AFTER_MS,
  warmupLocationOptions,
  type GpsQuality,
} from '../store/liveTrackingStore'

/** How often the quality is re-derived so it decays when fixes stop arriving. */
const TICK_MS = 1000

interface WarmupFix {
  at: number
  accuracyM: number | null
}

/**
 * @param enabled keep the watcher alive (false tears it down immediately —
 *   pass false the moment the session starts, so the warm-up watcher isn't
 *   competing with the session's own feed).
 * @returns the same {@link GpsQuality} the tracking screen renders, so the
 *   pre-start indicator and the in-run chip speak the same language.
 */
export function useGpsWarmup(enabled: boolean): GpsQuality {
  const [quality, setQuality] = useState<GpsQuality>('acquiring')
  /** Written from the location callback; read on the tick. A ref, not state, so
   *  a fix does not re-render the screen — only a *change of quality* does. */
  const lastFix = useRef<WarmupFix | null>(null)
  /** When the watcher started, so "lost" is measured from a sensible instant. */
  const startedAt = useRef(0)

  useEffect(() => {
    if (!enabled) {
      setQuality('acquiring')
      return
    }

    let cancelled = false
    let sub: Location.LocationSubscription | null = null
    lastFix.current = null
    startedAt.current = Date.now()
    setQuality('acquiring')

    void (async () => {
      try {
        // Read, never request. Asking for location permission on a screen the
        // athlete has not yet acted on is the surest way to get it denied — the
        // request belongs to the Start tap, where the reason is obvious. Until
        // then the indicator simply stays grey.
        const { granted } = await Location.getForegroundPermissionsAsync()
        if (cancelled || !granted) return
        if (!(await Location.hasServicesEnabledAsync())) return

        const next = await Location.watchPositionAsync(
          warmupLocationOptions(),
          (loc) => {
            const acc = loc?.coords?.accuracy
            lastFix.current = {
              at: Date.now(),
              accuracyM: acc != null && Number.isFinite(acc) ? acc : null,
            }
          },
          (reason) => {
            // Nothing to do: this is a courtesy warm-up, and the indicator
            // decaying to grey/red already says everything the athlete needs.
            console.warn('[useGpsWarmup] watcher error', reason)
          },
        )
        if (cancelled) {
          next.remove()
          return
        }
        sub = next
      } catch (err) {
        console.warn('[useGpsWarmup] could not start', err)
      }
    })()

    const id = setInterval(() => {
      const now = Date.now()
      const fix = lastFix.current
      const age = now - (fix?.at ?? startedAt.current)
      let next: GpsQuality
      if (!fix) {
        next = age > GPS_LOST_AFTER_MS ? 'lost' : 'acquiring'
      } else if (age > GPS_LOST_AFTER_MS) {
        next = 'lost'
      } else if (
        age <= GPS_GOOD_MAX_AGE_MS &&
        fix.accuracyM != null &&
        fix.accuracyM <= GPS_GOOD_ACCURACY_M
      ) {
        next = 'good'
      } else {
        next = 'weak'
      }
      // Passing the unchanged value lets React bail out of the re-render, which
      // is the common case once the receiver has settled.
      setQuality((prev) => (prev === next ? prev : next))
    }, TICK_MS)

    return () => {
      cancelled = true
      clearInterval(id)
      try {
        sub?.remove()
      } catch {
        // Already torn down natively (services switched off, app killed). The
        // reference is going either way.
      }
    }
  }, [enabled])

  return quality
}
