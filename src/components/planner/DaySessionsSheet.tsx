// The day card: everything on one calendar day — what was trained, what is
// planned, and anything FORMA has flagged about either.
//
// It opens for any tapped day now, not just a day holding several sessions. That
// changed when the Planner gained a forward half: an empty future Tuesday is not
// a dead end any more, it is where you plan Tuesday, and the sheet is where that
// happens.
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
import PlannedSessionChip from './PlannedSessionChip'
import SessionChip from './SessionChip'
import {
  plannedSeverityStyle,
  severityStyle,
  worstSeverity,
  type ConflictSeverity,
} from '../../constants/conflictColors'
import { haptics } from '../../utils/haptics'
import type { CalendarDay } from '../../hooks/useMonthPlan'
import type { Conflict, PlannedConflict } from '../../types/conflict'
import type { PlannedSession } from '../../types/planned'
import type { Session } from '../../types/session'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface DaySessionsSheetProps {
  /** The day to show; the sheet is open while this is non-null. */
  day: CalendarDay | null
  onClose: () => void
  onSessionPress: (session: Session) => void
  onSessionDelete: (session: Session) => Promise<void>
  onConflictPress: (conflicts: Conflict[]) => void
  onPlannedConflictPress: (conflicts: PlannedConflict[]) => void
  onPlanSession: (isoDate: string) => void
  /** Opens the Log tab with this day pre-filled. */
  onLogSession: (isoDate: string) => void
  onPlannedDelete: (planned: PlannedSession) => void
}

/**
 * What the day's add-button should offer, if anything.
 *
 * ## Why this is a function of the date
 *
 * The sheet used to offer "+ Plan a session" on every day, which on a Tuesday
 * three weeks gone is an offer to plan the past. The two verbs are not
 * interchangeable: you *plan* what hasn't happened and *log* what has, and the
 * calendar already knows which side of that line a day falls on.
 *
 *  - **future** — plan it. Nothing has happened yet; this is the whole point of
 *    the forward half of the planner.
 *  - **today** — log it. A session today is either done or not yet done, and
 *    "plan the next four hours" is not a thing anyone opens a calendar to do.
 *  - **past, nothing logged** — log it, backdated. This is the day someone
 *    trained and forgot to record, and it is the single most useful thing the
 *    sheet can offer them.
 *  - **past, already logged** — nothing. The day is accounted for; a button
 *    here would only invite duplicates. The list is the answer.
 *
 * Keyed on logged sessions, not on plans: a past day holding only a stale plan
 * is still a day with nothing recorded on it.
 */
function dayAction(day: CalendarDay): 'plan' | 'log' | null {
  if (day.isFuture) return 'plan'
  if (day.isToday) return 'log'
  return day.sessions.length === 0 ? 'log' : null
}

/** The line shown when a day holds nothing at all, matched to its action. */
function emptyCopy(day: CalendarDay): string {
  if (day.isFuture) {
    return "Nothing here yet. Plan a session and FORMA will check it against the rest of your week."
  }
  if (day.isToday) return 'Nothing logged today yet. Record the session you just finished.'
  return "Nothing logged on this day. Add a session you did but didn't record."
}

