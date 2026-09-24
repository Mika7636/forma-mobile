// Static route map, with fallbacks when maps are unavailable.

import { Component, memo, useMemo, type ComponentType, type ReactNode } from 'react'
import { Text, View, type StyleProp, type ViewStyle } from 'react-native'
import { decimateRoute, isValidCoordinate } from '../../utils/geo'
import { MAPS_AVAILABLE, MAPS_UNAVAILABLE_REASON, type MapRegion } from '../../utils/maps'
import type { RoutePoint } from '../../types/session'
import { RADIUS, SPACING, TYPE } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'
const MAX_RENDERED_POINTS = 300

interface RouteMapProps {
  coordinates: RoutePoint[]
  height?: number
  interactive?: boolean
  showMarkers?: boolean
  region?: MapRegion
  dark?: boolean
  style?: StyleProp<ViewStyle>
}

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
  const latDelta = Math.max((maxLat - minLat) * 1.4, 0.0015)
  const lonDelta = Math.max((maxLon - minLon) * 1.4, 0.0015)
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLon + maxLon) / 2,
    latitudeDelta: latDelta,
    longitudeDelta: lonDelta,
  }
}

type MapImpl = ComponentType<{
  points: RoutePoint[]
  targetRegion: MapRegion
  height: number
  interactive: boolean
  showMarkers: boolean
}>

let mapImpl: MapImpl | null = null
let mapImplFailed = false

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
  const { colors } = useTheme()

  return (
    <View
      style={[
        {
          height,
          borderRadius: RADIUS.card,
          overflow: 'hidden',
          backgroundColor: dark ? colors.surfaceAlt : colors.fieldBg,
          borderWidth: 1,
          borderColor: dark ? colors.border : colors.border,
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
  const { colors } = useTheme()

  return (
    <MapShell height={height} style={style} padded dark={dark}>
      <Text style={{ fontSize: 22, marginBottom: 6 }}>{icon}</Text>
      <Text
        style={{
          fontSize: TYPE.small,
          color: dark ? colors.text : colors.textMuted,
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
            color: colors.textSubtle,
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

class MapErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    console.error('[RouteMap] map render failed', error)
  }

  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

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

export default memo(RouteMap)
