import { useMemo } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import MapView, { Marker, Polyline, type Region } from 'react-native-maps'
import { COLORS } from '../../constants/theme'
import type { RoutePoint } from '../../types/session'

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

/**
 * Renders a GPS route as a teal polyline over a map, with optional start/end
 * markers. Shared by {@link LiveTracker} (live, small, follow-cam) and the
 * session-detail view (static, fitted to the full route).
 */
export default function RouteMap({
  coordinates,
  height = 180,
  interactive = false,
  showMarkers = true,
  region,
  style,
}: RouteMapProps) {
  const fittedRegion = useMemo(() => regionForCoordinates(coordinates), [coordinates])
  const activeRegion = region ?? fittedRegion
  const first = coordinates[0]
  const last = coordinates[coordinates.length - 1]

  if (coordinates.length === 0) {
    return (
      <View
        style={[
          {
            height,
            borderRadius: 16,
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
        <Text style={{ fontSize: 13, color: COLORS.subtle }}>Searching for GPS…</Text>
      </View>
    )
  }

  return (
    <View
      style={[
        { height, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: COLORS.border },
        style,
      ]}
    >
      <MapView
        style={{ flex: 1 }}
        region={activeRegion}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        <Polyline
          coordinates={coordinates}
          strokeColor={COLORS.teal}
          strokeWidth={3}
        />
        {showMarkers && first ? (
          <Marker coordinate={first} title="Start" pinColor="#22c55e" />
        ) : null}
        {showMarkers && last && coordinates.length > 1 ? (
          <Marker coordinate={last} title="Finish" pinColor="#ef4444" />
        ) : null}
      </MapView>
    </View>
  )
}
