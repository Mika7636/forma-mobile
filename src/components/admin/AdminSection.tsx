// Admin section band, plus its Stat and ChartEmpty primitives.

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

export function Stat({
  label,
  value,
  small = false,
  hint,
}: {
  label: string
  value: string
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
