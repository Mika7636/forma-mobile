// The status bar, in FORMA's own theme rather than the OS scheme.

import { StatusBar } from 'expo-status-bar'
import { useTheme } from '../../theme/ThemeProvider'

export default function ThemedStatusBar() {
  const { scheme } = useTheme()
  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
}
