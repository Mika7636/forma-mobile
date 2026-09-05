// The labelled band each Admin section sits under, and the two primitives its
// cards share.
//
// The screen is seven sections now rather than one stat row and a chart, and at
// that length a reader arriving at a grid of squares has no way to tell what
// question it answers. A heading and one line of window ("All users, last 84
// days") is the difference between a chart and a chart you can quote.
//
// The window belongs in the heading rather than inside each card because it is
// the same window for almost everything on the page — saying it once, above,
// stops seven cards each repeating a slightly different phrasing of it.
import type { ReactNode } from 'react'
import { Text, View } from 'react-native'
import { SPACING, TYPE, WEIGHT } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

export default function AdminSection({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle?: string
  children: ReactNode
}) {
  const { colors } = useTheme()

  return (
    <View style={{ marginTop: SPACING.sm }}>
      <Text
        accessibilityRole="header"
        style={{ fontSize: TYPE.title, fontWeight: WEIGHT.heavy, color: colors.text }}
      >
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
          {subtitle}
        </Text>
      ) : null}
      <View style={{ marginTop: SPACING.md, gap: SPACING.base }}>{children}</View>
    </View>
  )
}

/**
 * One borderless figure in a stat row: small grey label on a shared upper line,
 * the value on the row's common baseline, an optional caption under it.
 *
 * The Progress screen's treatment, kept because the reader wants the whole row
 * at once — boxing each figure would put three borders between four numbers
 * that are meant to be compared. See the note in `ThisWeekBlock`, where it is
 * defined and argued.
 */
export function Stat({
  label,
  value,
  small = false,
  hint,
}: {
  label: string
  value: string
  /** Drop the value a size, for a word rather than a numeral. */
  small?: boolean
  hint?: string
}) {
  const { colors } = useTheme()

  return (
    <View style={{ flex: 1, minWidth: 0, paddingRight: SPACING.sm }}>
      <Text
        numberOfLines={2}
        style={{ fontSize: TYPE.small, color: colors.textMuted, marginBottom: 3 }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          fontSize: small ? TYPE.subtitle : TYPE.heading,
          lineHeight: 27,
          fontWeight: WEIGHT.bold,
          color: colors.text,
        }}
      >
        {value}
      </Text>
      {hint ? (
        <Text numberOfLines={2} style={{ fontSize: TYPE.caption, color: colors.textSubtle }}>
          {hint}
        </Text>
      ) : null}
    </View>
  )
}

/**
 * What a chart renders instead of itself when the window holds no data.
 *
 * A sentence, at the height the plot would have taken, so the page does not jump
 * when a database goes from empty to populated. Every section has one: an admin
 * looking at a brand-new deployment should read "nobody has logged anything yet"
 * and not an axis with a single zero on it, which looks like a chart that failed
 * rather than a database that is empty.
 */
export function ChartEmpty({ message, height = 132 }: { message: string; height?: number }) {
  const { colors } = useTheme()

  return (
    <View
      style={{ height, alignItems: 'center', justifyContent: 'center', paddingHorizontal: SPACING.base }}
    >
      <Text style={{ fontSize: TYPE.small, color: colors.textSubtle, textAlign: 'center' }}>
        {message}
      </Text>
    </View>
  )
}
