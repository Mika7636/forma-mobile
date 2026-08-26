import { useCallback, useMemo, useRef, useState } from 'react'
import { Platform, View } from 'react-native'
import MapView, { Marker, Polyline, type LatLng } from 'react-native-maps'
import Animated, { FadeIn } from 'react-native-reanimated'
import { COLOR } from '../../theme/tokens'
import { DARK_MAP_STYLE } from './darkMapStyle'
import { frameRoute, MIN_ZOOM_LEVEL } from './routeRegion'

interface HeroRouteMapViewProps {
  /** Already validated and thinned upstream. Always at least one point. */
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
 * ## Why this does not reuse `RouteMapView`
 *
 * `RouteMapView` positions its camera with a *region* whose deltas are floored
 * at 0.005 degrees, roughly a 500 m viewport. Any workout with a smaller
 * bounding box gets padded out to that, so a 250 m loop is drawn about fifteen
 * pixels wide, underneath a start marker forty pixels tall. `fitToCoordinates`
 * has no floor: it frames exactly these points with exactly this padding, so a
 * 250 m loop fills the hero and a 20 km ride fits it.
 *
 * ## Why there is nonetheless a fallback
 *
 * Removing that floor also removed the only thing standing between this screen
 * and a route with nothing to fit. `fitToCoordinates` on a single point, or on
 * a cluster of coincident points, has no meaningful answer, and what the native
 * map does with an unanswerable fit is keep its default region: the whole
 * world. That is the regression this file guards against, in four layers:
 *
 *  1. **`initialRegion`**, computed by {@link frameRoute} and applied when the
 *     native view is constructed. It cannot be dropped, so even if every camera
 *     command below fails the map still opens on the workout.
 *  2. **The point case** gets an explicit `animateToRegion` at a fixed ~300 m
 *     span rather than a fit, because there is nothing to fit.
 *  3. **`minZoomLevel`** stops the camera ever sitting further out than about
 *     half a degree, whatever asks it to.
 *  4. **The empty case never gets here at all** — `HeroRouteMap` renders the
 *     indoor panel instead of mounting a map with no coordinates.
 *
 * ## Fitting: both triggers, because either alone misses
 *
 * The camera command needs two things to have happened. The view must have a
 * non-zero size, and the native map must be ready, and on Android those land in
 * either order. `onLayout` alone misses when layout beats map creation (the
 * command is issued against a map that does not exist yet); `onMapReady` alone
 * misses inside a `ScrollView` that measures late (the command is issued
 * against a zero-height map and is silently dropped). Both call the same
 * guarded routine, which runs when the second of the two arrives.
 */
export default function HeroRouteMapView({ coordinates, height }: HeroRouteMapViewProps) {
  const mapRef = useRef<MapView | null>(null)
  const [tilesReady, setTilesReady] = useState(false)

  // Refs, not state, for the two preconditions. `applyCamera` is called from
  // native callbacks that fire outside React's render cycle, and reading
  // readiness from state meant reading the value captured when the callback was
  // created — which for `onMapReady` is always the stale `false` it was built
  // with. That was one of the two ways the fit silently never happened.
  const readyRef = useRef(false)
  const sizedRef = useRef(false)
  const attemptsRef = useRef(0)

  const framing = useMemo(() => frameRoute(coordinates), [coordinates])

  const applyCamera = useCallback(() => {
    if (!mapRef.current || !readyRef.current || !sizedRef.current) return
    // Both triggers are allowed to run and `onMapReady` can re-fire, so cap the
    // attempts rather than latching after the first. Re-issuing the same camera
    // command is cheap and idempotent; an unbounded loop would not be.
    if (attemptsRef.current >= 3) return
    attemptsRef.current += 1

    try {
      if (framing.kind === 'route') {
        mapRef.current.fitToCoordinates(coordinates, {
          edgePadding: EDGE_PADDING,
          animated: false,
        })
      } else if (framing.kind === 'point') {
        // A fit would be meaningless here, so name the region explicitly.
        mapRef.current.animateToRegion(framing.region, 0)
      }
    } catch {
      // A camera command against a torn-down or unauthorised map surface
      // throws. The map is decoration on this screen and `initialRegion` has
      // already put it in the right place; the workout is recorded either way.
      attemptsRef.current -= 1
    }
  }, [coordinates, framing])

  // `frameRoute` only returns `none` for an empty or corrupt route, which
  // `HeroRouteMap` already diverts to the indoor panel. Belt and braces: never
  // mount a MapView with no region to give it.
  if (framing.kind === 'none') return null

  return (
    <View
      style={{ flex: 1 }}
      onLayout={(e) => {
        const { width, height: laidOutHeight } = e.nativeEvent.layout
        // The zero-size guard. A fit issued against a zero-area map is dropped
        // on Android with no error, and the camera keeps whatever it had.
        if (width > 0 && laidOutHeight > 0) {
          sizedRef.current = true
          applyCamera()
        }
      }}
    >
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        // The layer that cannot be missed. Every other camera instruction on
        // this screen is an optimisation on top of this one.
        initialRegion={framing.region}
        // The clamp. `maxDelta` would be the direct expression of "no region
        // wider than half a degree", but it is Apple Maps only and does nothing
        // on Android, which is the platform this broke on. `minZoomLevel` is the
        // Android-supported equivalent.
        minZoomLevel={MIN_ZOOM_LEVEL}
        onMapReady={() => {
          readyRef.current = true
          setTilesReady(true)
          applyCamera()
          // One more pass after the current commit settles: on Android the map
          // reports ready a beat before it will accept a camera command that
          // depends on its final size.
          requestAnimationFrame(applyCamera)
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
        {/* A single point has no line to draw, and a Polyline whose ends
            coincide renders as a dot artefact rather than as nothing. */}
        {framing.kind === 'route' ? (
          <Polyline
            coordinates={coordinates}
            strokeColor={COLOR.accent}
            strokeWidth={5}
            lineCap="round"
            lineJoin="round"
          />
        ) : null}

        {/* Dots rather than pins. A map pin is a 40pt teardrop anchored above the
            point it marks, so on a short route the two pins overlap each other
            and the line between them, which is what made this map read as
            "start marker only". A small flat dot sits on the coordinate itself. */}
        <Marker coordinate={coordinates[0]} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={false}>
          <EndpointDot color={COLOR.accent} />
        </Marker>
        {/* Only when there is somewhere else to mark. Stacking a red dot exactly
            on top of the green one is how a stationary session read as a bug. */}
        {framing.kind === 'route' ? (
          <Marker
            coordinate={coordinates[coordinates.length - 1]}
            anchor={{ x: 0.5, y: 0.5 }}
            tracksViewChanges={false}
          >
            <EndpointDot color={COLOR.danger} />
          </Marker>
        ) : null}
      </MapView>

      {/* The map paints flat grey for a beat before tiles arrive. Cover that with
          the page ground so it reads as "loading", not as "broken". */}
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
