import { Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

interface ScreenPlaceholderProps {
  title: string
  subtitle?: string
}

/**
 * Temporary placeholder shown by every screen until the real UI is built in
 * Week 2. Also doubles as the NativeWind smoke test — the FORMA badge below uses
 * `className="bg-teal-500"` / `text-white`, so if it renders teal, Tailwind
 * classes are wired up correctly.
 */
export default function ScreenPlaceholder({ title, subtitle }: ScreenPlaceholderProps) {
  return (
    <SafeAreaView className="flex-1 bg-white" edges={['top']}>
      <View className="flex-1 items-center justify-center px-6">
        <View className="mb-5 rounded-full bg-teal-500 px-5 py-2">
          <Text className="text-base font-bold tracking-widest text-white">FORMA</Text>
        </View>
        <Text className="text-2xl font-bold text-neutral-900">{title}</Text>
        {subtitle ? (
          <Text className="mt-2 text-center text-base text-neutral-500">{subtitle}</Text>
        ) : null}
      </View>
    </SafeAreaView>
  )
}
