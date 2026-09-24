// Resolution chips under a planned-conflict warning.

import { useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'
import PressableScale from '../ui/PressableScale'
import TabIcon from '../ui/TabIcon'
import {
  RECOMMENDER_MIN_TRAINING_DAYS,
  suggestConflictResolution,
  type RecommenderMetrics,
  type RecommenderProfile,
  type Resolution,
} from '../../algorithms/recommender'
import { countTrainingDays } from '../../utils/calibration'
import { weekdayLabel } from '../../utils/dates'
import { sportVisual } from '../../utils/sportMeta'
import type { PlannedSession } from '../../types/planned'
import type { Session } from '../../types/session'
import type { PlannedSessionChanges } from '../../services/plannedSessionService'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export interface ConflictResolutionChipsProps {
  target: PlannedSession
  partner: PlannedSession | null
  sessions: Session[]
  profile: RecommenderProfile
  metrics: RecommenderMetrics
  onApply: (target: PlannedSession, changes: PlannedSessionChanges) => Promise<boolean>
}

function planAsSession(plan: PlannedSession): Session {
  return {
    id: `planned:${plan.id}`,
    userId: plan.userId,
    sport: plan.sport,
    date: `${plan.date}T12:00:00`,
    durationMinutes: plan.durationMinutes,
    rpe: plan.intensity,
    loadScore: plan.durationMinutes * plan.intensity,
    createdAt: plan.createdAt,
  }
}

export default function ConflictResolutionChips({
  target,
  partner,
  sessions,
  profile,
  metrics,
  onApply,
}: ConflictResolutionChipsProps) {
  const { colors } = useTheme()

  const [applied, setApplied] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  const enoughHistory = useMemo(
    () => countTrainingDays(sessions) >= RECOMMENDER_MIN_TRAINING_DAYS,
    [sessions],
  )

  const resolutions = useMemo<Resolution[]>(() => {
    if (!enoughHistory) return []
    return suggestConflictResolution(
      {
        sport: target.sport,
        date: target.date,
        intensity: target.intensity,
        durationMinutes: target.durationMinutes,
      },
      {
        sessions: partner ? [...sessions, planAsSession(partner)] : sessions,
        profile,
        metrics,
        now: new Date(),
      },
    )
  }, [enoughHistory, target, partner, sessions, profile, metrics])

  const usable = resolutions.filter(
    (r): r is Extract<Resolution, { kind: 'reschedule' | 'substitute' }> =>
      r.kind === 'reschedule' || r.kind === 'substitute',
  )

  if (usable.length === 0) return null

  const handle = async (resolution: Extract<Resolution, { kind: 'reschedule' | 'substitute' }>) => {
    const key = chipKey(resolution)
    if (pending || applied) return
    setPending(key)
    const changes: PlannedSessionChanges =
      resolution.kind === 'reschedule'
        ? { date: resolution.date }
        : {
            sport: resolution.sport,
            durationMinutes: resolution.durationMinutes,
            intensity: resolution.rpe,
          }
    const ok = await onApply(target, changes)
    setPending(null)
    if (ok) setApplied(key)
  }

  return (
    <View style={{ marginTop: SPACING.md }}>
      <Text
        style={{
          fontSize: TYPE.caption,
          fontWeight: WEIGHT.heavy,
          letterSpacing: 0.5,
          color: colors.textMuted,
          marginBottom: SPACING.sm,
        }}
      >
        WAYS OUT
      </Text>

      <View style={{ gap: SPACING.sm }}>
        {usable.map((resolution) => (
          <ResolutionChip
            key={chipKey(resolution)}
            resolution={resolution}
            state={
              applied === chipKey(resolution)
                ? 'applied'
                : applied
                  ? 'superseded'
                  : pending === chipKey(resolution)
                    ? 'pending'
                    : 'idle'
            }
            onPress={() => void handle(resolution)}
          />
        ))}
      </View>
    </View>
  )
}

function chipKey(resolution: Extract<Resolution, { kind: 'reschedule' | 'substitute' }>): string {
  return resolution.kind === 'reschedule'
    ? `reschedule:${resolution.date}`
    : `substitute:${resolution.sport}`
}

type ChipState = 'idle' | 'pending' | 'applied' | 'superseded'

function ResolutionChip({
  resolution,
  state,
  onPress,
}: {
  resolution: Extract<Resolution, { kind: 'reschedule' | 'substitute' }>
  state: ChipState
  onPress: () => void
}) {
  const { colors } = useTheme()

  const reschedule = resolution.kind === 'reschedule'
  const label = reschedule
    ? `Move to ${weekdayLabel(resolution.date)}`
    : `${sportVisual(resolution.sport, colors).label} instead`
  const confirmed = reschedule
    ? `Moved to ${weekdayLabel(resolution.date)}`
    : `Swapped to ${sportVisual(resolution.sport, colors).label}`

  const applied = state === 'applied'
  const disabled = state !== 'idle'

  return (
    <PressableScale
      onPress={onPress}
      haptic="medium"
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={applied ? confirmed : `${label}. ${resolution.reason}`}
      style={{
        paddingHorizontal: SPACING.md,
        paddingVertical: SPACING.sm + 2,
        borderRadius: RADIUS.md,
        backgroundColor: applied ? colors.accentSoft : colors.surfaceAlt,
        borderWidth: 1,
        borderColor: applied ? colors.accentBorder : colors.border,
        opacity: state === 'superseded' ? 0.45 : state === 'pending' ? 0.6 : 1,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <TabIcon
          name={applied ? 'check-circle' : reschedule ? 'calendar' : 'activity'}
          size={15}
          color={applied ? colors.accentText : colors.textMuted}
          focused={applied}
        />
        <Text
          style={{
            marginLeft: SPACING.sm,
            flex: 1,
            fontSize: TYPE.small,
            fontWeight: WEIGHT.heavy,
            color: applied ? colors.accentText : colors.text,
          }}
        >
          {state === 'pending' ? 'Applying…' : applied ? confirmed : label}
        </Text>
      </View>

      {!applied ? (
        <Text
          style={{
            marginTop: 4,
            marginLeft: 15 + SPACING.sm,
            fontSize: TYPE.caption,
            lineHeight: 16,
            color: colors.textMuted,
          }}
        >
          {resolution.reason}
        </Text>
      ) : (
        <Animated.Text
          entering={FadeIn.duration(160)}
          style={{
            marginTop: 4,
            marginLeft: 15 + SPACING.sm,
            fontSize: TYPE.caption,
            lineHeight: 16,
            color: colors.textMuted,
          }}
        >
          Your plan is updated. This warning clears as the calendar refreshes.
        </Animated.Text>
      )}
    </PressableScale>
  )
}
