// The only place react-native-maps is imported; loaded lazily.

import { useEffect, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import MapView, { Marker, Polyline, type Region } from 'react-native-maps'
import Animated, { FadeOut } from 'react-native-reanimated'
import { Skeleton } from '../ui/Skeleton'
import { isValidCoordinate } from '../../utils/geo'
import type { MapRegion } from '../../utils/maps'
import type { RoutePoint } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'
interface RouteMapViewProps {
  points: RoutePoint[]
  targetRegion: MapRegion
  height: number
  interactive: boolean
  showMarkers: boolean
}

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

export default function RouteMapView({
  points,
  targetRegion,
  height,
  interactive,
  showMarkers,
}: RouteMapViewProps) {
  const { colors, scheme } = useTheme()

  const mapRef = useRef<MapView | null>(null)
  const [mapReady, setMapReady] = useState(false)

  const initialRegionRef = useRef<Region | null>(null)
  if (initialRegionRef.current === null && isValidRegion(targetRegion)) {
    initialRegionRef.current = targetRegion
  }

  useEffect(() => {
    if (!mapReady || !mapRef.current || !isValidRegion(targetRegion)) return
    try {
      mapRef.current.animateToRegion(targetRegion, 500)
    } catch {
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
        customMapStyle={Platform.OS === 'android' ? (colors.mapStyle as unknown as never) : undefined}
        userInterfaceStyle={scheme}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        pointerEvents={interactive ? 'auto' : 'none'}
      >
        {points.length > 1 ? (
          <Polyline coordinates={points} strokeColor={colors.accent} strokeWidth={3} />
        ) : null}
        {showMarkers && first ? (
          <Marker coordinate={first} title="Start" pinColor={colors.accent} />
        ) : null}
        {showMarkers && last && points.length > 1 ? (
          <Marker coordinate={last} title="Finish" pinColor={colors.danger} />
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
