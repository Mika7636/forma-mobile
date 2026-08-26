import { memo, useMemo, type ComponentType } from 'react'
import { Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { LatLng } from 'react-native-maps'
import { COLOR, RADIUS_T, SPACE } from '../../theme/tokens'
import { decimateRoute, isValidCoordinate } from '../../utils/geo'
import { MAPS_AVAILABLE } from '../../utils/maps'
import type { RoutePoint } from '../../types/session'

/** Ceiling on points handed to the native Polyline; a phone can't resolve more. */
const MAX_RENDERED_POINTS = 300

export const HERO_HEIGHT = 240

/**
 * How far the workout title is pulled up over the bottom of the hero.
 *
 * Exported because the gradient scrim below has to be opaque for at least this
 * many points, and the two numbers living in separate files is how the title
 * ended up sitting on bare map imagery. Anything that overlaps the hero must
 * import this rather than restating it.
 */
export const TITLE_OVERLAP = 24

interface HeroRouteMapProps {
  coordinates: RoutePoint[]
  /** Emoji for the indoor panel, e.g. 🏃. */
  sportIcon: string
  height?: number
}

/* ---- Lazy access to the map implementation ------------------------- */

type MapImpl = ComponentType<{ coordinates: LatLng[]; height: number }>

let mapImpl: MapImpl | null = null
let mapImplFailed = false

/**
 * Load the map view (and with it `react-native-maps`) on first use, never at
 * module scope. On a build with no Google Maps API key, *evaluating* the module
 * registers the native view manager on devices we have specifically decided not
 * to show a map on — see `utils/maps.ts` for why that is a process-killer rather
 * than a cosmetic problem.
 */
function getMapImpl(): MapImpl | null {
  if (mapImpl || mapImplFailed) return mapImpl
  try {
    mapImpl = require('./HeroRouteMapView').default as MapImpl
  } catch (err) {
    mapImplFailed = true
    console.warn('[HeroRouteMap] map module unavailable', err)
  }
  return mapImpl
}

/**
 * The full-bleed hero at the top of the finished-workout screen.
 *
 * Three states, all exactly {@link HERO_HEIGHT} tall so the title that overlaps
 * its bottom edge never moves:
 *
 * 1. **A route** — dark map, green line, endpoint dots, gradient into the page.
 * 2. **No route** — an indoor panel. Not an error: an indoor session is a real
 *    session, and its training load is unaffected, so this reads as a statement
 *    of fact rather than as a missing map.
 * 3. **No map available on this build** — the same panel, different copy.
 */
function HeroRouteMap({ coordinates, sportIcon, height = HERO_HEIGHT }: HeroRouteMapProps) {
  // Stripped to bare LatLng before it crosses the bridge. `RoutePoint` carries a
  // timestamp and sometimes an altitude, and there is no reason to re-serialise
  // either of those for every point on every render of a Polyline.
  const points = useMemo<LatLng[]>(() => {
    const valid = coordinates.filter((p) => p && isValidCoordinate(p.latitude, p.longitude))
    return decimateRoute(valid, MAX_RENDERED_POINTS).map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }))
  }, [coordinates])

  // One point is enough to draw a map.
  //
  // This used to demand two, which quietly made "we recorded a single fix" and
  // "we recorded nothing at all" the same case. They are not: a ten-second
  // session on a treadmill and a ten-second session standing at the end of the
  // driveway deserve different screens, and the second one has a perfectly good
  // answer to *where were you*. `HeroRouteMapView` handles the framing — a lone
  // point gets a fixed ~300 m region rather than a fit.
  const Impl = points.length >= 1 && MAPS_AVAILABLE ? getMapImpl() : null

  if (!Impl) {
    // No coordinates at all, or a build with no map available. Either way there
    // is nothing to point a camera at, so no MapView is mounted — mounting one
    // with nothing to frame is precisely how this screen ended up showing the
    // whole world.
    const mapMissing = points.length >= 1
    return (
      <IndoorHero
        height={height}
        icon={sportIcon}
        title={mapMissing ? 'Route map unavailable' : 'Indoor session'}
        subtitle={
          mapMissing
            ? 'Your route was recorded and saved.'
            : 'No GPS route — your time and training load are recorded.'
        }
      />
    )
  }

  return (
    <View
      style={{
        height,
        borderBottomLeftRadius: RADIUS_T.lg,
        borderBottomRightRadius: RADIUS_T.lg,
        overflow: 'hidden',
        backgroundColor: COLOR.surface,
      }}
    >
      <Impl coordinates={points} height={height} />

      {/* Fades the map into the page, and — more importantly — puts something
          readable behind the workout title, which is pulled up over this edge by
          {@link TITLE_OVERLAP}.

          The previous ramp reached the page ground only at its very last pixel,
          so the title was effectively sitting on live map imagery: white text
          over whatever happened to be down there, which on a pale road or a
          river was unreadable outdoors. This one lands on solid ground with room
          to spare and holds it, so the overlap band is opaque rather than
          nearly-opaque.

          Bottom 60% of the hero, of which the last ~22% (≈32pt against the 24pt
          overlap) is the page ground exactly. */}
      <LinearGradient
        pointerEvents="none"
        colors={[
          'transparent',
          'rgba(11,18,32,0.50)',
          'rgba(11,18,32,0.92)',
          COLOR.bg,
          COLOR.bg,
        ]}
        locations={[0, 0.3, 0.6, 0.78, 1]}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: height * 0.6,
        }}
      />
    </View>
  )
}

function IndoorHero({
  height,
  icon,
  title,
  subtitle,
}: {
  height: number
  icon: string
  title: string
  subtitle: string
}) {
  return (
    <View
      style={{
        height,
        borderBottomLeftRadius: RADIUS_T.lg,
        borderBottomRightRadius: RADIUS_T.lg,
        backgroundColor: COLOR.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACE.xl,
      }}
    >
      <Text style={{ fontSize: 56 }}>{icon}</Text>
      <Text
        style={{
          marginTop: SPACE.md,
          fontSize: 18,
          fontWeight: '700',
          color: COLOR.text,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: SPACE.xs,
          fontSize: 13,
          color: COLOR.textMuted,
          textAlign: 'center',
          lineHeight: 19,
        }}
      >
        {subtitle}
      </Text>
    </View>
  )
}

/** Memoised: the summary re-renders on every RPE tap and every keystroke in notes. */
export default memo(HeroRouteMap)
