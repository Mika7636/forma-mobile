import { Modal, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { useTheme } from '../../theme/ThemeProvider'
interface FormInfoModalProps {
  visible: boolean
  onClose: () => void
  /**
   * Opened from the calibrating hero rather than the real one.
   *
   * Adds the paragraph explaining *why* there is no number yet. That text used
   * to be printed on the calibration card itself, under the progress bar,
   * where it was a block of hedging between the reader and the one button that
   * moves the bar. It belongs behind the affordance whose whole job is
   * answering "why", which is this one.
   */
  building?: boolean
}

/**
 * Explainer for the Form Score card. Reachable from the ℹ️ on both the normal
 * and the calibrating hero, so a new user understands why their score reads
 * "estimated" — or is missing entirely — during the first weeks. Scaffold
 * forked from ConflictModal.
 */
export default function FormInfoModal({ visible, onClose, building }: FormInfoModalProps) {
  const { colors } = useTheme()

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(150)}
        style={{
          flex: 1,
          backgroundColor: colors.scrim,
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          entering={FadeInDown.duration(220)}
          style={{
            backgroundColor: colors.surface,
            borderRadius: 20,
            paddingTop: 24,
            paddingBottom: 20,
            paddingHorizontal: 22,
            shadowColor: colors.shadow,
            shadowOpacity: 0.25,
            shadowRadius: 24,
            shadowOffset: { width: 0, height: 12 },
            elevation: 12,
          }}
        >
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                backgroundColor: colors.accentSoft,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text style={{ fontSize: 30 }}>⚖️</Text>
            </View>
          </View>

          <Text
            style={{
              fontSize: 19,
              fontWeight: '800',
              color: colors.text,
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            {building ? 'Why there’s no score yet' : 'About your Form Score'}
          </Text>

          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: colors.textBody,
              textAlign: 'center',
            }}
          >
            Your Form Score measures the balance between fitness and fatigue. It becomes
            more accurate as you log more sessions. The first 2–3 weeks are a calibration
            period where FORMA learns your training baseline.
          </Text>

          {building ? (
            <Text
              style={{
                marginTop: 12,
                fontSize: 15,
                lineHeight: 22,
                color: colors.textBody,
                textAlign: 'center',
              }}
            >
              Fitness and fatigue are rolling averages over 42 and 7 days, so the score
              needs both time and training days behind it: about two weeks since your
              first session, and at least six separate days you actually trained. Until
              both are there, FORMA holds the number back rather than showing you one it
              can&apos;t stand behind.
            </Text>
          ) : null}

          <Pressable
            onPress={() => {
              haptics.light()
              onClose()
            }}
            // Plain object, not a function: NativeWind's interop never invokes
            // the function form, which would render this button unstyled.
            style={{
              height: 50,
              borderRadius: 12,
              marginTop: 20,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.accent,
            }}
          >
            <Text style={{ color: colors.onAccent, fontSize: 16, fontWeight: '700' }}>
              Got it
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}
