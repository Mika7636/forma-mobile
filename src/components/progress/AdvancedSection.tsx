import { useState, type ReactNode } from 'react'
import { LayoutAnimation, Platform, Pressable, Text, UIManager, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

// LayoutAnimation is opt-in on old-architecture Android and a no-op without
// this. Harmless on the new architecture and on iOS, where it is already on.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface AdvancedSectionProps {
  title: string
  /** One line under the title, explaining who this is for. */
  subtitle?: string
  children: ReactNode
}

/**
 * A collapsed expander at the foot of the Progress screen.
 *
 * The Fitness/Fatigue/Form chart lives in here now. It was the screen's hero and
 * it was the wrong hero: it is a picture of the *model*, and reading it needs
 * three definitions before it says anything. It is still exact, still the thing
 * conflict detection runs on, and some athletes genuinely want it — so it is
 * kept verbatim rather than simplified, and moved off the default path rather
 * than deleted.
 *
 * Collapsed by default and cheap when closed: the children are not mounted at
 * all until it is opened, so the SVG behind it costs nothing for the majority
 * who never expand it.
 */
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
            // A rotated chevron rather than two glyphs, so the arrow the eye
            // tracks is the same object before and after.
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
