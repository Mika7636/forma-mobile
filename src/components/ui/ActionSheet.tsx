// The app's overflow menu: a scrim plus actions from the bottom.

import { Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'
import { MIN_TOUCH, MOTION, RADIUS, SPACING, TYPE, WEIGHT } from '../../theme/tokens'

export interface ActionSheetItem {
  label: string
  description?: string
  destructive?: boolean
  onPress: () => void
}

interface ActionSheetProps {
  visible: boolean
  title?: string
  items: ActionSheetItem[]
  onClose: () => void
  cancelLabel?: string
}

export default function ActionSheet({
  visible,
  title,
  items,
  onClose,
  cancelLabel = 'Cancel',
}: ActionSheetProps) {
  const { colors } = useTheme()
  const insets = useSafeAreaInsets()

  if (!visible) return null

  const run = (item: ActionSheetItem) => {
    onClose()
    if (item.destructive) haptics.warning()
    else haptics.light()
    item.onPress()
  }

  return (
    <View
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'flex-end' }}
    >
      <Animated.View
        entering={FadeIn.duration(MOTION.fast)}
        exiting={FadeOut.duration(MOTION.fast)}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Dismiss menu"
          onPress={onClose}
          style={{ flex: 1, backgroundColor: colors.scrim }}
        />
      </Animated.View>

      <Animated.View
        entering={SlideInDown.duration(MOTION.base).springify().damping(20)}
        exiting={SlideOutDown.duration(MOTION.fast)}
        style={{
          paddingHorizontal: SPACING.md,
          paddingBottom: insets.bottom + SPACING.md,
        }}
      >
        <View
          style={{
            backgroundColor: colors.surface,
            borderRadius: RADIUS.lg,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            ...colors.shadowFloating,
          }}
        >
          {title ? (
            <Text
              style={{
                paddingHorizontal: SPACING.base,
                paddingTop: SPACING.md,
                paddingBottom: SPACING.sm,
                fontSize: TYPE.micro,
                fontWeight: WEIGHT.bold,
                letterSpacing: 1,
                color: colors.textSubtle,
              }}
            >
              {title.toUpperCase()}
            </Text>
          ) : null}

          {items.map((item, i) => (
            <View key={item.label}>
              {i > 0 ? <View style={{ height: 1, backgroundColor: colors.border }} /> : null}
              <Pressable
                onPress={() => run(item)}
                accessibilityRole="button"
                accessibilityLabel={item.label}
                style={{
                  minHeight: MIN_TOUCH,
                  paddingHorizontal: SPACING.base,
                  paddingVertical: SPACING.md,
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: TYPE.subtitle,
                    fontWeight: WEIGHT.semibold,
                    color: item.destructive ? colors.dangerText : colors.text,
                  }}
                >
                  {item.label}
                </Text>
                {item.description ? (
                  <Text style={{ marginTop: 2, fontSize: TYPE.micro, color: colors.textSubtle }}>
                    {item.description}
                  </Text>
                ) : null}
              </Pressable>
            </View>
          ))}
        </View>

        <Pressable
          onPress={onClose}
          accessibilityRole="button"
          style={{
            marginTop: SPACING.sm,
            minHeight: MIN_TOUCH + 4,
            borderRadius: RADIUS.lg,
            backgroundColor: colors.surface,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center',
            justifyContent: 'center',
            ...colors.shadowFloating,
          }}
        >
          <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.bold, color: colors.textBody }}>
            {cancelLabel}
          </Text>
        </Pressable>
      </Animated.View>
    </View>
  )
}
