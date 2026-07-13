import {
  ActivityIndicator,
  Pressable,
  Text,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import * as Haptics from 'expo-haptics'
import { COLORS } from '../../constants/theme'

interface PrimaryButtonProps {
  label: string
  onPress: () => void
  loading?: boolean
  disabled?: boolean
  style?: StyleProp<ViewStyle>
}

/**
 * Full-width teal CTA. Rounded 12px, white bold label, light haptic on press,
 * and a spinner (replacing the label) while `loading`. Meets the 44px minimum
 * touch target.
 */
export default function PrimaryButton({
  label,
  onPress,
  loading = false,
  disabled = false,
  style,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading

  const handlePress = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    onPress()
  }

  return (
    <Pressable
      onPress={handlePress}
      disabled={isDisabled}
      style={({ pressed }) => [
        {
          height: 54,
          borderRadius: 12,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: isDisabled ? COLORS.tealDark : COLORS.teal,
          opacity: isDisabled ? 0.7 : pressed ? 0.9 : 1,
        },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={COLORS.white} />
      ) : (
        <Text style={{ color: COLORS.white, fontSize: 17, fontWeight: '700' }}>
          {label}
        </Text>
      )}
    </Pressable>
  )
}
