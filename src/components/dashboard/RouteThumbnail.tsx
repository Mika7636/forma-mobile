// Tiny SVG preview of a GPS route.

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

    const norm = (value: number, min: number, span: number) =>
      span > 1e-9 ? (value - min) / span : 0.5

    return coordinates
      .map((p) => {
        const x = PADDING + norm(p.longitude, minLon, spanLon) * innerW
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
