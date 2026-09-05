// Two ways out of a planned clash, as chips under the warning that raised it.
//
// ## Why these sit on *planned* conflicts and not on logged ones
//
// The engine's resolutions are "move it to Thursday" and "swim instead". Both
// are edits to a session that has not happened yet. A logged conflict on the
// dashboard describes training already done — there is no date left to change
// and nothing to substitute — which is exactly why that banner ends in Dismiss
// and this component is not on it.
//
// ## The earlier plan is handed to the engine as a session
//
// `suggestConflictResolution` measures a planned session against
// `context.sessions`, which is logged history. A clash between two *plans* has
// no logged session in it at all, so passed only real history the engine would
// find nothing blocking and cheerfully suggest tomorrow — the very day the
// clash is on.
//
// So the earlier plan is converted into the shape the engine reads and included
// in that array. This is not a trick played on it: the plan is training the
// athlete intends to do, at a stated intensity, on a stated day, and the
// fatigue it will leave is precisely what the later session has to be spaced
// from. The engine takes its inputs from the caller by design, and this is the
// caller describing the situation completely.
//
// The guard is evaluated on **logged** history alone before any of that (see
// `enoughHistory`), so the synthetic session can never be what tips an athlete
// over the engine's fourteen-training-day bar.
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
  /** The plan to change — the later of the clashing pair. */
  target: PlannedSession
  /** The earlier plan, whose fatigue the target has to clear. */
  partner: PlannedSession | null
  /** Logged history. Drives the guard and the engine's constraint checks. */
  sessions: Session[]
  profile: RecommenderProfile
  metrics: RecommenderMetrics
  /** Persist one resolution. Resolves true on success. */
  onApply: (target: PlannedSession, changes: PlannedSessionChanges) => Promise<boolean>
}

/**
 * A plan, in the shape the engine reads history in.
 *
 * Dated at local noon so it lands unambiguously on its own calendar day — a
 * bare `YYYY-MM-DD` parses as UTC midnight, which is the day before for anyone
 * west of Greenwich. The id is prefixed so a blocker traced back to this entry
 * is visibly a plan rather than a session someone cannot find in their log.
 */
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

  /** What was applied, so the chips can confirm rather than silently vanish. */
  const [applied, setApplied] = useState<string | null>(null)
  const [pending, setPending] = useState<string | null>(null)

  // The bar, measured on real training only. Below it the engine would return
  // its insufficient-data state anyway; checking here keeps the synthetic plan
  // below out of a decision it has no business influencing.
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
    // A confirmation state rather than an immediate disappearance. The live
    // listener will drop the clash from the calendar within a frame or two, and
    // a chip row that simply vanished would leave the athlete unsure whether
    // their tap did anything or the sheet just moved under them.
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

/** Stable identity for a chip — the action plus what it changes to. */
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
  // Once one resolution has landed the other describes a session that no longer
  // exists in that form, so it is shown greyed rather than left tappable.
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

      {/* The engine's own sentence, verbatim. It is why this chip resolves the
          clash, and paraphrasing it here would be a second claim that could
          drift from the one the engine can actually defend. */}
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
