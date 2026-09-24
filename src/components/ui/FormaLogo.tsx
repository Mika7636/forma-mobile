// The FORMA wordmark.

import { Text, View } from 'react-native'
import { useTheme } from '../../theme/ThemeProvider'
interface FormaLogoProps {
  size?: number
}

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
