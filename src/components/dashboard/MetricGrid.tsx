// The stat grid of this week's training figures, under the hero.

import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import CountUp from './CountUp'
import { formatDistance, formatThousands } from '../../utils/formatting'
import { useTheme } from '../../theme/ThemeProvider'
import { RADIUS, SPACING, type Palette } from '../../theme/tokens'

interface MetricGridProps {
  weeklyLoad: number
  previousWeeklyLoad: number
  weeklyHours: number
  budgetHours: number
  sessionCount: number
  weeklyCalories: number
  weeklyDistanceKm: number
  streak: number
  baseDelay?: number
}


function budgetColor(ratio: number, colors: Palette): string {
  if (ratio > 1) return colors.danger
  if (ratio >= 0.8) return colors.warn
  return colors.accent
}

export default function MetricGrid({
  weeklyLoad,
  previousWeeklyLoad,
  weeklyHours,
  budgetHours,
  sessionCount,
  weeklyCalories,
  weeklyDistanceKm,
  streak,
  baseDelay = 60,
}: MetricGridProps) {
  const { colors } = useTheme()

  const hasBaseline = previousWeeklyLoad > 0
  const loadDelta = weeklyLoad - previousWeeklyLoad

  const budgetRatio = budgetHours > 0 ? weeklyHours / budgetHours : 0
  const styles = makeStyles(colors)
  const barColor = budgetColor(budgetRatio, colors)

  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
      <MetricCard delay={baseDelay} label="AU this week">
        <ValueRow>
          <CountUp value={weeklyLoad} format={formatThousands} style={styles.bigNumber} />
        </ValueRow>
        {hasBaseline ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Text
              style={{
                fontSize: 12,
                fontWeight: '800',
                color: loadDelta >= 0 ? colors.accentText : colors.dangerText,
              }}
            >
              {loadDelta >= 0 ? '↑' : '↓'} {formatThousands(Math.abs(loadDelta))}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textSubtle, marginLeft: 4 }}>
              vs last week
            </Text>
          </View>
        ) : null}
      </MetricCard>

      <MetricCard
        delay={baseDelay + 50}
        label={budgetHours > 0 ? `of ${formatHours(budgetHours)} target` : 'no target set'}
      >
        <ValueRow>
          <CountUp value={weeklyHours} format={formatHours} style={styles.bigNumber} />
        </ValueRow>
        <View
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: colors.border,
            overflow: 'hidden',
            marginTop: 8,
          }}
        >
          <View
            style={{
              height: '100%',
              borderRadius: 3,
              backgroundColor: barColor,
              width: `${Math.min(100, budgetRatio * 100)}%`,
            }}
          />
        </View>
      </MetricCard>

      <MetricCard delay={baseDelay + 100} label="sessions this week">
        <ValueRow>
          <CountUp value={sessionCount} style={styles.bigNumber} />
        </ValueRow>
      </MetricCard>

      <MetricCard delay={baseDelay + 150} label="est. kcal this week">
        <ValueRow icon="🔥">
          <CountUp value={weeklyCalories} format={formatThousands} style={styles.bigNumber} />
        </ValueRow>
      </MetricCard>

      <MetricCard delay={baseDelay + 200} label="day streak">
        <ValueRow icon="🔥">
          <CountUp value={streak} style={styles.bigNumber} />
        </ValueRow>
      </MetricCard>

      <MetricCard delay={baseDelay + 250} label="km this week">
        <ValueRow icon="📏">
          <CountUp
            value={weeklyDistanceKm}
            format={formatDistance}
            style={styles.bigNumber}
          />
        </ValueRow>
      </MetricCard>
    </View>
  )
}

function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

function MetricCard({
  label,
  delay,
  children,
}: {
  label: string
  delay: number
  children: ReactNode
}) {
  const { colors } = useTheme()

  return (
    <Animated.View
      entering={FadeInDown.delay(delay).duration(340)}
      style={{
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: RADIUS.lg,
        padding: SPACING.base,
        borderWidth: 1,
        borderColor: colors.border,
        ...colors.shadowCard,
      }}
    >
      {children}
      <Text style={{ marginTop: 3, fontSize: 12, color: colors.textSubtle }} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  )
}

function ValueRow({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon ? <Text style={{ fontSize: 16, marginRight: 5 }}>{icon}</Text> : null}
      {children}
    </View>
  )
}

function makeStyles(colors: Palette) {
  return {
    bigNumber: {
      fontSize: 26,
      fontWeight: '800' as const,
      color: colors.text,
    },
  }
}
