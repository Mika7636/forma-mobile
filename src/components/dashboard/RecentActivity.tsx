import { useState } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import RouteThumbnail from './RouteThumbnail'
import { hrZoneColor } from '../../algorithms/heartRate'
import { COLORS } from '../../constants/theme'
import { formatTimeAgo } from '../../utils/formatting'
import { SPORT_META } from '../../utils/sportMeta'
import type { Session } from '../../types/session'

/** How many sessions the dashboard surfaces; the rest live on Progress. */
const MAX_ROWS = 7

interface RecentActivityProps {
  /** Sessions newest-first; only the first {@link MAX_ROWS} are shown. */
  sessions: Session[]
  onSelect: (session: Session) => void
  baseDelay?: number
}

/**
 * The dashboard's activity feed — the most recent sessions with their load,
 * calories and HR zone at a glance.
 */
export default function RecentActivity({
  sessions,
  onSelect,
  baseDelay = 0,
}: RecentActivityProps) {
  const rows = sessions.slice(0, MAX_ROWS)

  return (
    <View>
      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.ink, marginBottom: 10 }}>
        Recent Activity
      </Text>

      <View style={{ gap: 8 }}>
        {/*
          Plain map rather than a FlatList: this list is capped at 7 rows and
          lives inside the dashboard's ScrollView, where a nested VirtualizedList
          scrolling the same axis breaks virtualisation and warns at runtime.
          There's nothing to virtualise at this size anyway.
        */}
        {rows.map((session, index) => (
          <SessionRow
            key={session.id}
            session={session}
            delay={baseDelay + index * 50}
            onPress={() => onSelect(session)}
          />
        ))}
      </View>
    </View>
  )
}

function SessionRow({
  session,
  delay,
  onPress,
}: {
  session: Session
  delay: number
  onPress: () => void
}) {
  const meta = SPORT_META[session.sport] ?? {
    label: session.sport,
    icon: '🏅',
    color: COLORS.muted,
  }
  const zone = session.estimatedHRZone?.zone
  const isLive = session.trackingMode === 'live'
  const route = session.routeCoordinates

  const metaLine = [
    `${session.durationMinutes} min`,
    `RPE ${session.rpe}`,
    formatTimeAgo(session.date),
  ].join(' · ')

  // Press feedback via state rather than Pressable's `style={({pressed}) => …}`
  // callback: this project sets jsxImportSource: 'nativewind', and NativeWind's
  // wrapper only understands an object/array style — handed a function it drops
  // the styles entirely, which silently collapses the row's layout.
  const [pressed, setPressed] = useState(false)

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(300)}>
      <Pressable
        onPress={onPress}
        onPressIn={() => setPressed(true)}
        onPressOut={() => setPressed(false)}
        accessibilityRole="button"
        accessibilityLabel={`${meta.label}, ${metaLine}`}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: pressed ? COLORS.fieldBg : COLORS.white,
          borderRadius: 14,
          borderWidth: 1,
          borderColor: COLORS.border,
          padding: 12,
        }}
      >
        {/* Sport emoji in a tinted circle. */}
        <View
          style={{
            width: 42,
            height: 42,
            borderRadius: 21,
            // 1A ≈ 10% alpha — a soft wash of the sport's own colour.
            backgroundColor: `${meta.color}1A`,
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 20 }}>{meta.icon}</Text>
        </View>

        {/* Sport + meta line. */}
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Text style={{ fontSize: 14.5, fontWeight: '700', color: COLORS.ink }} numberOfLines={1}>
              {meta.label}
            </Text>
            {isLive ? (
              <Text
                style={{ fontSize: 11, marginLeft: 5 }}
                accessibilityLabel="GPS tracked"
              >
                📍
              </Text>
            ) : null}
          </View>
          <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.subtle }} numberOfLines={1}>
            {metaLine}
          </Text>
        </View>

        {route && route.length > 1 ? (
          <RouteThumbnail coordinates={route} />
        ) : null}

        {/* Load / calories / zone. */}
        <View style={{ alignItems: 'flex-end', marginLeft: 10 }}>
          <Text style={{ fontSize: 13.5, fontWeight: '800', color: COLORS.ink }}>
            {session.loadScore} AU
          </Text>
          {session.estimatedCalories != null ? (
            <Text style={{ fontSize: 11.5, color: COLORS.muted, marginTop: 1 }}>
              {session.estimatedCalories} kcal
            </Text>
          ) : null}
          {zone != null ? (
            <View
              style={{
                marginTop: 3,
                backgroundColor: hrZoneColor(zone),
                borderRadius: 999,
                paddingHorizontal: 7,
                paddingVertical: 2,
              }}
            >
              <Text style={{ fontSize: 10, fontWeight: '800', color: COLORS.white }}>
                Z{zone}
              </Text>
            </View>
          ) : null}
        </View>
      </Pressable>
    </Animated.View>
  )
}
