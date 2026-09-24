// Training calendar: the whole month on one surface.

import { useCallback, useMemo, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import ThemedStatusBar from '../components/ui/ThemedStatusBar'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  FadeIn,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated'
import { haptics } from '../utils/haptics'
import ConflictDetailSheet from '../components/conflict/ConflictDetailSheet'
import PlannedConflictSheet from '../components/conflict/PlannedConflictSheet'
import AddPlannedSessionSheet from '../components/planner/AddPlannedSessionSheet'
import DaySessionsSheet from '../components/planner/DaySessionsSheet'
import MonthGrid from '../components/planner/MonthGrid'
import PlannedConflictSummary from '../components/planner/PlannedConflictSummary'
import PlannerSkeleton from '../components/planner/PlannerSkeleton'
import SessionDetailModal from '../components/session/SessionDetailModal'
import EmptyState from '../components/ui/EmptyState'
import { useMonthPlan, type CalendarDay } from '../hooks/useMonthPlan'
import { usePlannedSessions } from '../hooks/usePlannedSessions'
import { useMetrics } from '../hooks/useMetrics'
import {
  addPlannedSession,
  deletePlannedSession,
  updatePlannedSession,
  type PlannedSessionChanges,
} from '../services/plannedSessionService'
import { deleteSession, resolveConflict } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { localISODate } from '../utils/dates'
import { formatThousands } from '../utils/formatting'
import type { Conflict, PlannedConflict } from '../types/conflict'
import type { PlannedSession, PlannedSessionInput } from '../types/planned'
import type { Session } from '../types/session'
import type { PlannerScreenProps } from '../navigation/types'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'
import { useTabContentPadding } from '../hooks/useTabContentPadding'

const SWIPE_THRESHOLD = 70
const SLIDE_DISTANCE = 60
const YEAR = 12

export default function PlannerScreen({ navigation }: PlannerScreenProps) {
  const { colors } = useTheme()
  const tabPadding = useTabContentPadding()

  const uid = useAuthStore((s) => s.user?.uid)
  const sports = useAuthStore((s) => s.profile?.sports)
  const sportInteractions = useAuthStore((s) => s.profile?.sportInteractions)

  const { planned: allPlanned, plannedConflicts: livePlannedConflicts } = usePlannedSessions()
  const { sessions: loggedSessions, ctl, atl } = useMetrics()

  const [monthOffset, setMonthOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  const [dayListOpen, setDayListOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [conflictSheet, setConflictSheet] = useState<Conflict[] | null>(null)
  const [plannedSheetIds, setPlannedSheetIds] = useState<string[] | null>(null)
  const [planningIso, setPlanningIso] = useState<string | null>(null)

  const plannedSheet = useMemo(() => {
    if (!plannedSheetIds) return null
    const byId = new Map(livePlannedConflicts.map((c) => [c.id, c]))
    return plannedSheetIds.map((id) => byId.get(id)).filter((c): c is PlannedConflict => !!c)
  }, [plannedSheetIds, livePlannedConflicts])

  const openPlannedSheet = useCallback(
    (conflicts: PlannedConflict[]) => setPlannedSheetIds(conflicts.map((c) => c.id)),
    [],
  )

  const plan = useMonthPlan(monthOffset)
  const { weeks, monthName, year, totalHours, totalLoad, sessionCount, plannedCount } = plan

  const monthSessions = useMemo(() => weeks.flat().flatMap((d) => d.sessions), [weeks])

  const translateX = useSharedValue(0)
  const opacity = useSharedValue(1)

  const goToMonth = useCallback(
    (next: number) => {
      if (next === monthOffset) return
      haptics.light()
      const exitTo = next > monthOffset ? -SLIDE_DISTANCE : SLIDE_DISTANCE

      setDayListOpen(false)
      setSelectedIso(null)

      opacity.value = withTiming(0, { duration: 110 })
      translateX.value = withTiming(exitTo, { duration: 110 }, (finished) => {
        if (!finished) return
        runOnJS(setMonthOffset)(next)
        translateX.value = -exitTo
        translateX.value = withTiming(0, { duration: 200 })
        opacity.value = withTiming(1, { duration: 200 })
      })
    },
    [monthOffset, opacity, translateX],
  )

  const monthSwipe = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-25, 25])
        .failOffsetY([-16, 16])
        .onEnd((e) => {
          if (e.translationX <= -SWIPE_THRESHOLD) runOnJS(goToMonth)(monthOffset + 1)
          else if (e.translationX >= SWIPE_THRESHOLD) runOnJS(goToMonth)(monthOffset - 1)
        }),
    [goToMonth, monthOffset],
  )

  const gridStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    opacity: opacity.value,
  }))

  const handleRefresh = async () => {
    setRefreshing(true)
    await plan.refresh()
    setRefreshing(false)
  }

  const handleDelete = useCallback(
    async (session: Session) => {
      if (!uid) return
      try {
        await deleteSession(uid, session.id)
      } catch {
        toast.error('Could not delete session', {
          description: isOffline()
            ? "You're offline — reconnect and try again."
            : 'Something went wrong. Please try again.',
        })
      }
    },
    [uid],
  )

  const handleDayPress = useCallback((day: CalendarDay) => {
    haptics.light()
    setSelectedIso(day.isoDate)
    setDayListOpen(true)
  }, [])

  const selectedDay = useMemo(
    () => (selectedIso ? (weeks.flat().find((d) => d.isoDate === selectedIso) ?? null) : null),
    [weeks, selectedIso],
  )

  const focusWeek = useMemo(() => {
    if (weeks.length === 0) return []
    const containsSelected = selectedIso
      ? weeks.find((week) => week.some((d) => d.isoDate === selectedIso))
      : undefined
    return containsSelected ?? weeks.find((week) => week.some((d) => d.isToday)) ?? weeks[0]
  }, [weeks, selectedIso])

  const weekPlannedConflicts = useMemo(() => {
    const seen = new Set<string>()
    const out: PlannedConflict[] = []
    for (const day of focusWeek) {
      for (const conflict of day.plannedConflicts) {
        if (seen.has(conflict.id)) continue
        seen.add(conflict.id)
        out.push(conflict)
      }
    }
    return out
  }, [focusWeek])

  const weekPlannedCount = useMemo(
    () => focusWeek.reduce((sum, d) => sum + d.planned.length, 0),
    [focusWeek],
  )

  const handleApplyResolution = useCallback(
    async (target: PlannedSession, changes: PlannedSessionChanges): Promise<boolean> => {
      if (!uid) return false
      try {
        await updatePlannedSession(uid, target.id, changes)
        haptics.success()
        toast.success('Plan updated')
        return true
      } catch {
        toast.error('Could not update the plan', {
          description: isOffline()
            ? "You're offline — reconnect and try again."
            : 'Something went wrong. Please try again.',
        })
        return false
      }
    },
    [uid],
  )

  const resolutionContext = useMemo(
    () =>
      sportInteractions
        ? {
            planned: allPlanned,
            sessions: loggedSessions,
            profile: { sports: sports ?? [], sportInteractions },
            metrics: { ctl, atl },
            onApply: handleApplyResolution,
          }
        : undefined,
    [allPlanned, loggedSessions, sports, sportInteractions, ctl, atl, handleApplyResolution],
  )

  const handleAddPlan = useCallback(
    async (input: PlannedSessionInput) => {
      if (!uid) return
      try {
        await addPlannedSession(uid, input)
        setPlanningIso(null)
        haptics.success()
        toast.success('Added to your plan')
      } catch {
        toast.error('Could not save the plan', {
          description: isOffline()
            ? "You're offline — reconnect and try again."
            : 'Something went wrong. Please try again.',
        })
      }
    },
    [uid],
  )

  const handleLogForDay = useCallback(
    (isoDate: string) => {
      setDayListOpen(false)
      navigation.navigate('Log', { date: isoDate })
    },
    [navigation],
  )

  const handleDeletePlan = useCallback(
    (planned: PlannedSession) => {
      if (!uid) return
      deletePlannedSession(uid, planned.id).catch(() => {
        toast.error('Could not remove the plan', {
          description: isOffline()
            ? "You're offline — reconnect and try again."
            : 'Something went wrong. Please try again.',
        })
      })
    },
    [uid],
  )

  const sheetDay = dayListOpen ? selectedDay : null

  const isCurrentMonth = monthOffset === 0
  const monthIsEmpty = !plan.loading && sessionCount === 0 && plannedCount === 0

  const defaultPlanIso = isCurrentMonth
    ? localISODate(new Date())
    : localISODate(plan.monthStart)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />

      <View
        style={{
          backgroundColor: colors.surface,
          paddingHorizontal: 20,
          paddingTop: 8,
          paddingBottom: 14,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Chevron
            direction="left"
            label="Previous year"
            onPress={() => goToMonth(monthOffset - YEAR)}
            subtle
          />
          <Animated.Text
            key={year}
            entering={FadeIn.duration(200)}
            style={{
              marginHorizontal: 2,
              fontSize: 15,
              fontWeight: WEIGHT.bold,
              color: colors.textMuted,
              minWidth: 42,
              textAlign: 'center',
            }}
          >
            {year}
          </Animated.Text>
          <Chevron
            direction="right"
            label="Next year"
            onPress={() => goToMonth(monthOffset + YEAR)}
            subtle
          />

          <View style={{ flex: 1 }} />

          <Pressable
            onPress={() => goToMonth(0)}
            disabled={isCurrentMonth}
            accessibilityRole="button"
            accessibilityLabel="Jump to this month"
            style={{
              paddingHorizontal: 16,
              height: 32,
              borderRadius: RADIUS.pill,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: isCurrentMonth ? colors.accent : colors.surfaceAlt,
              borderWidth: 1.5,
              borderColor: isCurrentMonth ? colors.accent : colors.border,
            }}
          >
            <Text
              style={{
                fontSize: TYPE.small,
                fontWeight: WEIGHT.bold,
                color: isCurrentMonth ? colors.onAccent : colors.textMuted,
              }}
            >
              Today
            </Text>
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
          <Animated.Text
            key={monthOffset}
            entering={FadeIn.duration(220)}
            style={{ flex: 1, fontSize: 34, fontWeight: WEIGHT.heavy, color: colors.text }}
            numberOfLines={1}
          >
            {monthName}
          </Animated.Text>
          <Chevron
            direction="left"
            label="Previous month"
            onPress={() => goToMonth(monthOffset - 1)}
          />
          <View style={{ width: 6 }} />
          <Chevron
            direction="right"
            label="Next month"
            onPress={() => goToMonth(monthOffset + 1)}
          />
        </View>

        <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.textSubtle }}>
          {monthSummary(sessionCount, totalHours, totalLoad, plannedCount)}
        </Text>
      </View>

      {!plan.loading ? (
        <View style={{ paddingHorizontal: 20 }}>
          <PlannedConflictSummary
            conflicts={weekPlannedConflicts}
            plannedCount={weekPlannedCount}
            onPress={openPlannedSheet}
          />
        </View>
      ) : null}

      <GestureDetector gesture={monthSwipe}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 8,
            paddingTop: 12,
            paddingBottom: tabPadding,
          }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.accent}
              colors={[colors.accent]}
            />
          }
        >
          <Animated.View style={[gridStyle, monthIsEmpty ? null : { flex: 1 }]}>
            {plan.loading ? (
              <PlannerSkeleton />
            ) : (
              <MonthGrid weeks={weeks} selectedIso={selectedIso} onDayPress={handleDayPress} />
            )}
          </Animated.View>

          {!plan.loading && monthIsEmpty ? (
            <EmptyState
              icon="calendar"
              title="Plan your week"
              message="Plan your week and we'll flag conflicts before they cost you — a hard Combat session and a hard run on back-to-back days get caught here, not in your legs."
              actionLabel="Plan a session"
              onAction={() => {
                haptics.light()
                setPlanningIso(defaultPlanIso)
              }}
              style={{ marginTop: SPACING.lg, marginHorizontal: 12 }}
            />
          ) : null}
        </ScrollView>
      </GestureDetector>

      <SelectedDayBar
        day={selectedDay}
        onPress={() => selectedDay && handleDayPress(selectedDay)}
        onPlan={() => setPlanningIso(selectedDay?.isoDate ?? defaultPlanIso)}
      />

      <DaySessionsSheet
        day={sheetDay}
        onClose={() => setDayListOpen(false)}
        onSessionPress={setSelectedSession}
        onSessionDelete={handleDelete}
        onConflictPress={setConflictSheet}
        onPlannedConflictPress={openPlannedSheet}
        onPlanSession={setPlanningIso}
        onLogSession={handleLogForDay}
        onPlannedDelete={handleDeletePlan}
      />

      <SessionDetailModal
        visible={selectedSession != null}
        session={selectedSession}
        onClose={() => setSelectedSession(null)}
        onDeleted={() => setSelectedSession(null)}
      />

      <ConflictDetailSheet
        conflicts={conflictSheet}
        sessions={monthSessions}
        onClose={() => setConflictSheet(null)}
        onDismiss={(id) => {
          if (uid) {
            resolveConflict(uid, id).catch(() => {
              toast.error('Could not dismiss', {
                description: isOffline()
                  ? "You're offline — reconnect and try again."
                  : 'Something went wrong. Please try again.',
              })
            })
          }
          setConflictSheet(null)
        }}
      />

      <PlannedConflictSheet
        conflicts={plannedSheet}
        onClose={() => setPlannedSheetIds(null)}
        resolution={resolutionContext}
      />

      <AddPlannedSessionSheet
        isoDate={planningIso}
        sports={sports ?? []}
        onClose={() => setPlanningIso(null)}
        onSave={handleAddPlan}
      />
    </SafeAreaView>
  )
}

