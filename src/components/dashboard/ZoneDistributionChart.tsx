import { useMemo } from 'react'
import { Text, View } from 'react-native'
import { HR_ZONES } from '../../algorithms/heartRate'
import { COLORS } from '../../constants/theme'
import { formatZoneMinutes } from '../../utils/formatting'
import type { Session } from '../../types/session'

interface ZoneDistributionChartProps {
  /** Sessions from the last 7 days. */
  weekSessions: Session[]
}

interface ZoneTotal {
  zone: number
  name: string
  color: string
  minutes: number
  percent: number
}

/**
 * Horizontal stacked bar of time spent in each HR zone this week. Each session
 * contributes its whole duration to its single estimated zone. Colours come
 * from HR_ZONES so they match the session rows and the log preview.
 */
export default function ZoneDistributionChart({ weekSessions }: ZoneDistributionChartProps) {
  const { totals, totalMinutes } = useMemo(() => {
    const minutesByZone = new Map<number, number>()
    for (const session of weekSessions) {
      const zone = session.estimatedHRZone?.zone
      // Sessions logged before HR estimates existed have no zone — skip them
      // rather than bucketing them into a wrong zone.
      if (zone == null) continue
      minutesByZone.set(zone, (minutesByZone.get(zone) ?? 0) + session.durationMinutes)
    }

    const total = Array.from(minutesByZone.values()).reduce((sum, m) => sum + m, 0)
    const zoneTotals: ZoneTotal[] = HR_ZONES.map((z) => {
      const minutes = minutesByZone.get(z.zone) ?? 0
      return {
        zone: z.zone,
        name: z.name,
        color: z.color,
        minutes,
        percent: total > 0 ? (minutes / total) * 100 : 0,
      }
    })
    return { totals: zoneTotals, totalMinutes: total }
  }, [weekSessions])

  const insight = useMemo(() => {
    if (totalMinutes === 0) return null
    const highPct = totals.filter((t) => t.zone >= 4).reduce((sum, t) => sum + t.percent, 0)
    const lowPct = totals.filter((t) => t.zone <= 2).reduce((sum, t) => sum + t.percent, 0)
    if (highPct > 40) return 'High intensity week — make sure to recover.'
    if (lowPct > 60) return 'Great endurance base — consider a tempo session.'
    return 'Well-distributed training intensity.'
  }, [totals, totalMinutes])

  return (
    <View style={card}>
      <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.ink }}>
        Training Zones This Week
      </Text>

      {totalMinutes === 0 ? (
        <View
          style={{
            marginTop: 14,
            alignItems: 'center',
            paddingVertical: 26,
            borderRadius: 12,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: COLORS.border,
            backgroundColor: COLORS.fieldBg,
          }}
        >
          <Text style={{ fontSize: 22 }}>💓</Text>
          <Text style={{ marginTop: 6, fontSize: 13, fontWeight: '700', color: COLORS.body }}>
            No sessions this week
          </Text>
          <Text
            style={{
              marginTop: 2,
              fontSize: 11.5,
              color: COLORS.subtle,
              textAlign: 'center',
              paddingHorizontal: 24,
            }}
          >
            Log a workout and we&apos;ll map your time across heart-rate zones here.
          </Text>
        </View>
      ) : (
        <>
          {/* Stacked bar */}
          <View
            accessibilityRole="image"
            accessibilityLabel={`Time in each heart-rate zone this week: ${totals
              .filter((t) => t.minutes > 0)
              .map((t) => `Zone ${t.zone} ${formatZoneMinutes(t.minutes)}`)
              .join(', ')}`}
            style={{
              flexDirection: 'row',
              height: 20,
              marginTop: 16,
              borderRadius: 999,
              overflow: 'hidden',
              backgroundColor: COLORS.border,
            }}
          >
            {totals.map((t) =>
              t.minutes > 0 ? (
                <View
                  key={t.zone}
                  style={{ width: `${t.percent}%`, backgroundColor: t.color }}
                />
              ) : null,
            )}
          </View>

          {/* Per-zone legend with minutes */}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginTop: 14, gap: 12 }}>
            {totals.map((t) => (
              <View key={t.zone} style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View
                  style={{
                    width: 9,
                    height: 9,
                    borderRadius: 5,
                    backgroundColor: t.color,
                    marginRight: 5,
                  }}
                />
                <Text style={{ fontSize: 12, color: COLORS.muted }}>
                  Z{t.zone}:{' '}
                  <Text style={{ fontWeight: '700', color: COLORS.body }}>
                    {formatZoneMinutes(t.minutes)}
                  </Text>
                </Text>
              </View>
            ))}
          </View>

          {insight ? (
            <Text
              style={{
                marginTop: 14,
                backgroundColor: COLORS.tealSoft,
                color: COLORS.tealDark,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 9,
                fontSize: 12,
                fontWeight: '600',
                overflow: 'hidden',
              }}
            >
              {insight}
            </Text>
          ) : null}
        </>
      )}
    </View>
  )
}

const card = {
  backgroundColor: COLORS.white,
  borderRadius: 16,
  borderWidth: 1,
  borderColor: COLORS.border,
  padding: 16,
  shadowColor: '#000',
  shadowOpacity: 0.05,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 3 },
  elevation: 2,
} as const
