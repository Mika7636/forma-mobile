// The list of one day's sessions, shown when a calendar day holds more than
// one. Tapping a row opens the full SessionDetailModal on top of this sheet, so
// closing the detail returns to the day rather than to the bare grid.
//
// Deliberately *not* a React Native <Modal>: SessionDetailModal is one, and a
// native modal covers every sibling overlay in the tree — stacking two of them
// leaves the detail sheet either invisible or unreachable on iOS. An in-screen
// absolute overlay stays behind the real modal, which is exactly the layering
// this flow wants.
import { useMemo } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  SlideOutDown,
} from 'react-native-reanimated'
import SessionChip from './SessionChip'
import { COLORS, RADIUS, SHADOW } from '../../constants/theme'
import { severityStyle, worstSeverity, type ConflictSeverity } from '../../constants/conflictColors'
import { haptics } from '../../utils/haptics'
import type { CalendarDay } from '../../hooks/useMonthPlan'
import type { Conflict } from '../../types/conflict'
import type { Session } from '../../types/session'

interface DaySessionsSheetProps {
  /** The day to list; the sheet is open while this is non-null. */
  day: CalendarDay | null
  onClose: () => void
  onSessionPress: (session: Session) => void
  onSessionDelete: (session: Session) => Promise<void>
  onConflictPress: (conflicts: Conflict[]) => void
}

export default function DaySessionsSheet({
  day,
  onClose,
  onSessionPress,
  onSessionDelete,
  onConflictPress,
}: DaySessionsSheetProps) {
  // Which chip to tint: a conflict names up to two sessions, and `danger`
  // always wins over a `warning` already recorded for the same one.
  const severityBySession = useMemo(() => {
    const map = new Map<string, ConflictSeverity>()
    for (const c of day?.conflicts ?? []) {
      for (const id of [c.triggerSessionId, c.conflictingSessionId]) {
        if (!id) continue
        if (c.severity === 'danger' || !map.has(id)) map.set(id, c.severity)
      }
    }
    return map
  }, [day])

  if (!day) return null

  const conflicts = day.conflicts
  const daySeverityStyle = severityStyle(worstSeverity(conflicts))

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(140)}
        style={[StyleSheet.absoluteFill, { backgroundColor: COLORS.scrim }]}
      >
        <Pressable onPress={onClose} style={{ flex: 1 }} accessibilityLabel="Close day" />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(260)}
        exiting={SlideOutDown.duration(200)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: '72%',
          backgroundColor: COLORS.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 12,
          paddingHorizontal: 16,
          paddingBottom: 28,
          ...SHADOW.floating,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 44,
            height: 5,
            borderRadius: RADIUS.pill,
            backgroundColor: COLORS.border,
            marginBottom: 12,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 19, fontWeight: '800', color: COLORS.ink }}>
              {day.date.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Text style={{ marginTop: 3, fontSize: 13, color: COLORS.muted }}>
              {day.sessions.length} session{day.sessions.length === 1 ? '' : 's'} ·{' '}
              {day.dayHours.toFixed(1)} h · {day.dayLoad} AU
            </Text>
          </View>

          {conflicts.length > 0 ? (
            <Pressable
              onPress={() => {
                haptics.light()
                onConflictPress(conflicts)
              }}
              hitSlop={10}
              accessibilityLabel={`${conflicts.length} training conflict${
                conflicts.length === 1 ? '' : 's'
              } on this day`}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                backgroundColor: daySeverityStyle.softBg,
                borderWidth: 1,
                borderColor: daySeverityStyle.softBorder,
                borderRadius: RADIUS.pill,
                paddingHorizontal: 10,
                paddingVertical: 5,
                marginLeft: 10,
              }}
            >
              <Text style={{ fontSize: 13 }}>{daySeverityStyle.icon}</Text>
              <Text
                style={{
                  marginLeft: 5,
                  fontSize: 12,
                  fontWeight: '800',
                  color: daySeverityStyle.deep,
                }}
              >
                {conflicts.length}
              </Text>
            </Pressable>
          ) : null}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {day.sessions.map((session) => (
            <SessionChip
              key={session.id}
              session={session}
              conflictSeverity={severityBySession.get(session.id)}
              showTime
              onPress={onSessionPress}
              onDelete={onSessionDelete}
            />
          ))}
        </ScrollView>
      </Animated.View>
    </View>
  )
}