function monthSummary(
  sessionCount: number,
  totalHours: number,
  totalLoad: number,
  plannedCount: number,
): string {
  const parts: string[] = []
  if (sessionCount > 0) {
    parts.push(
      `${sessionCount} session${sessionCount === 1 ? '' : 's'}`,
      `${totalHours.toFixed(1)} h`,
      `${formatThousands(totalLoad)} AU`,
    )
  }
  if (plannedCount > 0) parts.push(`${plannedCount} planned`)
  return parts.length > 0 ? parts.join(' · ') : 'Nothing logged or planned'
}

function SelectedDayBar({
  day,
  onPress,
  onPlan,
}: {
  day: CalendarDay | null
  onPress: () => void
  onPlan: () => void
}) {
  const { colors } = useTheme()

  return (
    <View
      style={{
        height: 54,
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 20,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {day == null ? (
        <Text style={{ fontSize: TYPE.small, color: colors.textSubtle }}>
          Tap a day to see it, or to plan a session on it.
        </Text>
      ) : (
        <>
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            style={{ flex: 1, minWidth: 0 }}
          >
            <Text style={{ fontSize: TYPE.body, fontWeight: WEIGHT.bold, color: colors.text }}>
              {day.date.toLocaleDateString(undefined, {
                weekday: 'short',
                day: 'numeric',
                month: 'long',
              })}
            </Text>
            <Text
              numberOfLines={1}
              style={{ marginTop: 1, fontSize: 12.5, color: colors.textMuted }}
            >
              {dayBarSummary(day)}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              haptics.light()
              onPlan()
            }}
            accessibilityRole="button"
            accessibilityLabel="Plan a session on the selected day"
            style={{
              marginLeft: SPACING.md,
              minHeight: MIN_TOUCH - 12,
              justifyContent: 'center',
              paddingHorizontal: 14,
              borderRadius: RADIUS.pill,
              borderWidth: 1.5,
              borderStyle: 'dashed',
              borderColor: colors.accentBorder,
              backgroundColor: colors.accentSoft,
            }}
          >
            <Text
              style={{ fontSize: TYPE.small, fontWeight: WEIGHT.bold, color: colors.accentText }}
            >
              + Plan
            </Text>
          </Pressable>
        </>
      )}
    </View>
  )
}

