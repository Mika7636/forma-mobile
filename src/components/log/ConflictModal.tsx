import { useEffect } from 'react'
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { COLORS } from '../../constants/theme'
import { severityStyle, worstSeverity } from '../../constants/conflictColors'
import { involvedSessions } from '../../utils/conflictInfo'
import type { Conflict } from '../../types/conflict'
import type { Session } from '../../types/session'

interface ConflictModalProps {
  visible: boolean
  conflicts: Conflict[]
  /** Sessions for resolving the "involved sessions" line (best-effort). */
  sessions?: Session[]
  /** True while the "Undo session" delete is in flight. */
  undoing?: boolean
  /** Keep the session; just dismiss. */
  onKeep: () => void
  /** Delete the session + its conflicts, then dismiss. */
  onUndo: () => void
}

/**
 * The moment that sells FORMA: a native sheet that slides up right after a
 * session is saved when it clashes with recent training. Each conflict shows the
 * coach's explanation, the two sessions involved, and a severity-coloured border.
 * The athlete decides — keep it, or undo it (deleting the session + its
 * conflicts). Educational, not alarming.
 */
export default function ConflictModal({
  visible,
  conflicts,
  sessions = [],
  undoing = false,
  onKeep,
  onUndo,
}: ConflictModalProps) {
  const overall = severityStyle(worstSeverity(conflicts))

  // Warn the athlete physically the moment the sheet appears.
  useEffect(() => {
    if (visible) {
      haptics.warning()
    }
  }, [visible])

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onKeep}>
      <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: COLORS.scrim }}>
        <View
          style={{
            backgroundColor: COLORS.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            paddingTop: 14,
            paddingBottom: 24,
            paddingHorizontal: 20,
            maxHeight: '86%',
            shadowColor: COLORS.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: -6 },
            elevation: 16,
          }}
        >
          <View
            style={{
              alignSelf: 'center',
              width: 44,
              height: 5,
              borderRadius: 999,
              backgroundColor: COLORS.border,
              marginBottom: 14,
            }}
          />

          <Text
            style={{
              fontSize: 20,
              fontWeight: '800',
              color: overall.solid,
              textAlign: 'center',
            }}
          >
            {overall.icon} {overall.title === 'High Injury Risk' ? 'High Injury Risk' : 'Training Conflict Detected'}
          </Text>
          <Text style={{ marginTop: 4, fontSize: 13, color: COLORS.muted, textAlign: 'center' }}>
            Your call — here&apos;s what we noticed.
          </Text>

          <ScrollView
            style={{ marginTop: 16, flexGrow: 0 }}
            contentContainerStyle={{ paddingBottom: 4 }}
            showsVerticalScrollIndicator={false}
          >
            {conflicts.map((conflict, index) => (
              <ConflictRow
                key={conflict.conflictId || index}
                conflict={conflict}
                sessions={sessions}
              />
            ))}
          </ScrollView>

          <View style={{ marginTop: 8 }}>
            <Pressable
              onPress={() => {
                haptics.medium()
                onKeep()
              }}
              disabled={undoing}
              style={{
                height: 52,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: COLORS.teal,
              }}
            >
              <Text style={{ color: COLORS.onAccent, fontSize: 16, fontWeight: '700' }}>
                Keep session
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                haptics.medium()
                onUndo()
              }}
              disabled={undoing}
              style={{
                height: 52,
                borderRadius: 12,
                marginTop: 10,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1.5,
                borderColor: COLORS.danger,
                backgroundColor: COLORS.surface,
              }}
            >
              {undoing ? (
                <ActivityIndicator color={COLORS.dangerText} />
              ) : (
                <Text style={{ color: COLORS.dangerText, fontSize: 16, fontWeight: '700' }}>
                  Undo
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function ConflictRow({ conflict, sessions }: { conflict: Conflict; sessions: Session[] }) {
  const style = severityStyle(conflict.severity)
  const pair = involvedSessions(conflict, sessions)

  return (
    <View
      style={{
        backgroundColor: style.softBg,
        borderLeftWidth: 4,
        borderLeftColor: style.solid,
        borderRadius: 12,
        paddingVertical: 14,
        paddingHorizontal: 14,
        marginBottom: 12,
      }}
    >
      <View style={{ flexDirection: 'row' }}>
        <Text style={{ fontSize: 18, marginRight: 10 }}>{style.icon}</Text>
        <Text style={{ flex: 1, fontSize: 14, lineHeight: 20, color: COLORS.body }}>
          {conflict.message}
        </Text>
      </View>

      {pair.from && pair.to ? (
        <Text style={{ marginTop: 10, marginLeft: 28, fontSize: 13, color: COLORS.muted }}>
          <Text style={{ fontWeight: '700', color: COLORS.body }}>
            {pair.from.icon} {pair.from.sportLabel}
          </Text>{' '}
          ({pair.from.when}, RPE {pair.from.rpe}) →{' '}
          <Text style={{ fontWeight: '700', color: COLORS.body }}>
            {pair.to.icon} {pair.to.sportLabel}
          </Text>{' '}
          ({pair.to.when}, RPE {pair.to.rpe})
        </Text>
      ) : null}
    </View>
  )
}
