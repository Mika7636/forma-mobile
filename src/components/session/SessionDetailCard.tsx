import { Text, View } from 'react-native'
import RouteMap from './RouteMap'
import { COLORS } from '../../constants/theme'
import { SPORT_OPTIONS } from '../../constants/training'
import type { Session } from '../../types/session'

/**
 * Read-only detail for a single (past) session. If the session was live-tracked
 * and has `routeCoordinates`, a static route map is drawn above the stats;
 * quick-logged sessions just show the stats. Drop this into a session-detail
 * screen once a session list exists to open one.
 */
export default function SessionDetailCard({ session }: { session: Session }) {
  const option = SPORT_OPTIONS.find((o) => o.value === session.sport)
  const hasRoute =
    Array.isArray(session.routeCoordinates) && session.routeCoordinates.length > 1

  // Prefer the live-tracked pace/speed; fall back to the generic `pace` string.
  const paceValue =
    session.averageSpeed != null
      ? `${session.averageSpeed.toFixed(1)} km/h`
      : session.averagePace ?? session.pace ?? '—'

  const date = new Date(session.date)
  const dateLabel = date.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })

  return (
    <View style={{ padding: 20 }}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 34, marginRight: 12 }}>{option?.icon ?? '🏅'}</Text>
        <View>
          <Text style={{ fontSize: 22, fontWeight: '800', color: COLORS.ink }}>
            {option?.label ?? session.sport}
          </Text>
          <Text style={{ fontSize: 14, color: COLORS.muted }}>
            {dateLabel}
            {session.trackingMode === 'live' ? '  ·  📍 Live tracked' : ''}
          </Text>
        </View>
      </View>

      {/* Route map — only when we have GPS breadcrumbs */}
      {hasRoute ? (
        <View style={{ marginTop: 16 }}>
          <RouteMap coordinates={session.routeCoordinates!} height={220} showMarkers />
        </View>
      ) : null}

      {/* Stats */}
      <View
        style={{
          marginTop: 16,
          flexDirection: 'row',
          flexWrap: 'wrap',
          borderRadius: 16,
          borderWidth: 1,
          borderColor: COLORS.border,
          backgroundColor: COLORS.fieldBg,
          paddingVertical: 6,
          paddingHorizontal: 12,
        }}
      >
        <DetailStat label="Duration" value={`${session.durationMinutes} min`} />
        {session.distanceKm != null ? (
          <DetailStat label="Distance" value={`${session.distanceKm.toFixed(2)} km`} />
        ) : null}
        {paceValue !== '—' ? (
          <DetailStat
            label={session.averageSpeed != null ? 'Avg Speed' : 'Avg Pace'}
            value={paceValue}
          />
        ) : null}
        <DetailStat label="RPE" value={`${session.rpe} / 10`} />
        <DetailStat label="Load" value={`${session.loadScore} AU`} />
        {session.estimatedCalories != null ? (
          <DetailStat label="Calories" value={`🔥 ${session.estimatedCalories} kcal`} />
        ) : null}
      </View>

      {session.notes ? (
        <View style={{ marginTop: 16 }}>
          <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 }}>
            NOTES
          </Text>
          <Text style={{ marginTop: 6, fontSize: 15, color: COLORS.body, lineHeight: 21 }}>
            {session.notes}
          </Text>
        </View>
      ) : null}
    </View>
  )
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ width: '50%', paddingVertical: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.muted, letterSpacing: 0.5 }}>
        {label.toUpperCase()}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 18, fontWeight: '800', color: COLORS.ink }}>
        {value}
      </Text>
    </View>
  )
}
