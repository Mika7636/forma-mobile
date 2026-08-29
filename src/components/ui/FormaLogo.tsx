import { Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
interface FormaLogoProps {
  /** Font size of the wordmark. Defaults to a large hero size. */
  size?: number
}

/** The teal "FORMA" wordmark, centered. Used on auth + onboarding screens. */
export default function FormaLogo({ size = 44 }: FormaLogoProps) {
  const { colors } = useTheme()

  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={{
          fontSize: size,
          fontWeight: '800',
          letterSpacing: size * 0.12,
          color: colors.accent,
        }}
      >
        FORMA
      </Text>
    </View>
  )
}
