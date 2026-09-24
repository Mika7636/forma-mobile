// The three-dot overflow button.

import { Pressable, View } from 'react-native'
import { haptics } from '../../utils/haptics'
import TabIcon from './TabIcon'
import { useTheme } from '../../theme/ThemeProvider'
import { IMAGERY_INK, IMAGERY_SCRIM, MIN_TOUCH, RADIUS } from '../../theme/tokens'

interface OverflowButtonProps {
  onPress: () => void
  onImagery?: boolean
  color?: string
}

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
