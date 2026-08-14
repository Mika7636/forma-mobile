// The one bottom sheet that explains a conflict in full — its message, the two
// sessions involved, when it was detected, and (optionally) a Dismiss action.
// Shared by the dashboard banner tap, the planner day ⚠️, and the history list,
// so "what does this warning mean?" always looks and reads the same.
import { Modal, Pressable, ScrollView, Text, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { COLORS } from '../../constants/theme'
import { severityStyle } from '../../constants/conflictColors'
import { conflictSportsLabel, detectedAtDate, involvedSessions } from '../../utils/conflictInfo'
import { formatTimeAgo } from '../../utils/formatting'
import type { Conflict } from '../../types/conflict'
import type { Session } from '../../types/session'

interface ConflictDetailSheetProps {
  /** Conflicts to explain; the sheet is open while this is non-null. */
  conflicts: Conflict[] | null
  /** Sessions to resolve the "involved" pairing from (best-effort). */
  sessions?: Session[]
  onClose: () => void
  /** When provided, each still-active conflict shows a Dismiss button. */
  onDismiss?: (id: string) => void
}

/**
 * A slide-up sheet listing one or more conflicts with the full coaching
 * explanation. Non-alarming, educational framing: what happened, which sessions,
 * and what to consider.
 */
export default function ConflictDetailSheet({
  conflicts,
  sessions = [],
  onClose,
  onDismiss,
}: ConflictDetailSheetProps) {
  const list = conflicts ?? []

  return (
    <Modal visible={conflicts != null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(17,24,39,0.5)' }} />
      <View
        style={{
          backgroundColor: COLORS.white,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingHorizontal: 20,
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
            borderRadius: 999,
            backgroundColor: COLORS.border,
            marginBottom: 14,
          }}
        />
        <Text style={{ fontSize: 19, fontWeight: '800', color: COLORS.ink }}>
          Training conflict{list.length === 1 ? '' : 's'}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 13, color: COLORS.muted }}>
          Here&apos;s what FORMA noticed — you decide what to do with it.
        </Text>

        <ScrollView
          style={{ marginTop: 14 }}
          contentContainerStyle={{ paddingBottom: 4 }}
          showsVerticalScrollIndicator={false}
        >
          {list.map((conflict) => (
            <ConflictCard
              key={conflict.conflictId}
              conflict={conflict}
              sessions={sessions}
              onDismiss={onDismiss}
            />
          ))}
        </ScrollView>

        <Pressable
          onPress={onClose}
          style={{
            marginTop: 16,
            height: 48,
            borderRadius: 12,
            backgroundColor: COLORS.fieldBg,
            borderWidth: 1,
            borderColor: COLORS.border,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: '700', color: COLORS.body }}>Got it</Text>
        </Pressable>
      </View>
    </Modal>
  )
}

function ConflictCard({
  conflict,
  sessions,
  onDismiss,
}: {
  conflict: Conflict
  sessions: Session[]
  onDismiss?: (id: string) => void
}) {
  const style = severityStyle(conflict.severity)
  const pair = involvedSessions(conflict, sessions)
  const showDismiss = onDismiss != null && !conflict.resolved

  return (
    <View
      style={{
        marginBottom: 12,
        backgroundColor: style.softBg,
        borderRadius: 14,
        borderLeftWidth: 4,
        borderLeftColor: style.solid,
        padding: 14,
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Text style={{ fontSize: 16, marginRight: 8 }}>{style.icon}</Text>
        <Text style={{ fontSize: 14, fontWeight: '800', color: style.deep, flex: 1 }}>
          {style.title}
        </Text>
        <Text style={{ fontSize: 11, color: COLORS.subtle }}>
          {formatTimeAgo(detectedAtDate(conflict).toISOString())}
        </Text>
      </View>

      <Text style={{ fontSize: 14, color: COLORS.body, lineHeight: 21 }}>{conflict.message}</Text>

      {/* The two sessions involved, when we can resolve them. */}
      {pair.from || pair.to ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            flexWrap: 'wrap',
            marginTop: 10,
            backgroundColor: COLORS.white,
            borderRadius: 10,
            paddingVertical: 8,
            paddingHorizontal: 10,
          }}
        >
          {pair.from ? <SessionPill icon={pair.from.icon} label={pair.from.sportLabel} sub={`${pair.from.when} · RPE ${pair.from.rpe}`} /> : null}
          {pair.from && pair.to ? (
            <Text style={{ marginHorizontal: 8, fontSize: 14, color: COLORS.subtle }}>→</Text>
          ) : null}
          {pair.to ? <SessionPill icon={pair.to.icon} label={pair.to.sportLabel} sub={`${pair.to.when} · RPE ${pair.to.rpe}`} /> : null}
        </View>
      ) : (
        <Text style={{ marginTop: 8, fontSize: 12, color: COLORS.subtle }}>
          {conflictSportsLabel(conflict)}
        </Text>
      )}

      {showDismiss ? (
        <Pressable
          onPress={() => {
            haptics.light()
            onDismiss?.(conflict.conflictId)
          }}
          style={{
            marginTop: 12,
            alignSelf: 'flex-start',
            borderRadius: 999,
            borderWidth: 1.5,
            borderColor: style.solid,
            paddingHorizontal: 16,
            paddingVertical: 7,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: '800', color: style.deep }}>Dismiss</Text>
        </Pressable>
      ) : null}
    </View>
  )
}

function SessionPill({ icon, label, sub }: { icon: string; label: string; sub: string }) {
  return (
    <View style={{ flexShrink: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '700', color: COLORS.ink }} numberOfLines={1}>
        {icon} {label}
      </Text>
      <Text style={{ fontSize: 11, color: COLORS.muted }}>{sub}</Text>
    </View>
  )
}
