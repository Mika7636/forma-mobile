import { useCallback, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps'
import Animated, { FadeIn } from 'react-native-reanimated'
import { COLOR } from '../../theme/tokens'
import { DARK_MAP_STYLE } from './darkMapStyle'

interface HeroRouteMapViewProps {
  /** Already validated and thinned upstream. Always at least two points. */
  coordinates: LatLng[]
  height: number
}

/**
 * How much empty map to leave around the route, in points.
 *
 * Generous on purpose: the title card overlaps the bottom of the hero and the
 * gradient eats the lowest 40%, so a route fitted tight to the frame would run
 * under both. This keeps the whole shape in the readable band.
 */
const EDGE_PADDING = { top: 56, right: 48, bottom: 96, left: 48 }

/**
 * The finished-workout hero map.
 *
 * ## Why this doesn't reuse `RouteMapView`
 *
 * `RouteMapView` positions its camera with a *region* — a centre plus a
 * lat/lon delta computed by `regionForCoordinates`, which floors both deltas at
 * `0.005°`. That floor is roughly a 500 m viewport, and it is why the summary
 * map appeared to lose its route: any workout whose bounding box is smaller than
 * that gets padded out to 500 m across, so a 250 m loop is drawn about fifteen
 * pixels wide — underneath a start marker that is forty pixels tall. The
 * polyline was always there; it was rendered inside the pin. The live map got
 * away with it because it draws no markers, so a short squiggle was still
 * visible as a squiggle.
 *
 * `fitToCoordinates` has no floor. It asks the native map to frame exactly these
 * points with exactly this padding, so a 250 m loop fills the hero and a 20 km
 * ride fits it. That is the fix, and it is also just the right API for a static
 * map of a known shape.
 *
 * ## Fitting once, on layout
 *
 * The fit is issued from `onLayout` rather than `onMapReady`, and only after the
 * view actually has a size. On Android a `fitToCoordinates` call against a
 * zero-height map is silently dropped, which is a common way for this to look
 * broken inside a `ScrollView` that measures late.
 */
export default function HeroRouteMapView({ coordinates, height }: HeroRouteMapViewProps) {
  const mapRef = useRef<MapView | null>(null)
  const [ready, setReady] = useState(false)
  const fittedRef = useRef(false)
  const sizedRef = useRef(false)

  const fit = useCallback(() => {
    if (fittedRef.current || !mapRef.current) return
    if (!ready || !sizedRef.current || coordinates.length < 2) return
    fittedRef.current = true
    try {
      mapRef.current.fitToCoordinates(coordinates, {
        edgePadding: EDGE_PADDING,
        animated: false,
      })
    } catch {
      // A camera command against a torn-down or unauthorised map surface throws.
      // The map is decoration on this screen; the workout is already recorded.
      fittedRef.current = false
    }
  }, [coordinates, ready])

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        if (e.nativeEvent.layout.height > 0 && e.nativeEvent.layout.width > 0) {
          sizedRef.current = true
          fit()
        }
      }}
    >
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        onMapReady={() => {
          setReady(true)
          // `ready` won't be visible to `fit` until the next render, so let the
          // layout callback or this tick's re-render drive it.
          requestAnimationFrame(fit)
        }}
        // Android: our own night styling. iOS ignores customMapStyle and takes
        // its cue from the view's interface style instead.
        customMapStyle={Platform.OS === 'android' ? (DARK_MAP_STYLE as unknown as never) : undefined}
        userInterfaceStyle="dark"
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
        <Polyline
          coordinates={coordinates}
          strokeColor={COLOR.accent}
          strokeWidth={5}
          lineCap="round"
          lineJoin="round"
        />
        {/* Dots rather than pins. A map pin is a 40pt teardrop anchored above the
            point it marks — on a short route the two pins overlap each other and
            the line between them, which is what made this map read as "start
            marker only". A small flat dot sits on the coordinate itself. */}
        <Marker coordinate={coordinates[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <EndpointDot color={COLOR.accent} />
        </Marker>
        <Marker
          coordinate={coordinates[coordinates.length - 1]}
          anchor={{ x: 0.5, y: 0.5 }}
          tracksViewChanges={false}
        >
          <EndpointDot color={COLOR.danger} />
        </Marker>
      </MapView>

      {/* The map paints flat grey for a beat before tiles arrive. Cover that with
          the page ground so it reads as "loading", not as "broken". */}
      {ready ? null : (
        <Animated.View
          entering={FadeIn.duration(1)}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            height,
            backgroundColor: COLOR.surface,
          }}
        />
      )}
    </View>
  )
}

/** A flat endpoint dot with a ring, so it stays legible over any map colour. */
function EndpointDot({ color }: { color: string }) {
  return (
    <View
      style={{
        width: 16,
        height: 16,
        borderRadius: 8,
        backgroundColor: color,
        borderWidth: 3,
        borderColor: COLOR.bg,
      }}
    />
  )
}
