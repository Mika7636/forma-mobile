import { Text, View } from 'react-native'
import { COLORS } from '../../constants/theme'

interface FormaLogoProps {
  /** Font size of the wordmark. Defaults to a large hero size. */
  size?: number
}

/** The teal "FORMA" wordmark, centered. Used on auth + onboarding screens. */
export default function FormaLogo({ size = 44 }: FormaLogoProps) {
  return (
    <View style={{ alignItems: 'center' }}>
      <Text
        style={{
          fontSize: size,
          fontWeight: '800',
          letterSpacing: size * 0.12,
          color: COLORS.teal,
        }}
      >
        FORMA
      </Text>
    </View>
  )
}