export default function DaySessionsSheet({
  day,
  onClose,
  onSessionPress,
  onSessionDelete,
  onConflictPress,
  onPlannedConflictPress,
  onPlanSession,
  onLogSession,
  onPlannedDelete,
}: DaySessionsSheetProps) {
  const { colors } = useTheme()

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

  // The same, for plans. Kept as a separate map rather than merged with the one
  // above: the two id spaces are different collections, and a shared map would
  // let a session id collide with a plan id and tint the wrong chip.
  const severityByPlanned = useMemo(() => {
    const map = new Map<string, ConflictSeverity>()
    for (const c of day?.plannedConflicts ?? []) {
      for (const id of c.plannedIds) {
        if (c.severity === 'danger' || !map.has(id)) map.set(id, c.severity)
      }
    }
    return map
  }, [day])

  if (!day) return null

  const { conflicts, plannedConflicts, sessions, planned } = day
  const daySeverityStyle = severityStyle(worstSeverity(conflicts), colors)
  const plannedStyle = plannedSeverityStyle(worstSeverity(plannedConflicts), colors)
  const empty = sessions.length === 0 && planned.length === 0
  const action = dayAction(day)

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(140)}
        style={[StyleSheet.absoluteFill, { backgroundColor: colors.scrim }]}
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
          maxHeight: '78%',
          backgroundColor: colors.surface,
          borderTopLeftRadius: 22,
          borderTopRightRadius: 22,
          paddingTop: 12,
          paddingHorizontal: SPACING.base,
          paddingBottom: 28,
          ...colors.shadowFloating,
        }}
      >
        <View
          style={{
            alignSelf: 'center',
            width: 44,
            height: 5,
            borderRadius: RADIUS.pill,
            backgroundColor: colors.border,
            marginBottom: 12,
          }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 19, fontWeight: WEIGHT.heavy, color: colors.text }}>
              {day.date.toLocaleDateString(undefined, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Text style={{ marginTop: 3, fontSize: TYPE.small, color: colors.textMuted }}>
              {summaryLine(day)}
            </Text>
          </View>

          {/* Two badges, never merged. A logged conflict and a planned one mean
              different things and lead to different actions, so collapsing them
              into a single count would produce a number that answers neither. */}
          {plannedConflicts.length > 0 ? (
            <ConflictBadge
              count={plannedConflicts.length}
              icon={plannedStyle.icon}
              fg={plannedStyle.deep}
              bg={plannedStyle.softBg}
              border={plannedStyle.softBorder}
              dashed
              label={`${plannedConflicts.length} planned conflict${
                plannedConflicts.length === 1 ? '' : 's'
              } on this day`}
              onPress={() => onPlannedConflictPress(plannedConflicts)}
            />
          ) : null}

          {conflicts.length > 0 ? (
            <ConflictBadge
              count={conflicts.length}
              icon={daySeverityStyle.icon}
              fg={daySeverityStyle.deep}
              bg={daySeverityStyle.softBg}
              border={daySeverityStyle.softBorder}
              label={`${conflicts.length} training conflict${
                conflicts.length === 1 ? '' : 's'
              } on this day`}
              onPress={() => onConflictPress(conflicts)}
            />
          ) : null}
        </View>

        <ScrollView showsVerticalScrollIndicator={false}>
          {sessions.map((session) => (
            <SessionChip
              key={session.id}
              session={session}
              conflictSeverity={severityBySession.get(session.id)}
              showTime
              onPress={onSessionPress}
              onDelete={onSessionDelete}
            />
          ))}

          {planned.length > 0 ? (
            <>
              {/* Only labelled when both halves are present — a day holding
                  nothing but plans needs no heading to tell them apart. */}
              {sessions.length > 0 ? (
                <Text
                  style={{
                    marginTop: SPACING.sm,
                    marginBottom: SPACING.sm,
                    fontSize: TYPE.caption,
                    fontWeight: WEIGHT.heavy,
                    letterSpacing: 0.6,
                    color: colors.textSubtle,
                  }}
                >
                  PLANNED
                </Text>
              ) : null}
              {planned.map((plan) => (
                <PlannedSessionChip
                  key={plan.id}
                  planned={plan}
                  conflictSeverity={severityByPlanned.get(plan.id)}
                  onDelete={onPlannedDelete}
                />
              ))}
            </>
          ) : null}

          {empty ? (
            <Text
              style={{
                marginBottom: SPACING.md,
                fontSize: TYPE.small,
                lineHeight: 19,
                color: colors.textMuted,
              }}
            >
              {emptyCopy(day)}
            </Text>
          ) : null}
        </ScrollView>

        {action ? (
          <Pressable
            onPress={() => {
              haptics.light()
              if (action === 'plan') onPlanSession(day.isoDate)
              else onLogSession(day.isoDate)
            }}
            accessibilityRole="button"
            accessibilityLabel={
              action === 'plan'
                ? 'Plan a session on this day'
                : 'Log a session on this day'
            }
            style={{
              marginTop: SPACING.md,
              minHeight: MIN_TOUCH,
              borderRadius: RADIUS.md,
              borderWidth: 1.5,
              // Dashed for a plan, solid for a log — the same "provisional vs
              // recorded" grammar the chips and the grid dots use, applied to
              // the button that produces each.
              borderStyle: action === 'plan' ? 'dashed' : 'solid',
              borderColor: action === 'plan' ? colors.accentBorder : colors.accent,
              backgroundColor: colors.accentSoft,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.accentText }}
            >
              {action === 'plan' ? '+ Plan a session' : '+ Log a session'}
            </Text>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  )
}

/** "2 sessions · 1.5 h · 620 AU · 1 planned" — whichever halves exist. */
function summaryLine(day: CalendarDay): string {
  const parts: string[] = []
  if (day.sessions.length > 0) {
    parts.push(
      `${day.sessions.length} session${day.sessions.length === 1 ? '' : 's'}`,
      `${day.dayHours.toFixed(1)} h`,
      `${day.dayLoad} AU`,
    )
  }
  if (day.planned.length > 0) parts.push(`${day.planned.length} planned`)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing logged or planned'
}

function ConflictBadge({
  count,
  icon,
  fg,
  bg,
  border,
  dashed = false,
  label,
  onPress,
}: {
  count: number
  icon: string
  fg: string
  bg: string
  border: string
  dashed?: boolean
  label: string
  onPress: () => void
}) {
  return (
    <Pressable
      onPress={() => {
        haptics.light()
        onPress()
      }}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: bg,
        borderWidth: 1,
        borderStyle: dashed ? 'dashed' : 'solid',
        borderColor: border,
        borderRadius: RADIUS.pill,
        paddingHorizontal: 10,
        paddingVertical: 5,
        marginLeft: 10,
      }}
    >
      <Text style={{ fontSize: TYPE.small }}>{icon}</Text>
      <Text style={{ marginLeft: 5, fontSize: TYPE.micro, fontWeight: WEIGHT.heavy, color: fg }}>
        {count}
      </Text>
    </Pressable>
  )
}
