// The app's full-width primary CTA button.

import { ActivityIndicator, Text, type StyleProp, type ViewStyle } from 'react-native'
import PressableScale from './PressableScale'
import { MIN_TOUCH, RADIUS } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const { colors } = useTheme()

  const isDisabled = disabled || loading

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      variant={isDisabled ? 'none' : 'button'}
      haptic={isDisabled ? null : 'medium'}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      style={[
        {
          height: 54,
          minHeight: MIN_TOUCH,
          borderRadius: RADIUS.md,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDisabled ? colors.accentPressed : colors.accent,
          opacity: isDisabled ? 0.7 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.onAccent} />
      ) : (
        <Text style={{ color: colors.onAccent, fontSize: 17, fontWeight: '700' }}>{label}</Text>
      )}
    </PressableScale>
  )
}
