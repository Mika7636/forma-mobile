import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { COLORS } from '../../constants/theme'
import { formatThousands } from '../../utils/formatting'
import type { ProgressStatsData } from '../../utils/progressMetrics'

const TREND_UP = COLORS.teal
const TREND_DOWN = COLORS.danger

interface ProgressStatsProps {
  stats: ProgressStatsData
  /** Ms before the first card animates in; each following card is +40ms. */
  baseDelay?: number
}

/**
 * The 2×3 summary grid at the top of the Progress screen: totals for the
 * selected range plus the current-fitness trend. Mirrors the dashboard's
 * MetricGrid styling so the two screens feel like one product.
 */
export default function ProgressStats({ stats, baseDelay = 40 }: ProgressStatsProps) {
  const form = stats.avgForm
  const formColor = form > 5 ? TREND_UP : form < -10 ? TREND_DOWN : COLORS.ink
  const trendUp = stats.ctlTrend >= 0

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <StatCard delay={baseDelay} icon="📋" label="sessions" value={String(stats.totalSessions)} />
      <StatCard
        delay={baseDelay + 40}
        icon="⚡"
        label="total load (AU)"
        value={formatThousands(stats.totalLoad)}
      />
      <StatCard
        delay={baseDelay + 80}
        icon="🔥"
        label="est. calories (kcal)"
        value={formatThousands(stats.totalCalories)}
      />
      <StatCard
        delay={baseDelay + 120}
        icon="🎯"
        label="avg form score"
        value={`${form > 0 ? '+' : ''}${form}`}
        valueColor={formColor}
      />
      <StatCard
        delay={baseDelay + 160}
        icon={stats.topSport?.icon ?? '🏅'}
        label="top sport"
        value={stats.topSport?.label ?? '—'}
        small
      />
      <StatCard
        delay={baseDelay + 200}
        icon="💪"
        label="current fitness (CTL)"
        value={String(stats.currentCTL)}
        trend={
          <Text style={{ fontSize: 13, fontWeight: '800', color: trendUp ? TREND_UP : TREND_DOWN }}>
            {trendUp ? '↑' : '↓'} {Math.abs(stats.ctlTrend)}
          </Text>
        }
      />
    </View>
  )
}

function StatCard({
  icon,
  value,
  label,
  delay,
  valueColor = COLORS.ink,
  small = false,
  trend,
}: {
  icon: string
  value: string
  label: string
  delay: number
  valueColor?: string
  /** Render the value smaller (for text values like a sport name). */
  small?: boolean
  trend?: ReactNode
}) {
  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(320)}
      style={{
        flexBasis: '30%',
        flexGrow: 1,
        backgroundColor: COLORS.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: COLORS.border,
        shadowColor: COLORS.shadow,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      <Text style={{ fontSize: 17 }}>{icon}</Text>
      <View style={{ flexDirection: 'row', alignItems: 'baseline', marginTop: 8 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: small ? 15 : 22, fontWeight: '800', color: valueColor, flexShrink: 1 }}
        >
          {value}
        </Text>
      </View>
      {trend ? <View style={{ marginTop: 2 }}>{trend}</View> : null}
      <Text style={{ marginTop: 3, fontSize: 11, color: COLORS.subtle }} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  )
}
