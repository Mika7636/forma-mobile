// The month calendar itself: a weekday header and 4–6 rows of day cells.
//
// A cell is deliberately quiet — a date number, and under it one dot per
// session tinted by sport. That's the whole language of the screen: scan the
// grid and you can see which days you trained and roughly what you did.
import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import { severityStyle, worstSeverity } from '../../constants/conflictColors'
import { WEEKDAY_INITIALS, type CalendarDay } from '../../hooks/useMonthPlan'
import { sportVisual } from '../../utils/sportMeta'
import { RADIUS } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

/** Dots rendered before the row collapses into "N dots + overflow count". */
const MAX_DOTS = 3
/** Diameter of a session dot. */
const DOT = 6
/** The circle behind a date number — sized for a comfortable tap target. */
const CIRCLE = 34

interface MonthGridProps {
  weeks: CalendarDay[][]
  /** Day currently highlighted with a ring, if any. */
  selectedIso: string | null
  onDayPress: (day: CalendarDay) => void
}

function MonthGrid({ weeks, selectedIso, onDayPress }: MonthGridProps) {
  const { colors } = useTheme()

  return (
    // The grid claims the height its parent gives it and splits it evenly
    // between the rows, so a 5-row month and a 6-row one both fill the screen
    // instead of leaving a band of dead space under the last week.
    <View style={{ flex: 1 }}>
      {/* Column headers. The initials repeat (S…S, T…T), so the position in the
          row is the key rather than the letter. */}
      <View style={{ flexDirection: 'row', marginBottom: 4 }}>
        {WEEKDAY_INITIALS.map((letter, i) => (
          <Text
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontSize: 12,
              fontWeight: '700',
              letterSpacing: 0.5,
              color: colors.textSubtle,
            }}
          >
            {letter}
          </Text>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {weeks.map((week) => (
          <View key={week[0].isoDate} style={{ flex: 1, flexDirection: 'row' }}>
            {week.map((day) => (
              <DayCell
                key={day.isoDate}
                day={day}
                selected={day.isoDate === selectedIso}
                onPress={onDayPress}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  )
}

export default memo(MonthGrid)

/* ------------------------------------------------------------------ */
/* One day                                                             */
/* ------------------------------------------------------------------ */
function DayCell({
  day,
  selected,
  onPress,
}: {
  day: CalendarDay
  selected: boolean
  onPress: (day: CalendarDay) => void
}) {
  const { colors } = useTheme()

  const { isToday, inMonth, sessions, conflicts } = day
  const count = sessions.length

  // Today outranks selection: it is the one fixed landmark on the grid, so a
  // selected today keeps its marker and gains nothing else.
  //
  // A *ring*, not a filled disc. A solid accent circle was right on a white
  // grid; on dark it is a bright dot competing with the coloured session dots
  // directly beneath it, which are the actual data on this screen. An outline
  // marks the day just as unambiguously and stays quieter than the content.
  const circleBg = !isToday && selected ? colors.accentSoft : 'transparent'
  const ringColor = isToday ? colors.accent : 'transparent'
  const numberColor = isToday
    ? colors.accentText
    : !inMonth
      ? // Out-of-month days: present, dateable, clearly not part of this month.
        colors.textSubtle
      : selected
        ? colors.accentText
        : colors.text

  const label = day.date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  return (
    <Pressable
      onPress={() => onPress(day)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={
        count === 0
          ? `${label}, no sessions`
          : `${label}, ${count} session${count === 1 ? '' : 's'}`
      }
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: 8,
        // Content sits at the top of the cell, Apple Calendar style: the row's
        // spare height goes below the dots, so the date numbers stay on an even
        // baseline whatever the row height works out to. The floor keeps a
        // 6-row month legible on a short screen.
        minHeight: CIRCLE + DOT + 16,
        // The whole cell recedes when it belongs to a neighbouring month —
        // number, dots and conflict marks together. Dimming only the number
        // left the dots at full strength, so an adjacent month's sessions read
        // as this month's.
        opacity: inMonth ? 1 : 0.45,
      }}
    >
      <View
        style={{
          width: CIRCLE,
          height: CIRCLE,
          // RADIUS.pill, not CIRCLE / 2: Android drops a half-width radius on
          // the selected day's tint (verified on-device — the tint rendered as
          // a square while today's identical circle stayed round). An
          // over-large radius clamps to a circle and can't be dropped.
          borderRadius: RADIUS.pill,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: circleBg,
          borderWidth: isToday ? 1.5 : 0,
          borderColor: ringColor,
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: isToday || selected ? '800' : '600',
            color: numberColor,
          }}
        >
          {day.dayNumber}
        </Text>
      </View>

      <SessionDots sessions={sessions} dimmed={!inMonth} />

      {/* Unresolved conflict marker, tucked into the corner so it never
          competes with the date number. */}
      {conflicts.length > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            right: 6,
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: severityStyle(worstSeverity(conflicts), colors).solid,
            opacity: inMonth ? 1 : 0.4,
          }}
        />
      ) : null}
    </Pressable>
  )
}

/* ------------------------------------------------------------------ */
/* Sport dots                                                          */
/* ------------------------------------------------------------------ */
function SessionDots({ sessions, dimmed }: { sessions: CalendarDay['sessions']; dimmed: boolean }) {
  const { colors } = useTheme()

  // The row keeps its height even when empty — see the minHeight note above.
  if (sessions.length === 0) return <View style={{ height: DOT, marginTop: 4 }} />

  const shown = sessions.slice(0, MAX_DOTS)
  const overflow = sessions.length - shown.length

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        height: DOT,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      {shown.map((session, i) => (
        <View
          key={session.id}
          style={{
            width: DOT,
            height: DOT,
            borderRadius: DOT / 2,
            marginLeft: i === 0 ? 0 : 3,
            backgroundColor: sportVisual(session.sport, colors).color,
          }}
        />
      ))}
      {overflow > 0 ? (
        <Text
          style={{
            marginLeft: 2,
            fontSize: 9,
            lineHeight: DOT + 2,
            fontWeight: '800',
            color: colors.textMuted,
          }}
        >
          +{overflow}
        </Text>
      ) : null}
    </View>
  )
}
