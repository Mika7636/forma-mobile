import { Component, memo, useMemo, type ComponentType, type ReactNode } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { COLORS, RADIUS, SPACING, TYPE } from '../../constants/theme'
import { decimateRoute, isValidCoordinate } from '../../utils/geo'
import { MAPS_AVAILABLE, MAPS_UNAVAILABLE_REASON, type MapRegion } from '../../utils/maps'
import type { RoutePoint } from '../../types/session'

/**
 * Ceiling on how many points are handed to the native Polyline. A phone screen
 * cannot resolve more, and every point is re-serialised across the bridge each
 * time the coordinate array changes.
 */
const MAX_RENDERED_POINTS = 300

/** The live tracker's card surface + hairline, so placeholders sit in with it. */
const DARK_SURFACE = '#1F2937'
const DARK_BORDER = '#374151'

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
  region?: MapRegion
  /**
   * Render placeholders for the dark live-tracking surface rather than the light
   * app background. Only affects the non-map states; the map itself is opaque.
   */
  dark?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Compute a map region that frames every point with a little breathing room.
 * Falls back to a wide default when there are no points yet.
 */
function regionForCoordinates(points: RoutePoint[]): MapRegion {
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
  // The floor exists only to stop a single-point route asking for a zero-sized
  // viewport, which the native map rejects. It used to be 0.005° — about 500 m —
  // which quietly broke every short route: a 250 m loop was padded out to a
  // 500 m viewport, drawn ~15 px across, and disappeared underneath the 40 px
  // start pin. That is exactly what "the map shows a marker and no route" was.
  // 0.0015° is ~165 m, small enough that a real route is always the thing
  // setting the zoom.
  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.0015)
  const lonDelta = Math.max((maxLon - minLon) * 1.4, 0.0015)
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  }
}

/* ---- Lazy access to the map implementation ------------------------- */

type MapImpl = ComponentType<{
  points: RoutePoint[]
  targetRegion: MapRegion
  height: number
  interactive: boolean
  showMarkers: boolean
}>

let mapImpl: MapImpl | null = null
let mapImplFailed = false

/**
 * Load `RouteMapView` (and with it `react-native-maps`) on first use, and only
 * once {@link MAPS_AVAILABLE} has said it is safe to. Metro still bundles the
 * module either way, but a static import would *evaluate* it — registering the
 * native map view manager — on every device at startup, including the ones we
 * have specifically decided not to show a map on.
 *
 * Returns null if the require itself throws — e.g. the native module is missing
 * from the binary — so a broken map degrades to the placeholder instead of an
 * unhandled exception on the tracking screen.
 */
function getMapImpl(): MapImpl | null {
  if (mapImpl || mapImplFailed) return mapImpl
  try {
    mapImpl = require('./RouteMapView').default as MapImpl
  } catch (err) {
    mapImplFailed = true
    console.warn('[RouteMap] map module unavailable, falling back to placeholder', err)
  }
  return mapImpl
}

/* ---- Shell + placeholders ------------------------------------------ */

/**
 * The bordered, rounded box every state shares, so the map, the placeholder and
 * the searching state occupy identical space and nothing jumps when the map
 * appears or is skipped.
 */
function MapShell({
  height,
  style,
  padded,
  dark,
  children,
}: {
  height: number
  style?: StyleProp<ViewStyle>
  padded?: boolean
  dark?: boolean
  children: ReactNode
}) {
  return (
    <View
      style={[
        {
          height,
          borderRadius: RADIUS.card,
          overflow: 'hidden',
          backgroundColor: dark ? DARK_SURFACE : COLORS.fieldBg,
          borderWidth: 1,
          borderColor: dark ? DARK_BORDER : COLORS.border,
          ...(padded
            ? { alignItems: 'center' as const, justifyContent: 'center' as const, padding: SPACING.md }
            : null),
        },
        style,
      ]}
    >
      {children}
    </View>
  )
}

