import { Pressable, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import TabIcon from './TabIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { IMAGERY_INK, IMAGERY_SCRIM, MIN_TOUCH, RADIUS } from '../../theme/tokens'

interface OverflowButtonProps {
  onPress: () => void
  /**
   * Draw a translucent disc behind the glyph.
   *
   * The workout summary puts this over a live route map, where a bare glyph is
   * three dots on whatever the satellite happened to see. On a plain surface the
   * disc is unnecessary chrome.
   */
  onImagery?: boolean
  /** Overrides the glyph colour. Rarely needed — see `onImagery`. */
  color?: string
}

/**
 * The three-dot overflow button.
 *
 * A real vector glyph rather than a `⋯` character or an emoji: it takes the
 * theme's colour, holds its shape at 22pt on a dim panel, and is the same
 * drawing on every Android version. See `TabIcon`.
 */
export default function OverflowButton({ onPress, onImagery, color }: OverflowButtonProps) {
  const { colors } = useTheme()

  return (
    <Pressable
      onPress={() => {
        haptics.light()
        onPress()
      }}
      accessibilityRole="button"
      accessibilityLabel="More actions"
      hitSlop={10}
      style={{
        width: MIN_TOUCH,
        height: MIN_TOUCH,
        borderRadius: RADIUS.pill,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {onImagery ? (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            borderRadius: RADIUS.pill,
            backgroundColor: IMAGERY_SCRIM,
          }}
        />
      ) : null}
      <TabIcon name="more" size={22} color={color ?? (onImagery ? IMAGERY_INK : colors.text)} />
    </Pressable>
  )
}