function dayBarSummary(day: CalendarDay): string {
  const parts: string[] = []
  if (day.sessions.length > 0) {
    parts.push(
      `${day.sessions.length} session${day.sessions.length === 1 ? '' : 's'}`,
      `${day.dayHours.toFixed(1)} h`,
      `${day.dayLoad} AU`,
    )
  }
  if (day.planned.length > 0) parts.push(`${day.planned.length} planned`)
  if (day.plannedConflicts.length > 0) parts.push('planned conflict')
  return parts.length > 0 ? parts.join(' · ') : 'Nothing yet'
}

function Chevron({
  direction,
  label,
  onPress,
  subtle = false,
}: {
  direction: 'left' | 'right'
  label: string
  onPress: () => void
  subtle?: boolean
}) {
  const { colors } = useTheme()

  return (
    <Pressable
      onPress={onPress}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        width: subtle ? 24 : 34,
        height: subtle ? 26 : 32,
        borderRadius: subtle ? RADIUS.xs : RADIUS.sm,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: subtle ? 'transparent' : colors.fieldBg,
        borderWidth: subtle ? 0 : 1,
        borderColor: colors.border,
      }}
    >
      <Text
        style={{
          fontSize: subtle ? 18 : 21,
          fontWeight: WEIGHT.bold,
          color: subtle ? colors.textSubtle : colors.textBody,
          marginTop: -3,
        }}
      >
        {direction === 'left' ? '‹' : '›'}
      </Text>
    </Pressable>
  )
}
