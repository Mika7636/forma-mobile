// Warms the GPS receiver up before a run starts.

import { useEffect, useRef, useState } from 'react'
import * as Location from 'expo-location'
import {
  GPS_GOOD_ACCURACY_M,
  GPS_GOOD_MAX_AGE_MS,
  GPS_LOST_AFTER_MS,
  warmupLocationOptions,
  type GpsQuality,
} from '../store/liveTrackingStore'

const TICK_MS = 1000

interface WarmupFix {
  at: number
  accuracyM: number | null
}

export function useGpsWarmup(enabled: boolean): GpsQuality {
  const [quality, setQuality] = useState<GpsQuality>('acquiring')
  const lastFix = useRef<WarmupFix | null>(null)
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
      setQuality((prev) => (prev === next ? prev : next))
    }, TICK_MS)

    return () => {
      cancelled = true
      clearInterval(id)
      try {
        sub?.remove()
      } catch {
      }
    }
  }, [enabled])

  return quality
}
