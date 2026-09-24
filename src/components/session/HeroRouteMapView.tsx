// The hero map's native surface, loaded lazily.

import { useCallback, useMemo, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps'
import Animated, { FadeIn } from 'react-native-reanimated'
import { frameRoute, MIN_ZOOM_LEVEL } from './routeRegion'
import { useTheme } from '../../theme/ThemeProvider'

interface HeroRouteMapViewProps {
  coordinates: LatLng[]
  height: number
}

const EDGE_PADDING = { top: 56, right: 48, bottom: 96, left: 48 }

export default function HeroRouteMapView({ coordinates, height }: HeroRouteMapViewProps) {
  const { colors, scheme } = useTheme()

  const mapRef = useRef<MapView | null>(null)
  const [tilesReady, setTilesReady] = useState(false)

  const readyRef = useRef(false)
  const sizedRef = useRef(false)
  const attemptsRef = useRef(0)

  const framing = useMemo(() => frameRoute(coordinates), [coordinates])

  const applyCamera = useCallback(() => {
    if (!mapRef.current || !readyRef.current || !sizedRef.current) return
    if (attemptsRef.current >= 3) return
    attemptsRef.current += 1

    try {
      if (framing.kind === 'route') {
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: EDGE_PADDING,
          animated: false,
        })
      } else if (framing.kind === 'point') {
        mapRef.current.animateToRegion(framing.region, 0)
      }
    } catch {
      attemptsRef.current -= 1
    }
  }, [coordinates, framing])

  if (framing.kind === 'none') return null

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height: laidOutHeight } = e.nativeEvent.layout
        if (width > 0 && laidOutHeight > 0) {
          sizedRef.current = true
          applyCamera()
        }
      }}
    >
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={framing.region}
        minZoomLevel={MIN_ZOOM_LEVEL}
        onMapReady={() => {
          readyRef.current = true
          setTilesReady(true)
          applyCamera()
          requestAnimationFrame(applyCamera)
        }}
        customMapStyle={Platform.OS === 'android' ? (colors.mapStyle as unknown as never) : undefined}
        userInterfaceStyle={scheme}
        scrollEnabled={false}
        zoomEnabled={false}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={false}
        showsMyLocationButton={false}
        showsCompass={false}
        pointerEvents="none"
      >
        {framing.kind === 'route' ? (
          <Polyline
            coordinates={coordinates}
            strokeColor={colors.accent}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        <Marker coordinate={coordinates[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <EndpointDot color={colors.accent} />
        </Marker>
        {framing.kind === 'route' ? (
          <Marker
            coordinate={coordinates[coordinates.length - 1]}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <EndpointDot color={colors.danger} />
          </Marker>
        ) : null}
      </MapView>

      {tilesReady ? null : (
        <Animated.View
          entering={FadeIn.duration(1)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height,
            backgroundColor: colors.surface,
          }}
        />
      )}
    </View>
  )
}

function EndpointDot({ color }: { color: string }) {
  const { colors, scheme } = useTheme()

  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: colors.bg,
      }}
    />
  )
}
