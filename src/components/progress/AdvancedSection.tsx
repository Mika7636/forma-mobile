// Collapsed expander at the foot of the Progress screen.

import { useState, type ReactNode } from 'react'
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface AdvancedSectionProps {
  title: string
  subtitle?: string
  children: ReactNode
}

export default function AdvancedSection({ title, subtitle, children }: AdvancedSectionProps) {
  const { colors } = useTheme()
  const [open, setOpen] = useState(false)

  const toggle = () => {
    haptics.light()
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setOpen((v) => !v)
  }

  return (
    <View>
      <Pressable
        onPress={toggle}
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        style={{
          minHeight: MIN_TOUCH,
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.surface,
          borderRadius: RADIUS.card,
          borderWidth: 1,
          borderColor: colors.border,
          paddingHorizontal: SPACING.base,
          paddingVertical: SPACING.md,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: TYPE.bodyLg, fontWeight: WEIGHT.bold, color: colors.textBody }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ marginTop: 2, fontSize: TYPE.micro, color: colors.textSubtle }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        <Text style={{ fontSize: TYPE.body, color: colors.textMuted, marginLeft: SPACING.sm }}>
          {open ? 'Hide' : 'Show'}
        </Text>
        <Text
          style={{
            fontSize: TYPE.subtitle,
            color: colors.textMuted,
            marginLeft: 6,
            transform: [{ rotate: open ? '90deg' : '0deg' }],
          }}
        >
          ›
        </Text>
      </Pressable>

      {open ? <View style={{ marginTop: SPACING.base }}>{children}</View> : null}
    </View>
  )
}
