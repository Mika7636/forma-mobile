import { memo, useEffect, useMemo, useRef, useState } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import MapView, { Marker, Polyline, type Region } from 'react-native-maps'
import Animated, { FadeOut } from 'react-native-reanimated'
import { Skeleton } from '../ui/Skeleton'
import { COLORS, RADIUS, TYPE } from '../../constants/theme'
import { decimateRoute, isValidCoordinate } from '../../utils/geo'
import type { RoutePoint } from '../../types/session'

/**
 * Ceiling on how many points are handed to the native Polyline. A phone screen
 * cannot resolve more, and every point is re-serialised across the bridge each
 * time the coordinate array changes.
 */
const MAX_RENDERED_POINTS = 300

interface RouteMapProps {
  coordinates: RoutePoint[]
  height?: number
  /** Pan/zoom enabled? Off for the small live map and session-detail preview. */
  interactive?: boolean
  /** Draw start (green) / end (red) pins. */
  showMarkers?: boolean
  /**
   * Explicit region — used by the live tracker to keep the runner centred. When
   * omitted the region is fitted to the route's bounding box.
   *
   * Applied *imperatively* (see below), not as a controlled prop.
   */
  region?: Region
  style?: StyleProp<ViewStyle>
}

/**
 * Compute a map region that frames every point with a little breathing room.
 * Falls back to a wide default when there are no points yet.
 */
function regionForCoordinates(points: RoutePoint[]): Region {
  if (points.length === 0) {
    return { latitude: 0, longitude: 0, latitudeDelta: 0.05, longitudeDelta: 0.05 }
  }
  let minLat = points[0].latitude
  let maxLat = points[0].latitude
  let minLon = points[0].longitude
  let maxLon = points[0].longitude
  for (const p of points) {
    minLat = Math.min(minLat, p.latitude)
    maxLat = Math.max(maxLat, p.latitude)
    minLon = Math.min(minLon, p.longitude)
    maxLon = Math.max(maxLon, p.longitude)
  }
  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.005)
  const lonDelta = Math.max((maxLon - minLon) * 1.4, 0.005)
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  }
}

/** A region is only safe to hand to the native map if every field is finite. */
function isValidRegion(r: Region | undefined): r is Region {
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
 * Renders a GPS route as a teal polyline over a map, with optional start/end
 * markers. Shared by {@link LiveTracker} (live, small, follow-cam) and the
 * session-detail view (static, fitted to the full route).
 *
 * Two deliberate choices, both driven by the live-tracking crash work:
 *
 * 1. **The region is uncontrolled.** Passing `region` as a prop makes MapView a
 *    controlled component: React re-issues a camera command on *every* render
 *    whose region differs, and react-native-maps fights the user/animator for
 *    control of the camera. During a run that was a camera move per GPS fix on
 *    top of a re-render several times a second. Now the map mounts with
 *    `initialRegion` and is nudged imperatively when the target actually moves.
 *
 * 2. **Coordinates are validated and decimated here too**, not only at the call
 *    site. A non-finite latitude reaching `Polyline` throws inside the Google
 *    Maps SDK — a native crash that no JS error boundary can catch — so this is
 *    the last gate in front of the native layer and it belongs next to it.
 */
function RouteMap({
  coordinates,
  height = 180,
  interactive = false,
  showMarkers = true,
  region,
  style,
}: RouteMapProps) {
  const mapRef = useRef<MapView | null>(null)
  // MapView paints a flat grey rectangle for a beat before its tiles arrive,
  // which looks like a failed image. Cover that with the app's shimmer instead.
  const [mapReady, setMapReady] = useState(false)

  const points = useMemo(() => {
    const valid = coordinates.filter((p) => p && isValidCoordinate(p.latitude, p.longitude))
    return decimateRoute(valid, MAX_RENDERED_POINTS)
  }, [coordinates])

  const fittedRegion = useMemo(() => regionForCoordinates(points), [points])
  const targetRegion = isValidRegion(region) ? region : fittedRegion

  // Captured once, for the initial camera. Later changes go through the effect
  // below; re-reading this on every render would have no effect anyway, since
  // `initialRegion` is only consulted when the native view is created.
  const initialRegionRef = useRef<Region | null>(null)
  if (initialRegionRef.current === null && points.length > 0) {
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

  if (points.length === 0) {
    return (
      <View
        style={[
          {
            height,
            borderRadius: RADIUS.card,
            backgroundColor: COLORS.fieldBg,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
          },
          style,
        ]}
      >
        <Text style={{ fontSize: 22, marginBottom: 4 }}>🛰️</Text>
        <Text style={{ fontSize: TYPE.small, color: COLORS.subtle }}>Searching for GPS…</Text>
      </View>
    )
  }

  const first = points[0]
  const last = points[points.length - 1]

  return (
    <View
      style={[
        {
          height,
          borderRadius: RADIUS.card,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: COLORS.border,
        },
        style,
      ]}
    >
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

/**
 * Memoised because its parent (the live tracker) re-renders on the clock tick.
 * Without this, every second of a workout re-rendered the map subtree.
 */
export default memo(RouteMap)
