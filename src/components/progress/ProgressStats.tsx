import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatThousands } from '../../utils/formatting'
import type { ProgressStatsData } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'


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
  const { colors } = useTheme()

  const form = stats.avgForm
  const formColor = form > 5 ? colors.accentText : form < -10 ? colors.dangerText : colors.text
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
          <Text style={{ fontSize: 13, fontWeight: '800', color: trendUp ? colors.accentText : colors.dangerText }}>
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
  valueColor,
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
  const { colors } = useTheme()

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(320)}
      style={{
        flexBasis: '30%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 14,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
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
      <Text style={{ marginTop: 3, fontSize: 11, color: colors.textSubtle }} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  )
}
