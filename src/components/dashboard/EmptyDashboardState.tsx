// The Dashboard with nothing logged yet.

import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import PrimaryButton from '../ui/PrimaryButton'
import { plannedSeverityStyle, worstSeverity } from '../../constants/conflictColors'
import { BASELINE_DAYS } from '../../utils/calibration'
import { sportVisual } from '../../utils/sportMeta'
import type { PlannedConflict } from '../../types/conflict'
import type { PlannedSession } from '../../types/planned'
import { MOTION, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface EmptyDashboardStateProps {
  todayPlanned: PlannedSession[]
  plannedConflicts: PlannedConflict[]
  onLogSession: () => void
  onPlanWeek: () => void
}

export default function EmptyDashboardState({
  todayPlanned,
  plannedConflicts,
  onLogSession,
  onPlanWeek,
}: EmptyDashboardStateProps) {
  const { colors } = useTheme()

  return (
    <Animated.View entering={FadeIn.duration(MOTION.base)} style={{ gap: SPACING.base }}>
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: RADIUS.xl,
          borderWidth: 1,
          borderColor: colors.border,
          padding: SPACING.lg - 4,
        }}
      >
        <Text
          style={{
            fontSize: TYPE.caption,
            fontWeight: WEIGHT.heavy,
            letterSpacing: 1.6,
            color: colors.textMuted,
          }}
        >
          FORM SCORE
        </Text>
        <Text
          style={{
            marginTop: SPACING.sm,
            fontSize: TYPE.title,
            fontWeight: WEIGHT.heavy,
            color: colors.text,
          }}
        >
          Unlocks after {BASELINE_DAYS} training days
        </Text>
        <Text
          style={{
            marginTop: 6,
            fontSize: TYPE.body,
            lineHeight: 20,
            color: colors.textMuted,
          }}
        >
          Form is your recent fatigue measured against your long-term fitness — one number
          for whether you&apos;re fresh, building, or digging a hole. Fitness is a{' '}
          {BASELINE_DAYS}-day average, so it needs {BASELINE_DAYS} days you actually trained
          before it says anything real. Rest days don&apos;t count toward it — but backdating
          sessions you already trained does.
        </Text>

        <View style={{ marginTop: SPACING.base }}>
          <PrimaryButton label="Log your first session" onPress={onLogSession} />
        </View>
      </View>

      <AvailableNow
        todayPlanned={todayPlanned}
        plannedConflicts={plannedConflicts}
        onPlanWeek={onPlanWeek}
      />
    </Animated.View>
  )
}

function AvailableNow({
  todayPlanned,
  plannedConflicts,
  onPlanWeek,
}: {
  todayPlanned: PlannedSession[]
  plannedConflicts: PlannedConflict[]
  onPlanWeek: () => void
}) {
  const { colors } = useTheme()

  const clashStyle =
    plannedConflicts.length > 0
      ? plannedSeverityStyle(worstSeverity(plannedConflicts), colors)
      : null

  return (
    <Animated.View
      entering={FadeInDown.delay(90).duration(MOTION.base)}
      style={{
        backgroundColor: colors.surface,
        borderRadius: RADIUS.xl,
        borderWidth: 1,
        borderColor: colors.border,
        padding: SPACING.lg - 4,
      }}
    >
      <Text
        style={{
          fontSize: TYPE.caption,
          fontWeight: WEIGHT.heavy,
          letterSpacing: 1.6,
          color: colors.textMuted,
        }}
      >
        AVAILABLE NOW
      </Text>

      <Text
        style={{
          marginTop: SPACING.md,
          fontSize: TYPE.bodyLg,
          fontWeight: WEIGHT.bold,
          color: colors.text,
        }}
      >
        Today&apos;s plan
      </Text>
      {todayPlanned.length === 0 ? (
        <Text
          style={{ marginTop: 4, fontSize: TYPE.small, lineHeight: 18, color: colors.textMuted }}
        >
          Nothing planned for today. Plans take three taps and are what FORMA checks for
          clashes.
        </Text>
      ) : (
        <View style={{ marginTop: SPACING.sm }}>
          {todayPlanned.map((plan) => {
            const { color, icon, label } = sportVisual(plan.sport, colors)
            return (
              <View
                key={plan.id}
                style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
              >
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    borderWidth: 1.5,
                    borderColor: color,
                    marginRight: SPACING.sm,
                  }}
                />
                <Text style={{ fontSize: TYPE.small, color: colors.textBody }}>
                  {icon} {label} · {plan.durationMinutes} min · RPE {plan.intensity}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      <Text
        style={{
          marginTop: SPACING.base,
          fontSize: TYPE.bodyLg,
          fontWeight: WEIGHT.bold,
          color: colors.text,
        }}
      >
        Conflict detection
      </Text>
      {clashStyle ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            marginTop: SPACING.sm,
            paddingVertical: SPACING.sm,
            paddingHorizontal: SPACING.md,
            borderRadius: RADIUS.md,
            backgroundColor: clashStyle.softBg,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: clashStyle.softBorder,
          }}
        >
          <Text style={{ fontSize: TYPE.body }}>{clashStyle.icon}</Text>
          <Text
            style={{
              flex: 1,
              marginLeft: SPACING.sm,
              fontSize: TYPE.small,
              lineHeight: 18,
              color: colors.textBody,
            }}
          >
            <Text style={{ fontWeight: WEIGHT.heavy, color: clashStyle.deep }}>
              {plannedConflicts.length} planned conflict
              {plannedConflicts.length === 1 ? '' : 's'}
            </Text>{' '}
            in the next couple of days. Open the Planner to see what to move.
          </Text>
        </View>
      ) : (
        <Text
          style={{ marginTop: 4, fontSize: TYPE.small, lineHeight: 18, color: colors.textMuted }}
        >
          Running from day one — no history needed. FORMA checks every session you plan or
          log against the sports you picked and warns you before two hard days collide.
        </Text>
      )}

      <Pressable
        onPress={onPlanWeek}
        accessibilityRole="button"
        style={{
          marginTop: SPACING.base,
          minHeight: 46,
          borderRadius: RADIUS.md,
          borderWidth: 1.5,
          borderColor: colors.accent,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text
          style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.accentText }}
        >
          Plan your week
        </Text>
      </Pressable>
    </Animated.View>
  )
}
