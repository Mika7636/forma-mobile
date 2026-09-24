// Bottom sheet explaining a planned clash in full.

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

export interface PlannedConflictResolutionContext {
  planned: PlannedSession[]
  sessions: Session[]
  profile: RecommenderProfile
  metrics: RecommenderMetrics
  onApply: (target: PlannedSession, changes: PlannedSessionChanges) => Promise<boolean>
}

interface PlannedConflictSheetProps {
  conflicts: PlannedConflict[] | null
  onClose: () => void
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
