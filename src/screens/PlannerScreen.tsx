// Training calendar — the whole month on one surface, Apple Calendar style.
// Swipe (or tap the arrows) to move between months, tap a day to open it.
//
// ## The screen now looks forward as well as back
//
// It used to be a read-only view of what had already happened: the Log tab owned
// every write, and a day with nothing in it was simply blank. That made the
// Planner useless to the one person who most needs it — someone who signed up
// this morning, has logged nothing, and has no history for any of FORMA's
// analytics to describe.
//
// So a day now holds two things: sessions that happened, and sessions that are
// *planned*. Plans are cheap to enter (sport, duration, intensity) and they are
// enough to run FORMA's signature check forward instead of backward — a hard
// Combat session pencilled in for Tuesday and a hard run for Wednesday raise a
// conflict the moment the second one is added, on an account with no history at
// all. That warning is the product's whole differentiator, and this is where a
// brand-new user meets it.
//
// Logged training is still read-only here; the Log tab keeps that job.
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

/** Horizontal drag needed to commit a month change. */
const SWIPE_THRESHOLD = 70
/** How far the grid slides during a month transition. */
const SLIDE_DISTANCE = 60
/** Months in a year — the step the year chevrons take. */
const YEAR = 12

export default function PlannerScreen({ navigation }: PlannerScreenProps) {
  const { colors } = useTheme()
  // Reserve room for the tab bar, which is drawn over the end of this list.
  const tabPadding = useTabContentPadding()

  const uid = useAuthStore((s) => s.user?.uid)
  const sports = useAuthStore((s) => s.profile?.sports)
  const sportInteractions = useAuthStore((s) => s.profile?.sportInteractions)

  // The recommendation engine's three inputs, for the resolution chips on a
  // planned clash. `usePlannedSessions` is called directly rather than read off
  // the month grid because a resolution needs the *whole* calendar: a clash can
  // pair a plan on screen with one just past the edge of the visible month, and
  // the grid would hand over only half of it. That is the direct-call case the
  // hook's own header describes; the second subscription is on a collection of a
  // few dozen documents that Firestore serves from the same query target.
  const { planned: allPlanned, plannedConflicts: livePlannedConflicts } = usePlannedSessions()
  const { sessions: loggedSessions, ctl, atl } = useMetrics()

  const [monthOffset, setMonthOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  /** The day ringed on the grid — set by any tap, including empty days. */
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  /** Whether the selected day's card is showing. */
  const [dayListOpen, setDayListOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [conflictSheet, setConflictSheet] = useState<Conflict[] | null>(null)
  /**
   * Which planned clashes the sheet is showing, by id.
   *
   * Ids rather than the objects themselves, so the sheet's contents are
   * re-derived from the live calendar on every render. Holding the objects
   * would freeze the sheet at the moment it opened — an athlete who applied a
   * resolution would watch the grid behind them update while the card in front
   * of them went on describing a clash that no longer existed.
   */
  const [plannedSheetIds, setPlannedSheetIds] = useState<string[] | null>(null)
  /** The day the "plan a session" sheet is collecting for, if open. */
  const [planningIso, setPlanningIso] = useState<string | null>(null)

  const plannedSheet = useMemo(() => {
    if (!plannedSheetIds) return null
    const byId = new Map(livePlannedConflicts.map((c) => [c.id, c]))
    // Resolved clashes drop out; the sheet renders its own "clash resolved"
    // state when every one of them has.
    return plannedSheetIds.map((id) => byId.get(id)).filter((c): c is PlannedConflict => !!c)
  }, [plannedSheetIds, livePlannedConflicts])

  const openPlannedSheet = useCallback(
    (conflicts: PlannedConflict[]) => setPlannedSheetIds(conflicts.map((c) => c.id)),
    [],
  )

  const plan = useMonthPlan(monthOffset)
  const { weeks, monthName, year, totalHours, totalLoad, sessionCount, plannedCount } = plan

  // Flattened month sessions, so the conflict detail sheet can resolve the two
  // sessions each conflict involves.
  const monthSessions = useMemo(() => weeks.flat().flatMap((d) => d.sessions), [weeks])

  const translateX = useSharedValue(0)
  const opacity = useSharedValue(1)

  /**
   * Move to `next` month, sliding the grid out in the direction of travel and
   * back in from the opposite edge. The offset state flips at the midpoint so
   * the new month is what slides in.
   */
  const goToMonth = useCallback(
    (next: number) => {
      if (next === monthOffset) return
      haptics.light()
      const exitTo = next > monthOffset ? -SLIDE_DISTANCE : SLIDE_DISTANCE

      // A day sheet left open would now belong to a month that isn't on screen.
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

  // Month swipe. Constrained to clearly-horizontal drags so the ScrollView (and
  // a chip's own swipe-to-delete, in the day sheet) keep their gestures.
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
        // Swipe-to-delete fires this without awaiting, so a failed write would
        // otherwise be an unhandled rejection — and the chip would spring back
        // with no explanation.
        toast.error('Could not delete session', {
          description: isOffline()
            ? "You're offline — reconnect and try again."
            : 'Something went wrong. Please try again.',
        })
      }
    },
    [uid],
  )

  /**
   * Tapping a day opens its card — always, including an empty one.
   *
   * It used to open only for a day holding more than one session, because there
   * was nothing to do on an empty day. There is now: an empty future day is
   * where you plan, and the card is where planning happens.
   */
  const handleDayPress = useCallback((day: CalendarDay) => {
    haptics.light()
    setSelectedIso(day.isoDate)
    setDayListOpen(true)
  }, [])

  // The selection is held as a date key, not as the CalendarDay object that was
  // tapped: the sheet and the bar have to follow Firestore, so an edit or a
  // delete made from inside them updates what they're showing instead of
  // stranding a stale snapshot on screen.
  const selectedDay = useMemo(
    () => (selectedIso ? (weeks.flat().find((d) => d.isoDate === selectedIso) ?? null) : null),
    [weeks, selectedIso],
  )

  /**
   * The week the summary line speaks for: the row holding the selected day, or
   * the row holding today, or the first row of the month on screen.
   *
   * A week rather than the whole month on purpose. "You have four planned
   * conflicts in August" is a statistic; "Combat Tue → Running Wed" is something
   * an athlete can act on this afternoon, and a week is the unit they plan in.
   */
  const focusWeek = useMemo(() => {
    if (weeks.length === 0) return []
    const containsSelected = selectedIso
      ? weeks.find((week) => week.some((d) => d.isoDate === selectedIso))
      : undefined
    return containsSelected ?? weeks.find((week) => week.some((d) => d.isToday)) ?? weeks[0]
  }, [weeks, selectedIso])

  // De-duplicated: a clash spans two days and both of them are usually in the
  // same row, so a naive flatMap would list every conflict twice.
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

  /**
   * Apply one of the engine's resolutions to a plan.
   *
   * An update rather than a delete-and-add, so the plan keeps its id and the
   * card the athlete is looking at does not lose the document underneath it
   * mid-tap. Nothing is recomputed here: the date, sport, duration and intensity
   * written are exactly what `suggestConflictResolution` returned.
   *
   * No imperative re-check afterwards either. The plans listener re-runs
   * `detectPlannedConflicts` over the whole calendar on the next snapshot, so
   * the warning clears itself — a second check here would be a second source of
   * truth about the same week.
   */
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

  /**
   * The engine's inputs, held stable across renders.
   *
   * Memoised rather than built inline in the JSX. `ConflictResolutionChips`
   * memoises the call to `suggestConflictResolution` on these objects, and a
   * fresh `profile` and `metrics` literal on every render would give that memo
   * new identities every time — recomputing the resolutions, and a new `now`
   * with them, on every keystroke-level re-render of the screen.
   *
   * `undefined` until the profile carries an interaction matrix: without it the
   * engine has no knowledge base to reason from, and the sheet falls back to
   * being the pure explanation it was before.
   */
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
        // No "conflict?" check here: the live snapshot re-runs
        // `detectPlannedConflicts` over the whole calendar, so the warning (or
        // its absence) lands on the grid and in the week summary by itself. A
        // second, imperative check would be a second source of truth.
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

  /**
   * Hand a day off to the Log tab.
   *
   * The Planner deliberately owns no logging UI — the Log screen is where a
   * session's real inputs live, and duplicating that here would give the app two
   * places to log from that could drift apart. It routes with the day as a
   * param, which the Log screen already understands and now shows in an editable
   * Date field.
   *
   * The sheet is closed first: it is a plain in-screen overlay rather than a
   * modal, so it would otherwise still be sitting over the Planner when the user
   * came back from logging.
   */
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

  // Deleting the last item of an open day still leaves a card worth showing —
  // it holds the "plan a session" action — so the sheet stays until dismissed.
  const sheetDay = dayListOpen ? selectedDay : null

  const isCurrentMonth = monthOffset === 0
  const monthIsEmpty = !plan.loading && sessionCount === 0 && plannedCount === 0

  /** Where the empty state's CTA plans: today, or the 1st of the month on screen. */
  const defaultPlanIso = isCurrentMonth
    ? localISODate(new Date())
    : localISODate(plan.monthStart)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />

      {/* --- Header --------------------------------------------------- */}
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
        {/* Year stepper (left) + jump-to-today (right). */}
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

        {/* Month name + month stepper. */}
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

        {/* Month summary — the only aggregate on the screen, kept to one line. */}
        <Text style={{ marginTop: 2, fontSize: 12.5, color: colors.textSubtle }}>
          {monthSummary(sessionCount, totalHours, totalLoad, plannedCount)}
        </Text>
      </View>

      {/* --- The week, summarised ------------------------------------- */}
      {/* Pinned under the header rather than dropped below the grid: the grid
          claims every spare pixel of the page, so anything after it is off the
          bottom of a tall month — and a summary you have to scroll to find is
          not a summary. It tracks the selected week, so tapping around the
          calendar re-reads it. */}
      {!plan.loading ? (
        <View style={{ paddingHorizontal: 20 }}>
          <PlannedConflictSummary
            conflicts={weekPlannedConflicts}
            plannedCount={weekPlannedCount}
            onPress={openPlannedSheet}
          />
        </View>
      ) : null}

      {/* --- Calendar -------------------------------------------------- */}
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
          {/* The grid stretches to fill the page — except on an empty month,
              where the space belongs to the empty state underneath it. */}
          <Animated.View style={[gridStyle, monthIsEmpty ? null : { flex: 1 }]}>
            {/* First load: show the grid's shape rather than a month of empty
                cells, which would read as "you trained nothing" right before
                the real data replaces it. */}
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

      {/* --- Selected day bar ------------------------------------------ */}
      <SelectedDayBar
        day={selectedDay}
        onPress={() => selectedDay && handleDayPress(selectedDay)}
        onPlan={() => setPlanningIso(selectedDay?.isoDate ?? defaultPlanIso)}
      />

      {/* Day card. Rendered before the modals below on purpose — it's a plain
          overlay, so the real <Modal>s stack above it and closing one drops the
          user back onto the day they came from. */}
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
          // Catch attached at the call site: a bare `void promise` whose write
          // fails is an unhandled rejection, which a release build treats as
          // fatal.
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

/** "4 sessions · 5.2 h · 1,840 AU · 3 planned" — whichever halves exist. */
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

/* ------------------------------------------------------------------ */
/* Selected day summary                                                */
/* ------------------------------------------------------------------ */
/**
 * The strip under the grid. It is the way back into a day whose card was closed,
 * and — for a day with nothing on it — the shortest route to planning one.
 */
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
        // Fixed height whatever it's showing, so tapping around the grid never
        // makes the calendar above it jump.
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

/* ------------------------------------------------------------------ */
/* Navigation chevron                                                  */
/* ------------------------------------------------------------------ */
function Chevron({
  direction,
  label,
  onPress,
  subtle = false,
}: {
  direction: 'left' | 'right'
  label: string
  onPress: () => void
  /** The quieter treatment used by the year stepper, which shouldn't compete
   *  with the month arrows next to the month name. */
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
