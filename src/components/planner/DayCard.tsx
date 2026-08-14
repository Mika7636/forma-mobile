// One day in the weekly planner: header (weekday + date + totals), the day's
// session chips, and an "Add Session" affordance that carries this day's date
// over to the Log screen.
import { useMemo } from 'react'
import { Pressable, Text, View } from 'react-native'
import Animated, { FadeInRight } from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import SessionChip from './SessionChip'
import { COLORS } from '../../constants/theme'
import { severityStyle, worstSeverity, type ConflictSeverity } from '../../constants/conflictColors'
import type { PlannerDay } from '../../hooks/useWeeklyPlan'
import type { Conflict } from '../../types/conflict'
import type { Session } from '../../types/session'

interface DayCardProps {
  day: PlannerDay
  onSessionPress: (session: Session) => void
  onSessionDelete: (session: Session) => Promise<void>
  onAddSession: (day: PlannerDay) => void
  onConflictPress: (conflicts: Conflict[]) => void
}

export default function DayCard({
  day,
  onSessionPress,
  onSessionDelete,
  onAddSession,
  onConflictPress,
}: DayCardProps) {
  const { isToday, isPast, sessions, conflicts } = day
  const hasConflict = conflicts.length > 0
  const empty = sessions.length === 0

  // The day's overall severity drives the edge dot + ⚠️/🚨 icon; the per-session
  // map lets the specific offending chip be tinted rather than the whole day.
  const daySeverityStyle = severityStyle(worstSeverity(conflicts))
  const severityBySession = useMemo(() => {
    const map = new Map<string, ConflictSeverity>()
    for (const c of conflicts) {
      for (const id of [c.triggerSessionId, c.conflictingSessionId]) {
        if (!id) continue
        if (c.severity === 'danger' || !map.has(id)) map.set(id, c.severity)
      }
    }
    return map
  }, [conflicts])

  const accent = isToday ? COLORS.teal : COLORS.ink

  return (
    <View
      style={{
        backgroundColor: COLORS.white,
        borderRadius: 16,
        borderWidth: 1,
        borderColor: isToday ? COLORS.teal : COLORS.border,
        marginBottom: 12,
        paddingVertical: 12,
        paddingHorizontal: 14,
        paddingLeft: isToday ? 18 : 14,
        overflow: 'hidden',
        opacity: isPast ? 0.8 : 1,
        shadowColor: '#000',
        shadowOpacity: 0.05,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 2 },
        elevation: 2,
      }}
    >
      {/* Today's accent rail */}
      {isToday ? (
        <View
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            bottom: 0,
            width: 4,
            backgroundColor: COLORS.teal,
          }}
        />
      ) : null}

      {/* Unresolved-conflict dot on the card edge */}
      {hasConflict ? (
        <View
          style={{
            position: 'absolute',
            right: 0,
            top: 16,
            width: 8,
            height: 8,
            borderTopLeftRadius: 4,
            borderBottomLeftRadius: 4,
            backgroundColor: daySeverityStyle.solid,
          }}
        />
      ) : null}

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: empty ? 10 : 12,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
          <View style={{ minWidth: 44 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '800',
                letterSpacing: 1.2,
                color: isToday ? COLORS.teal : COLORS.subtle,
              }}
            >
              {day.dayName.toUpperCase()}
            </Text>
            <Text style={{ fontSize: 22, fontWeight: '800', color: accent, marginTop: -2 }}>
              {day.dayNumber}
            </Text>
          </View>

          {isToday ? (
            <View
              style={{
                backgroundColor: COLORS.tealSoft,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                marginLeft: 4,
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '800',
                  letterSpacing: 0.8,
                  color: COLORS.tealDark,
                }}
              >
                TODAY
              </Text>
            </View>
          ) : null}

          {hasConflict ? (
            <Pressable
              onPress={() => {
                haptics.light()
                onConflictPress(conflicts)
              }}
              hitSlop={10}
              accessibilityLabel={`${conflicts.length} training conflict${
                conflicts.length === 1 ? '' : 's'
              } on this day`}
              style={{ marginLeft: 6, padding: 2 }}
            >
              <Text style={{ fontSize: 15 }}>{daySeverityStyle.icon}</Text>
            </Pressable>
          ) : null}
        </View>

        {!empty ? (
          <Text style={{ fontSize: 12, fontWeight: '600', color: COLORS.muted }}>
            {day.dayLoad} AU · {sessions.length} session{sessions.length === 1 ? '' : 's'}
          </Text>
        ) : null}
      </View>

      {/* Sessions */}
      {empty ? (
        <View
          style={{
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: COLORS.border,
            borderRadius: 12,
            paddingVertical: 14,
            alignItems: 'center',
          }}
        >
          <Text style={{ fontSize: 13, color: COLORS.subtle }}>Rest day</Text>
        </View>
      ) : (
        sessions.map((session, i) => (
          <Animated.View key={session.id} entering={FadeInRight.delay(i * 60).duration(240)}>
            <SessionChip
              session={session}
              conflictSeverity={severityBySession.get(session.id)}
              showTime={sessions.length > 1}
              onPress={onSessionPress}
              onDelete={onSessionDelete}
            />
          </Animated.View>
        ))
      )}

      {/* Add session — bigger and centred on an empty day, a quiet footer link
          on a day that already has training on it. */}
      <Pressable
        onPress={() => {
          haptics.light()
          onAddSession(day)
        }}
        accessibilityLabel={`Add a session on ${day.dayName} ${day.dayNumber}`}
        style={{
          marginTop: empty ? 10 : 4,
          borderWidth: 1,
          borderStyle: 'dashed',
          borderColor: COLORS.teal,
          borderRadius: 10,
          paddingVertical: empty ? 11 : 7,
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'row',
        }}
      >
        <Text
          style={{
            fontSize: empty ? 14 : 12.5,
            fontWeight: '700',
            color: COLORS.teal,
          }}
        >
          + Add Session
        </Text>
      </Pressable>
    </View>
  )
}
