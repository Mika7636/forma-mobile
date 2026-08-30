import { type ReactNode } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import CountUp from './CountUp'
import { formatDistance, formatThousands } from '../../utils/formatting'
import { useTheme } from '../../theme/ThemeProvider'
import type { Palette } from '../../theme/tokens'

interface MetricGridProps {
  weeklyLoad: number
  previousWeeklyLoad: number
  weeklyHours: number
  budgetHours: number
  sessionCount: number
  weeklyCalories: number
  weeklyDistanceKm: number
  streak: number
  /** Ms before the first card animates in; each subsequent card follows by 50ms. */
  baseDelay?: number
}


/**
 * Progress-bar colour: accent under budget, amber from 80%, red once over.
 *
 * The *fill* tokens, not the `*Text` ones. This is a bar, not a caption — a
 * 100px block of colour, which is what the vibrant end of the palette is for.
 * It read as olive while it was borrowing the type colours.
 */
function budgetColor(ratio: number, colors: Palette): string {
  if (ratio > 1) return colors.danger
  if (ratio >= 0.8) return colors.warn
  return colors.accent
}

/**
 * The 2×3 stat grid under the Form hero: load, budget, sessions, calories,
 * streak and distance for the current week. Cards fade in on a stagger.
 */
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

  // No prior week logged → there's nothing to compare against, so show the bare
  // number rather than a misleading "up 100%" against an empty baseline.
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
              // Clamp the fill: over-budget is signalled by the red colour, and
              // a bar can't render past its track anyway.
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

/** "6.5h" / "8h" — trims a pointless ".0". */
function formatHours(hours: number): string {
  const rounded = Math.round(hours * 10) / 10
  return Number.isInteger(rounded) ? `${rounded}h` : `${rounded.toFixed(1)}h`
}

/**
 * One stat tile. Lays out as: value block (supplied by the caller, so cards can
 * add a progress bar or trend arrow under the number), then the caption.
 */
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
        // Two per row; `basis` + `grow` lets the pair share the 12px gap and
        // keeps a lone trailing card from stretching oddly on wide screens.
        flexBasis: '47%',
        flexGrow: 1,
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 16,
        borderWidth: 1,
        borderColor: colors.border,
        shadowColor: colors.shadow,
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      {children}
      <Text style={{ marginTop: 3, fontSize: 12, color: colors.textSubtle }} numberOfLines={1}>
        {label}
      </Text>
    </Animated.View>
  )
}

/** Icon + big number on one line — the common shape of most tiles. */
function ValueRow({ icon, children }: { icon?: string; children: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      {icon ? <Text style={{ fontSize: 16, marginRight: 5 }}>{icon}</Text> : null}
      {children}
    </View>
  )
}

/**
 * Built from the palette rather than declared at module scope.
 *
 * A `const styles = { bigNumber: { color: … } }` next to the component would
 * capture whichever palette was active when this module was first imported and
 * then never change — the exact way a single screen ends up keeping its old
 * colour after a theme switch.
 */
function makeStyles(colors: Palette) {
  return {
    bigNumber: {
      fontSize: 26,
      fontWeight: '800' as const,
      color: colors.text,
    },
  }
}
