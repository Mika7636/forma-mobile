// Full-width hero route map for the finished-workout screen.

import { memo, useMemo, type ComponentType } from 'react'
import { Text, View } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import type { LatLng } from 'react-native-maps'
import { decimateRoute, isValidCoordinate } from '../../utils/geo'
import { MAPS_AVAILABLE } from '../../utils/maps'
import type { RoutePoint } from '../../types/session'
import { RADIUS, SPACING } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const MAX_RENDERED_POINTS = 300

export const HERO_HEIGHT = 240

/** How far the workout title is pulled up over the hero; importers must not restate it. */
export const TITLE_OVERLAP = 24

interface HeroRouteMapProps {
  coordinates: RoutePoint[]
  sportIcon: string
  height?: number
}

type MapImpl = ComponentType<{ coordinates: LatLng[]; height: number }>

let mapImpl: MapImpl | null = null
let mapImplFailed = false

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

function HeroRouteMap({ coordinates, sportIcon, height = HERO_HEIGHT }: HeroRouteMapProps) {
  const { colors } = useTheme()

  const points = useMemo<LatLng[]>(() => {
    const valid = coordinates.filter((p) => p && isValidCoordinate(p.latitude, p.longitude))
    return decimateRoute(valid, MAX_RENDERED_POINTS).map((p) => ({
      latitude: p.latitude,
      longitude: p.longitude,
    }))
  }, [coordinates])

  const Impl = points.length >= 1 && MAPS_AVAILABLE ? getMapImpl() : null

  if (!Impl) {
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
        borderBottomLeftRadius: RADIUS.xl,
        borderBottomRightRadius: RADIUS.xl,
        overflow: 'hidden',
        backgroundColor: colors.surface,
      }}
    >
      <Impl coordinates={points} height={height} />

      <LinearGradient
        pointerEvents="none"
        colors={['transparent', colors.bgFade[0], colors.bgFade[1], colors.bg, colors.bg]}
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
  const { colors } = useTheme()

  return (
    <View
      style={{
        height,
        borderBottomLeftRadius: RADIUS.xl,
        borderBottomRightRadius: RADIUS.xl,
        backgroundColor: colors.surface,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: SPACING.xl,
      }}
    >
      <Text style={{ fontSize: 56 }}>{icon}</Text>
      <Text
        style={{
          marginTop: SPACING.md,
          fontSize: 18,
          fontWeight: '700',
          color: colors.text,
        }}
      >
        {title}
      </Text>
      <Text
        style={{
          marginTop: SPACING.xs,
          fontSize: 13,
          color: colors.textMuted,
          textAlign: 'center',
          lineHeight: 19,
        }}
      >
        {subtitle}
      </Text>
    </View>
  )
}

export default memo(HeroRouteMap)
