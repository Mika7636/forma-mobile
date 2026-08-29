import { useMemo } from 'react'
import { View } from 'react-native'
import Svg, { Polyline } from 'react-native-svg'
import type { RoutePoint } from '../../types/session'
import { useTheme } from '../../theme/ThemeProvider'

interface RouteThumbnailProps {
  coordinates: RoutePoint[]
  width?: number
  height?: number
}

const PADDING = 2

/**
 * A tiny sparkline-style preview of a GPS route.
 *
 * Deliberately an SVG polyline rather than a real {@link RouteMap}: an activity
 * list can hold half a dozen of these, and that many live MapViews would cost
 * tiles, memory and scroll smoothness for a 40px decoration. This just needs to
 * convey the *shape* of the run.
 */
export default function RouteThumbnail({
  coordinates,
  width = 46,
  height = 34,
}: RouteThumbnailProps) {
  const { colors } = useTheme()

  const points = useMemo(() => {
    if (coordinates.length < 2) return null

    let minLat = coordinates[0].latitude
    let maxLat = coordinates[0].latitude
    let minLon = coordinates[0].longitude
    let maxLon = coordinates[0].longitude
    for (const p of coordinates) {
      minLat = Math.min(minLat, p.latitude)
      maxLat = Math.max(maxLat, p.latitude)
      minLon = Math.min(minLon, p.longitude)
      maxLon = Math.max(maxLon, p.longitude)
    }

    const spanLat = maxLat - minLat
    const spanLon = maxLon - minLon
    const innerW = width - PADDING * 2
    const innerH = height - PADDING * 2

    // An axis with (near) no spread can't be scaled — a short or stationary
    // GPS trace has one. Pin those to the middle of the box rather than
    // dividing by ~0, which would slam every point against the left/top edge.
    const norm = (value: number, min: number, span: number) =>
      span > 1e-9 ? (value - min) / span : 0.5

    // Axes are scaled independently — the shape stretches to fill the box. Fine
    // for a glanceable thumbnail; a real map is one tap away.
    return coordinates
      .map((p) => {
        const x = PADDING + norm(p.longitude, minLon, spanLon) * innerW
        // Latitude grows north, SVG y grows down — invert so north is up.
        const y = PADDING + (1 - norm(p.latitude, minLat, spanLat)) * innerH
        return `${x.toFixed(1)},${y.toFixed(1)}`
      })
      .join(' ')
  }, [coordinates, width, height])

  if (!points) return null

  return (
    <View
      style={{
        width,
        height,
        borderRadius: 8,
        backgroundColor: colors.accentSoft,
        overflow: 'hidden',
      }}
    >
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={colors.accent}
          strokeWidth={1.8}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      </Svg>
    </View>
  )
}
