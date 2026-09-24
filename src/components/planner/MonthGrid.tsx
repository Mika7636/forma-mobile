// The month calendar grid: weekday header and day cells.

import { memo } from 'react'
import { Pressable, Text, View } from 'react-native'
import {
  plannedSeverityStyle,
  severityStyle,
  worstSeverity,
} from '../../constants/conflictColors'
import { type CalendarDay } from '../../hooks/useMonthPlan'
import { WEEKDAY_INITIALS } from '../../utils/dates'
import { sportVisual } from '../../utils/sportMeta'
import type { PlannedSession } from '../../types/planned'
import type { Session } from '../../types/session'
import { RADIUS } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

const MAX_DOTS = 3
const DOT = 6
const PLANNED_DOT = 7
const CIRCLE = 34

interface MonthGridProps {
  weeks: CalendarDay[][]
  selectedIso: string | null
  onDayPress: (day: CalendarDay) => void
}

function MonthGrid({ weeks, selectedIso, onDayPress }: MonthGridProps) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1 }}>
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

  const { isToday, inMonth, sessions, planned, conflicts, plannedConflicts } = day
  const count = sessions.length

  const circleBg = !isToday && selected ? colors.accentSoft : 'transparent'
  const ringColor = isToday ? colors.accent : 'transparent'
  const numberColor = isToday
    ? colors.accentText
    : !inMonth
      ?
        colors.textSubtle
      : selected
        ? colors.accentText
        : colors.text

  const label = day.date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })

  const spoken = [
    label,
    count === 0 ? 'no sessions' : `${count} session${count === 1 ? '' : 's'}`,
    planned.length > 0 ? `${planned.length} planned` : null,
    conflicts.length > 0 ? 'training conflict' : null,
    plannedConflicts.length > 0 ? 'planned conflict' : null,
  ]
    .filter(Boolean)
    .join(', ')

  return (
    <Pressable
      onPress={() => onPress(day)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={spoken}
      style={{
        flex: 1,
        alignItems: 'center',
        paddingTop: 8,
        minHeight: CIRCLE + DOT + 16,
        opacity: inMonth ? 1 : 0.45,
      }}
    >
      <View
        style={{
          width: CIRCLE,
          height: CIRCLE,
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

      <SessionDots sessions={sessions} planned={planned} dimmed={!inMonth} />

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

      {plannedConflicts.length > 0 ? (
        <View
          style={{
            position: 'absolute',
            top: 4,
            left: 6,
            width: 8,
            height: 8,
            borderRadius: 4,
            borderWidth: 1.5,
            borderColor: plannedSeverityStyle(worstSeverity(plannedConflicts), colors).solid,
            backgroundColor: 'transparent',
            opacity: inMonth ? 1 : 0.4,
          }}
        />
      ) : null}
    </Pressable>
  )
}

function SessionDots({
  sessions,
  planned,
  dimmed,
}: {
  sessions: Session[]
  planned: PlannedSession[]
  dimmed: boolean
}) {
  const { colors } = useTheme()

  if (sessions.length === 0 && planned.length === 0) {
    return <View style={{ height: DOT, marginTop: 4 }} />
  }

  const marks: { key: string; sport: Session['sport']; planned: boolean }[] = [
    ...sessions.map((s) => ({ key: s.id, sport: s.sport, planned: false })),
    ...planned.map((p) => ({ key: `p-${p.id}`, sport: p.sport, planned: true })),
  ]
  const shown = marks.slice(0, MAX_DOTS)
  const overflow = marks.length - shown.length

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 4,
        height: PLANNED_DOT,
        opacity: dimmed ? 0.35 : 1,
      }}
    >
      {shown.map((mark, i) => {
        const color = sportVisual(mark.sport, colors).color
        const size = mark.planned ? PLANNED_DOT : DOT
        return (
          <View
            key={mark.key}
            style={{
              width: size,
              height: size,
              borderRadius: size / 2,
              marginLeft: i === 0 ? 0 : 3,
              backgroundColor: mark.planned ? 'transparent' : color,
              borderWidth: mark.planned ? 1.5 : 0,
              borderColor: color,
            }}
          />
        )
      })}
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
