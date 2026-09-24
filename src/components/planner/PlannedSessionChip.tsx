// A planned session inside a planner day card.

import { Pressable, Text, View } from 'react-native'
import { plannedSeverityStyle, type ConflictSeverity } from '../../constants/conflictColors'
import { haptics } from '../../utils/haptics'
import { sportVisual } from '../../utils/sportMeta'
import type { PlannedSession } from '../../types/planned'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT, rpeLabel } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface PlannedSessionChipProps {
  planned: PlannedSession
  conflictSeverity?: ConflictSeverity
  onDelete: (planned: PlannedSession) => void
}

export default function PlannedSessionChip({
  planned,
  conflictSeverity,
  onDelete,
}: PlannedSessionChipProps) {
  const { colors } = useTheme()

  const { color, icon, label } = sportVisual(planned.sport, colors)
  const clash = conflictSeverity ? plannedSeverityStyle(conflictSeverity, colors) : null

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: SPACING.sm,
        paddingVertical: SPACING.md - 2,
        paddingHorizontal: SPACING.md,
        borderRadius: RADIUS.md,
        backgroundColor: colors.surfaceAlt,
        borderWidth: 1.5,
        borderStyle: 'dashed',
        borderColor: clash ? clash.solid : colors.border,
      }}
    >
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: RADIUS.pill,
          borderWidth: 1.5,
          borderColor: color,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 16 }}>{icon}</Text>
      </View>

      <View style={{ flex: 1, minWidth: 0, marginLeft: SPACING.md - 2 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            numberOfLines={1}
            style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.text }}
          >
            {label}
          </Text>
          <View
            style={{
              marginLeft: SPACING.sm,
              paddingHorizontal: 7,
              paddingVertical: 1,
              borderRadius: RADIUS.xs,
              backgroundColor: colors.fieldBg,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text
              style={{
                fontSize: TYPE.caption,
                fontWeight: WEIGHT.heavy,
                letterSpacing: 0.4,
                color: colors.textMuted,
              }}
            >
              PLANNED
            </Text>
          </View>
        </View>

        <Text style={{ marginTop: 2, fontSize: TYPE.micro, color: colors.textMuted }}>
          {planned.durationMinutes} min · RPE {planned.intensity} · {rpeLabel(planned.intensity)}
        </Text>

        {clash ? (
          <Text
            style={{
              marginTop: 3,
              fontSize: TYPE.caption,
              fontWeight: WEIGHT.bold,
              color: clash.deep,
            }}
          >
            {clash.icon} {clash.title}
          </Text>
        ) : null}
      </View>

      <Pressable
        onPress={() => {
          haptics.medium()
          onDelete(planned)
        }}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Remove planned ${label}`}
        style={{
          marginLeft: SPACING.sm,
          minWidth: MIN_TOUCH - 8,
          minHeight: MIN_TOUCH - 8,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontSize: 18, color: colors.textSubtle }}>✕</Text>
      </Pressable>
    </View>
  )
}
