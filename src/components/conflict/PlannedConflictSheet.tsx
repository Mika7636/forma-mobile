// The sheet that explains a planned clash in full.
//
// Deliberately a separate component from `ConflictDetailSheet` rather than a
// `planned` flag on it. The two sheets answer different questions and end in
// different places: a logged conflict's sheet explains training that already
// happened and offers Dismiss, because the only thing left is to acknowledge it.
// This one describes a week that hasn't been trained yet, so there is nothing to
// dismiss and everything to change — it ends with "Change the plan", not "Got
// it". Folding the two together would have meant a Dismiss button that dismissed
// nothing, on a warning that would reappear the moment the sheet closed.
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import ConflictResolutionChips from './ConflictResolutionChips'
import { plannedSeverityStyle } from '../../constants/conflictColors'
import { SPORT_META } from '../../utils/sportMeta'
import type { RecommenderMetrics, RecommenderProfile } from '../../algorithms/recommender'
import type { PlannedConflict } from '../../types/conflict'
import type { PlannedSession } from '../../types/planned'
import type { Session } from '../../types/session'
import type { PlannedSessionChanges } from '../../services/plannedSessionService'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/**
 * What the sheet needs to offer a way out as well as an explanation.
 *
 * Optional as a group: the sheet still works as pure explanation without it,
 * which is what it was before, and a caller that has no write path can leave it
 * off rather than pass a no-op.
 */
export interface PlannedConflictResolutionContext {
  /** Every plan on the calendar, for resolving a conflict's two ids. */
  planned: PlannedSession[]
  /** Logged history — the engine's guard and its constraint checks. */
  sessions: Session[]
  profile: RecommenderProfile
  metrics: RecommenderMetrics
  onApply: (target: PlannedSession, changes: PlannedSessionChanges) => Promise<boolean>
}

interface PlannedConflictSheetProps {
  /** Clashes to explain; the sheet is open while this is non-null. */
  conflicts: PlannedConflict[] | null
  onClose: () => void
  /** Supplied by the Planner, which owns the write path. */
  resolution?: PlannedConflictResolutionContext
}

export default function PlannedConflictSheet({
  conflicts,
  onClose,
  resolution,
}: PlannedConflictSheetProps) {
  const { colors } = useTheme()

  const list = conflicts ?? []

  return (
    <Modal visible={conflicts != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: colors.scrim }} />
      <View
        style={{
          backgroundColor: colors.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: SPACING.lg - 4,
          paddingTop: 14,
          paddingBottom: 34,
          maxHeight: '82%',
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 44,
            height: 5,
            borderRadius: RADIUS.pill,
            backgroundColor: colors.border,
            marginBottom: 14,
          }}
        />
        <Text style={{ fontSize: 19, fontWeight: WEIGHT.heavy, color: colors.text }}>
          Planned conflict{list.length === 1 ? '' : 's'}
        </Text>
        <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
          None of this has happened yet — that&apos;s the point. Move a session and the
          warning goes with it.
        </Text>

        <ScrollView
          style={{ marginTop: 14 }}
          contentContainerStyle={{ paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {/* The caller re-derives `conflicts` from the live calendar, so a clash
              the athlete has just resolved leaves this list on the next
              snapshot. An empty sheet is therefore a *result*, and says so
              rather than sitting blank until it is dismissed. */}
          {list.length === 0 ? (
            <View
              style={{
                paddingVertical: SPACING.lg,
                paddingHorizontal: SPACING.base,
                borderRadius: RADIUS.card,
                backgroundColor: colors.accentSoft,
                borderWidth: 1,
                borderColor: colors.accentBorder,
              }}
            >
              <Text
                style={{
                  fontSize: TYPE.body,
                  fontWeight: WEIGHT.heavy,
                  color: colors.accentText,
                  textAlign: 'center',
                }}
              >
                Clash resolved
              </Text>
              <Text
                style={{
                  marginTop: 4,
                  fontSize: TYPE.small,
                  lineHeight: 18,
                  color: colors.textBody,
                  textAlign: 'center',
                }}
              >
                Your plan no longer stacks those two sessions.
              </Text>
            </View>
          ) : (
            list.map((conflict) => (
              <PlannedConflictCard
                key={conflict.id}
                conflict={conflict}
                resolution={resolution}
              />
            ))
          )}
        </ScrollView>

        <Pressable
          onPress={onClose}
          style={{
            marginTop: SPACING.base,
            height: 48,
            borderRadius: RADIUS.md,
            backgroundColor: colors.fieldBg,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: WEIGHT.bold, color: colors.textBody }}>
            {list.length === 0 ? 'Done' : 'Change the plan'}
          </Text>
        </Pressable>
      </View>
    </Modal>
  )
}

function PlannedConflictCard({
  conflict,
  resolution,
}: {
  conflict: PlannedConflict
  resolution?: PlannedConflictResolutionContext
}) {
  const { colors } = useTheme()

  const style = plannedSeverityStyle(conflict.severity, colors)

  // `plannedIds` is ordered [earlier, later] by `detectPlannedConflicts`. The
  // *later* plan is the one to change: moving the earlier one backwards does not
  // separate them, and substituting it would leave the clash pointing at
  // whatever replaced it.
  const target = resolution?.planned.find((p) => p.id === conflict.plannedIds[1]) ?? null
  const partner = resolution?.planned.find((p) => p.id === conflict.plannedIds[0]) ?? null
  const sports = conflict.sports
    .map((s) => SPORT_META[s as keyof typeof SPORT_META]?.label ?? s)
    .join(' + ')

  return (
    <View
      style={{
        marginBottom: SPACING.md,
        borderRadius: RADIUS.card,
        backgroundColor: style.softBg,
        borderWidth: 1,
        borderColor: style.softBorder,
        // A dashed edge is the sheet's one structural cue that this describes a
        // plan. It is the same signal a hollow dot gives on the grid.
        borderStyle: 'dashed',
        padding: SPACING.base,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <Text style={{ fontSize: 16 }}>{style.icon}</Text>
        <Text
          style={{
            marginLeft: SPACING.sm,
            flex: 1,
            fontSize: TYPE.body,
            fontWeight: WEIGHT.heavy,
            color: style.deep,
          }}
        >
          {style.title}
        </Text>
      </View>

      <Text
        style={{
          marginTop: SPACING.sm,
          fontSize: TYPE.micro,
          fontWeight: WEIGHT.bold,
          color: colors.textMuted,
        }}
      >
        {sports} · {conflict.summary}
      </Text>

      <Text
        style={{
          marginTop: 6,
          fontSize: TYPE.small,
          lineHeight: 19,
          color: colors.text,
        }}
      >
        {conflict.message}
      </Text>

      {resolution && target ? (
        <ConflictResolutionChips
          target={target}
          partner={partner}
          sessions={resolution.sessions}
          profile={resolution.profile}
          metrics={resolution.metrics}
          onApply={resolution.onApply}
        />
      ) : null}
    </View>
  )
}
