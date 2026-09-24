// The Progress screen before there is enough history to chart.

import { ScrollView, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import SustainableRangePreview from './SustainableRangePreview'
import PrimaryButton from '../ui/PrimaryButton'
import ThemedStatusBar from '../ui/ThemedStatusBar'
import { useTabContentPadding } from '../../hooks/useTabContentPadding'
import { BASELINE_DAYS, PROGRESS_UNLOCK_SESSIONS } from '../../utils/calibration'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

interface ProgressPrimerProps {
  logged: number
  onLogSession: () => void
}

export default function ProgressPrimer({ logged, onLogSession }: ProgressPrimerProps) {
  const { colors } = useTheme()
  const tabPadding = useTabContentPadding()

  const target = PROGRESS_UNLOCK_SESSIONS
  const remaining = Math.max(0, target - logged)

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
      <ThemedStatusBar />
      <ScrollView
        contentContainerStyle={{
          padding: SPACING.base,
          paddingBottom: tabPadding,
          gap: SPACING.base,
        }}
        showsVerticalScrollIndicator={false}
      >
        <View>
          <Text style={{ fontSize: TYPE.display, fontWeight: WEIGHT.heavy, color: colors.text }}>
            Progress
          </Text>
          <Text style={{ marginTop: 2, fontSize: TYPE.body, color: colors.textMuted }}>
            Your last twelve weeks, one bar per week
          </Text>
        </View>

        <SustainableRangePreview />

        <View style={cardStyle(colors)}>
          <Text style={{ fontSize: TYPE.title, fontWeight: WEIGHT.heavy, color: colors.text }}>
            {remaining === 0
              ? 'Your chart is nearly ready'
              : `${remaining} more session${remaining === 1 ? '' : 's'} to fill it in`}
          </Text>
          <Text
            style={{
              marginTop: 6,
              fontSize: TYPE.small,
              lineHeight: 19,
              color: colors.textMuted,
            }}
          >
            Bars appear once there are {target} sessions to draw a trend from. Your own
            sustainable range settles after {BASELINE_DAYS} days you actually trained, when
            FORMA has enough to work it out from.
          </Text>

          <View style={{ marginTop: SPACING.base }}>
            <Text
              style={{
                fontSize: TYPE.small,
                fontWeight: WEIGHT.bold,
                color: colors.textBody,
                marginBottom: SPACING.sm,
              }}
            >
              {logged} of {target} sessions
            </Text>
            <View
              style={{
                height: 8,
                borderRadius: RADIUS.pill,
                backgroundColor: colors.border,
                overflow: 'hidden',
              }}
            >
              <View
                style={{
                  width: `${Math.max(0, Math.min(logged / target, 1)) * 100}%`,
                  height: '100%',
                  borderRadius: RADIUS.pill,
                  backgroundColor: colors.accent,
                }}
              />
            </View>
          </View>

          <View style={{ marginTop: SPACING.lg }}>
            <PrimaryButton label="Log a session" onPress={onLogSession} />
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}
