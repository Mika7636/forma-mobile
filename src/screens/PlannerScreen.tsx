// Training calendar — the whole month on one surface, Apple Calendar style.
// Swipe (or tap the arrows) to move between months, tap a day to open what you
// trained on it. Nothing is logged from here: the Log tab owns that, so this
// screen stays a read-only view of what actually happened.
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
import DaySessionsSheet from '../components/planner/DaySessionsSheet'
import MonthGrid from '../components/planner/MonthGrid'
import PlannerSkeleton from '../components/planner/PlannerSkeleton'
import SessionDetailModal from '../components/session/SessionDetailModal'
import EmptyState from '../components/ui/EmptyState'
import { useMonthPlan, type CalendarDay } from '../hooks/useMonthPlan'
import { deleteSession, resolveConflict } from '../services/sessionService'
import { useAuthStore } from '../store/authStore'
import { isOffline } from '../store/networkStore'
import { toast } from '../store/toastStore'
import { formatThousands } from '../utils/formatting'
import type { Conflict } from '../types/conflict'
import type { Session } from '../types/session'
import type { PlannerScreenProps } from '../navigation/types'
import { RADIUS, SPACING } from '../theme/tokens'
import { useTheme } from '../theme/ThemeProvider'

/** Horizontal drag needed to commit a month change. */
const SWIPE_THRESHOLD = 70
/** How far the grid slides during a month transition. */
const SLIDE_DISTANCE = 60
/** Months in a year — the step the year chevrons take. */
const YEAR = 12

// Navigation props are unused: this screen is a pure view of logged sessions,
// and everything it opens is a sheet rendered in place.
export default function PlannerScreen(_props: PlannerScreenProps) {
  const { colors } = useTheme()

  const uid = useAuthStore((s) => s.user?.uid)

  const [monthOffset, setMonthOffset] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  /** The day ringed on the grid — set by any tap, including empty days. */
  const [selectedIso, setSelectedIso] = useState<string | null>(null)
  /** Whether the selected day's session list is showing. */
  const [dayListOpen, setDayListOpen] = useState(false)
  const [selectedSession, setSelectedSession] = useState<Session | null>(null)
  const [conflictSheet, setConflictSheet] = useState<Conflict[] | null>(null)

  const plan = useMonthPlan(monthOffset)
  const { weeks, monthName, year, totalHours, totalLoad, sessionCount } = plan

  // Flattened month sessions, so the conflict detail sheet can resolve the two
  // sessions each conflict involves.
  const monthSessions = useMemo(
    () => weeks.flat().flatMap((d) => d.sessions),
    [weeks],
  )

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
   * One session goes straight to its detail sheet; several open the day list
   * first, so the user picks which one they meant. An empty day just takes the
   * selection ring, and the bar under the grid says there's nothing there.
   */
  const handleDayPress = useCallback((day: CalendarDay) => {
    haptics.light()
    setSelectedIso(day.isoDate)
    // Set rather than toggled: tapping a one-session day while another day's
    // list is open has to close that list, not leave it under the detail sheet.
    setDayListOpen(day.sessions.length > 1)
    if (day.sessions.length === 1) setSelectedSession(day.sessions[0])
  }, [])

  // The selection is held as a date key, not as the CalendarDay object that was
  // tapped: the sheet and the bar have to follow Firestore, so an edit or a
  // delete made from inside them updates what they're showing instead of
  // stranding a stale snapshot on screen.
  const selectedDay = useMemo(
    () => (selectedIso ? (weeks.flat().find((d) => d.isoDate === selectedIso) ?? null) : null),
    [weeks, selectedIso],
  )

  // Deleting the last session of an open day closes the list rather than
  // leaving an empty sheet behind.
  const sheetDay = dayListOpen && selectedDay && selectedDay.sessions.length > 0 ? selectedDay : null

  const isCurrentMonth = monthOffset === 0
  const monthIsEmpty = !plan.loading && sessionCount === 0

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
              fontWeight: '700',
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
                fontSize: 13,
                fontWeight: '700',
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
            style={{ flex: 1, fontSize: 34, fontWeight: '800', color: colors.text }}
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
          {sessionCount === 0
            ? 'No sessions logged'
            : `${sessionCount} session${sessionCount === 1 ? '' : 's'} · ${totalHours.toFixed(
                1,
              )} h · ${formatThousands(totalLoad)} AU`}
        </Text>
      </View>

      {/* --- Calendar -------------------------------------------------- */}
      <GestureDetector gesture={monthSwipe}>
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            paddingHorizontal: 8,
            paddingTop: 12,
            paddingBottom: 24,
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
              tone="quiet"
              emoji="🗓️"
              title="Nothing logged this month"
              message="Sessions you log appear here as coloured dots — one per sport."
              style={{ marginTop: SPACING.lg, marginHorizontal: 12 }}
            />
          ) : null}
        </ScrollView>
      </GestureDetector>

      {/* --- Selected day bar ------------------------------------------ */}
      <SelectedDayBar
        day={selectedDay}
        onPress={() => selectedDay && handleDayPress(selectedDay)}
      />

      {/* Day list. Rendered before the modals below on purpose — it's a plain
          overlay, so the real <Modal>s stack above it and closing one drops the
          user back onto the day they came from. */}
      <DaySessionsSheet
        day={sheetDay}
        onClose={() => setDayListOpen(false)}
        onSessionPress={setSelectedSession}
        onSessionDelete={handleDelete}
        onConflictPress={setConflictSheet}
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
    </SafeAreaView>
  )
}

/* ------------------------------------------------------------------ */
/* Selected day summary                                                */
/* ------------------------------------------------------------------ */
/**
 * The strip under the grid. It's where an empty day gets its answer — tapping
 * one can't open anything, so the "no sessions" state has to live somewhere
 * visible — and it doubles as the way back into a day whose sheet was closed.
 */
function SelectedDayBar({ day, onPress }: { day: CalendarDay | null; onPress: () => void }) {
  const { colors } = useTheme()

  const count = day?.sessions.length ?? 0

  return (
    <Pressable
      onPress={count > 0 ? onPress : undefined}
      disabled={count === 0}
      accessibilityRole={count > 0 ? 'button' : undefined}
      style={{
        // Fixed height whatever it's showing, so tapping around the grid never
        // makes the calendar above it jump.
        height: 54,
        justifyContent: 'center',
        paddingHorizontal: 20,
        backgroundColor: colors.surface,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      {day == null ? (
        <Text style={{ fontSize: 13, color: colors.textSubtle }}>
          Tap a day to see what you trained.
        </Text>
      ) : (
        <>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.text }}>
            {day.date.toLocaleDateString(undefined, {
              weekday: 'short',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Text style={{ marginTop: 1, fontSize: 12.5, color: colors.textMuted }}>
            {count === 0
              ? 'No sessions'
              : `${count} session${count === 1 ? '' : 's'} · ${day.dayHours.toFixed(
                  1,
                )} h · ${day.dayLoad} AU`}
          </Text>
        </>
      )}
    </Pressable>
  )
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
          fontWeight: '700',
          color: subtle ? colors.textSubtle : colors.textBody,
          marginTop: -3,
        }}
      >
        {direction === 'left' ? '‹' : '›'}
      </Text>
    </Pressable>
  )
}
