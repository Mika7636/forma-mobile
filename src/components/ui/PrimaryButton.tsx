import { ActivityIndicator, Text, type StyleProp, type ViewStyle } from 'react-native'
import { COLORS, MIN_TOUCH, RADIUS } from '../../constants/theme'
import PressableScale from './PressableScale'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * The app's full-width teal CTA. Springs down to 0.97 while held, medium haptic
 * on press, and a spinner (replacing the label) while `loading`.
 *
 * Press feedback lives in PressableScale rather than here — partly to keep this
 * to one job, and partly because that's where the "never pass a function to
 * `style`" rule is enforced. NativeWind's interop silently drops the function
 * form, which renders the button with no styling at all and no error anywhere.
 */
export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading

  return (
    <PressableScale
      onPress={onPress}
      disabled={isDisabled}
      // A disabled button that still springs would imply something happened.
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
          backgroundColor: isDisabled ? COLORS.tealDark : COLORS.teal,
          opacity: isDisabled ? 0.7 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.onAccent} />
      ) : (
        <Text style={{ color: COLORS.onAccent, fontSize: 17, fontWeight: '700' }}>{label}</Text>
      )}
    </PressableScale>
  )
}
