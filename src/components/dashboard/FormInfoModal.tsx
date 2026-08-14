import { Modal, Pressable, Text, View } from 'react-native'
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated'
import { haptics } from '../../utils/haptics'
import { COLORS } from '../../constants/theme'

interface FormInfoModalProps {
  visible: boolean
  onClose: () => void
}

/**
 * Explainer for the Form Score card. Reachable from the ℹ️ on both the normal
 * and the calibrating hero, so a new user understands why their score reads
 * "estimated" during the first weeks. Scaffold forked from ConflictModal.
 */
export default function FormInfoModal({ visible, onClose }: FormInfoModalProps) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Animated.View
        entering={FadeIn.duration(150)}
        style={{
          flex: 1,
          backgroundColor: 'rgba(17, 24, 39, 0.55)',
          justifyContent: 'center',
          paddingHorizontal: 24,
        }}
      >
        <Animated.View
          entering={FadeInDown.duration(220)}
          style={{
            backgroundColor: COLORS.white,
            borderRadius: 20,
            paddingTop: 24,
            paddingBottom: 20,
            paddingHorizontal: 22,
            shadowColor: '#000',
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
                backgroundColor: COLORS.tealSoft,
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
              color: COLORS.ink,
              textAlign: 'center',
              marginBottom: 12,
            }}
          >
            About your Form Score
          </Text>

          <Text
            style={{
              fontSize: 15,
              lineHeight: 22,
              color: COLORS.body,
              textAlign: 'center',
            }}
          >
            Your Form Score measures the balance between fitness and fatigue. It becomes
            more accurate as you log more sessions. The first 2–3 weeks are a calibration
            period where FORMA learns your training baseline.
          </Text>

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
              backgroundColor: COLORS.teal,
            }}
          >
            <Text style={{ color: COLORS.white, fontSize: 16, fontWeight: '700' }}>
              Got it
            </Text>
          </Pressable>
        </Animated.View>
      </Animated.View>
    </Modal>
  )
}
