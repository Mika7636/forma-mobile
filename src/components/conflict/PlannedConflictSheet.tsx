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
import { plannedSeverityStyle } from '../../constants/conflictColors'
import { SPORT_META } from '../../utils/sportMeta'
import type { PlannedConflict } from '../../types/conflict'
import { RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface PlannedConflictSheetProps {
  /** Clashes to explain; the sheet is open while this is non-null. */
  conflicts: PlannedConflict[] | null
  onClose: () => void
}

export default function PlannedConflictSheet({ conflicts, onClose }: PlannedConflictSheetProps) {
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
          {list.map((conflict) => (
            <PlannedConflictCard key={conflict.id} conflict={conflict} />
          ))}
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
            Change the plan
          </Text>
        </Pressable>
      </View>
    </Modal>
  )
}

function PlannedConflictCard({ conflict }: { conflict: PlannedConflict }) {
  const { colors } = useTheme()

  const style = plannedSeverityStyle(conflict.severity, colors)
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
    </View>
  )
}
