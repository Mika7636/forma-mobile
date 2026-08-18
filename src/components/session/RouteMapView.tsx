import { useEffect, useRef, useState } from 'react'
import { View } from 'react-native'
import MapView, { Marker, Polyline, type Region } from 'react-native-maps'
import Animated, { FadeOut } from 'react-native-reanimated'
import { Skeleton } from '../ui/Skeleton'
import { COLORS } from '../../constants/theme'
import { isValidCoordinate } from '../../utils/geo'
import type { MapRegion } from '../../utils/maps'
import type { RoutePoint } from '../../types/session'

interface RouteMapViewProps {
  /** Already validated and decimated by {@link RouteMap}. Never empty. */
  points: RoutePoint[]
  targetRegion: MapRegion
  height: number
  interactive: boolean
  showMarkers: boolean
}

/** A region is only safe to hand to the native map if every field is finite. */
function isValidRegion(r: MapRegion | undefined): r is Region {
  return (
    !!r &&
    isValidCoordinate(r.latitude, r.longitude) &&
    Number.isFinite(r.latitudeDelta) &&
    Number.isFinite(r.longitudeDelta) &&
    r.latitudeDelta > 0 &&
    r.longitudeDelta > 0
  )
}

/**
 * The actual Google/Apple map surface.
 *
 * **This file is the only place `react-native-maps` is imported**, and it is
 * loaded lazily by {@link RouteMap} — never at module scope. That is deliberate:
 * on a build with no Google Maps API key, mounting this component can take down
 * the process from native code (see `utils/maps.ts`), so the gate upstream must
 * be able to decide *not to load it at all* rather than merely not render it.
 *
 * Two further choices, both from the live-tracking crash work:
 *
 * 1. **The region is uncontrolled.** Passing `region` as a prop makes MapView a
 *    controlled component: React re-issues a camera command on *every* render
 *    whose region differs, and react-native-maps fights the user/animator for
 *    control of the camera. During a run that was a camera move per GPS fix on
 *    top of a re-render several times a second. Now the map mounts with
 *    `initialRegion` and is nudged imperatively when the target actually moves.
 *
 * 2. **The region is validated again here**, next to the native boundary. A
 *    non-finite latitude reaching `Polyline` or a camera call throws inside the
 *    Google Maps SDK — a native crash no JS error boundary can catch.
 */
export default function RouteMapView({
  points,
  targetRegion,
  height,
  interactive,
  showMarkers,
}: RouteMapViewProps) {
  const mapRef = useRef<MapView | null>(null)
  // MapView paints a flat grey rectangle for a beat before its tiles arrive,
  // which looks like a failed image. Cover that with the app's shimmer instead.
  const [mapReady, setMapReady] = useState(false)

  // Captured once, for the initial camera. Later changes go through the effect
  // below; re-reading this on every render would have no effect anyway, since
  // `initialRegion` is only consulted when the native view is created.
  const initialRegionRef = useRef<Region | null>(null)
  if (initialRegionRef.current === null && isValidRegion(targetRegion)) {
    initialRegionRef.current = targetRegion
  }

  // Follow the target imperatively. Cheap when nothing moved (the identity check
  // upstream means this only fires on a real new fix) and it never re-renders.
  useEffect(() => {
    if (!mapReady || !mapRef.current || !isValidRegion(targetRegion)) return
    try {
      mapRef.current.animateToRegion(targetRegion, 500)
    } catch {
      // A camera command on a torn-down or unauthorised map surface throws.
      // The map is cosmetic here — the workout data is unaffected, so swallow it
      // rather than let it bubble into the tracking screen.
    }
  }, [mapReady, targetRegion])

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <View style={{ flex: 1 }}>
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        onMapReady={() => setMapReady(true)}
        initialRegion={initialRegionRef.current ?? undefined}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        {/* A single point is a degenerate polyline; skip it and let the markers
            carry the "you are here" job until there's a real segment to draw. */}
        {points.length > 1 ? (
          <Polyline coordinates={points} strokeColor={COLORS.teal} strokeWidth={3} />
        ) : null}
        {showMarkers && first ? (
          <Marker coordinate={first} title="Start" pinColor="#22c55e" />
        ) : null}
        {showMarkers && last && points.length > 1 ? (
          <Marker coordinate={last} title="Finish" pinColor="#ef4444" />
        ) : null}
      </MapView>

      {mapReady ? null : (
        <Animated.View
          exiting={FadeOut.duration(220)}
          pointerEvents="none"
          style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
        >
          <Skeleton height={height} radius={0} />
        </Animated.View>
      )}
    </View>
  )
}
