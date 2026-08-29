import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { formatThousands } from '../../utils/formatting'
import type { ProgressStatsData } from '../../utils/progressMetrics'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

interface ProgressStatsProps {
  stats: ProgressStatsData
  /** Ms before the first card animates in; each following card is +40ms. */
  baseDelay?: number
}

/**
 * The 2×3 summary grid at the top of the Progress screen.
 *
 * ## The labels
 *
 * These used to name the model: "avg form score", "current fitness (CTL)". Both
 * are precise and neither is readable — Form is a term of art, and CTL is an
 * acronym for a term of art. The numbers underneath are unchanged; only what
 * they are called is. "Readiness" is what Form actually tells you, and "fitness
 * trend" is what the CTL card was already showing, given it carries the change
 * arrow alongside the value.
 */
export default function ProgressStats({ stats, baseDelay = 40 }: ProgressStatsProps) {
  const { colors } = useTheme()

  const form = stats.avgForm
  const formColor = form > 5 ? colors.accentText : form < -10 ? colors.dangerText : colors.text
  const trendUp = stats.ctlTrend >= 0

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.md }}>
      <StatCard delay={baseDelay} icon="📋" label="sessions" value={String(stats.totalSessions)} />
      <StatCard
        delay={baseDelay + 40}
        icon="⚡"
        label="total load"
        value={formatThousands(stats.totalLoad)}
      />
      <StatCard
        delay={baseDelay + 80}
        icon="🔥"
        label="calories burned"
        value={formatThousands(stats.totalCalories)}
      />
      <StatCard
        delay={baseDelay + 120}
        icon="🎯"
        label="avg readiness"
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
        label="fitness trend"
        value={String(stats.currentCTL)}
        trend={
          <Text
            style={{
              fontSize: TYPE.small,
              fontWeight: WEIGHT.heavy,
              color: trendUp ? colors.accentText : colors.dangerText,
            }}
          >
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
        borderRadius: RADIUS.card,
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
          // Two lines, so "Combat Sports" is a sport rather than "Combat S...".
          // These cards are a third of a phone wide and several of the values
          // are multi-word.
          numberOfLines={2}
          style={{
            fontSize: small ? TYPE.body : TYPE.heading,
            lineHeight: small ? 18 : 26,
            fontWeight: WEIGHT.heavy,
            // `valueColor` is only passed for readiness. Without the fallback
            // the rest inherited React Native's default ink — black — which was
            // invisible on the dark theme.
            color: valueColor ?? colors.text,
            flexShrink: 1,
          }}
        >
          {value}
        </Text>
      </View>
      {trend ? <View style={{ marginTop: 2 }}>{trend}</View> : null}
      <Text
        // Also two lines and a step smaller: at 11pt on a third-width card
        // "calories burned" truncated mid-word, which reads as a layout fault
        // rather than as a label.
        numberOfLines={2}
        style={{ marginTop: 3, fontSize: TYPE.caption, lineHeight: 14, color: colors.textSubtle }}
      >
        {label}
      </Text>
    </Animated.View>
  )
}