/** Shown in place of the map. Always reassures that the workout is unaffected. */
function MapPlaceholder({
  height,
  style,
  icon,
  title,
  subtitle,
  dark,
}: {
  height: number
  style?: StyleProp<ViewStyle>
  icon: string
  title: string
  subtitle?: string
  dark?: boolean
}) {
  return (
    <MapShell height={height} style={style} padded dark={dark}>
      <Text style={{ fontSize: 22, marginBottom: 6 }}>{icon}</Text>
      <Text
        style={{
          fontSize: TYPE.small,
          color: dark ? COLORS.white : COLORS.muted,
          fontWeight: '600',
          textAlign: 'center',
        }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          style={{
            marginTop: 4,
            fontSize: TYPE.caption,
            color: COLORS.subtle,
            textAlign: 'center',
            lineHeight: 15,
          }}
        >
          {subtitle}
        </Text>
      ) : null}
    </MapShell>
  )
}

/* ---- Local error boundary ------------------------------------------ */

/**
 * Contains a render-time failure in the map subtree so it renders a placeholder
 * instead of unmounting the live tracker around it.
 *
 * This is the *second* line of defence, not the first. It catches JS errors
 * thrown while React renders the map; it cannot catch a crash inside the Google
 * Maps SDK, which is why {@link MAPS_AVAILABLE} decides up front whether the map
 * is mounted at all.
 */
class MapErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    // The only trace on-device; this is what `adb logcat` will surface.
    console.error('[RouteMap] map render failed', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/* ---- Public component ---------------------------------------------- */

/**
 * Renders a GPS route as a teal polyline over a map, with optional start/end
 * markers. Shared by {@link LiveTracker} (live, small, follow-cam) and the
 * session-detail view (static, fitted to the full route).
 *
 * The map is strictly **secondary**: this component degrades to a placeholder
 * whenever the map cannot be shown — no Google Maps API key in the build, a
 * missing native module, or a render failure — and the caller keeps working.
 * Live tracking records distance, pace and calories whether or not a map ever
 * draws.
 */
function RouteMap({
  coordinates,
  height = 180,
  interactive = false,
  showMarkers = true,
  region,
  dark = false,
  style,
}: RouteMapProps) {
  const points = useMemo(() => {
    const valid = coordinates.filter((p) => p && isValidCoordinate(p.latitude, p.longitude))
    return decimateRoute(valid, MAX_RENDERED_POINTS)
  }, [coordinates])

  const fittedRegion = useMemo(() => regionForCoordinates(points), [points])
  const targetRegion = region ?? fittedRegion

  // No map on this build/device: say so plainly and never touch the native map
  // module. This is the path that keeps an unkeyed build alive on real hardware.
  if (!MAPS_AVAILABLE) {
    return (
      <MapPlaceholder
        height={height}
        style={style}
        dark={dark}
        icon="🗺️"
        title="Route map unavailable"
        subtitle={
          points.length > 0
            ? 'Your route is still being recorded and saved.'
            : (MAPS_UNAVAILABLE_REASON ?? undefined)
        }
      />
    )
  }

  if (points.length === 0) {
    return (
      <MapPlaceholder
        height={height}
        style={style}
        dark={dark}
        icon="🛰️"
        title="Searching for GPS…"
      />
    )
  }

  const Impl = getMapImpl()
  const fallback = (
    <MapPlaceholder
      height={height}
      style={style}
      dark={dark}
      icon="🗺️"
      title="Route map unavailable"
      subtitle="Your route is still being recorded and saved."
    />
  )
  if (!Impl) return fallback

  return (
    <MapErrorBoundary fallback={fallback}>
      <MapShell height={height} style={style}>
        <Impl
          points={points}
          targetRegion={targetRegion}
          height={height}
          interactive={interactive}
          showMarkers={showMarkers}
        />
      </MapShell>
    </MapErrorBoundary>
  )
}

/**
 * Memoised because its parent (the live tracker) re-renders on the clock tick.
 * Without this, every second of a workout re-rendered the map subtree.
 */
export default memo(RouteMap)
