// The titled card every Progress chart sits in.

import { useState, type ReactNode } from 'react'
import {
  LayoutAnimation,
  LayoutChangeEvent,
  Platform,
  Pressable,
  Text,
  UIManager,
  View,
} from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import TabIcon from '../ui/TabIcon'
import { haptics } from '../../utils/haptics'
import { RADIUS, SPACING, TYPE, WEIGHT, cardStyle } from '../../theme/tokens'
import { useTheme } from '../../theme/ThemeProvider'

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface ChartCardProps {
  title: string
  subtitle?: string
  delay?: number
  legend?: ReactNode
  info?: ReactNode
  infoLabel?: string
  children: (width: number) => ReactNode
}

export default function ChartCard({
  title,
  subtitle,
  delay = 0,
  legend,
  info,
  infoLabel,
  children,
}: ChartCardProps) {
  const { colors } = useTheme()

  const [width, setWidth] = useState(0)
  const [showInfo, setShowInfo] = useState(false)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    if (Math.abs(w - width) > 0.5) setWidth(w)
  }

  const toggleInfo = () => {
    haptics.light()
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut)
    setShowInfo((v) => !v)
  }

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(360)} style={cardStyle(colors)}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: TYPE.subtitle, fontWeight: WEIGHT.heavy, color: colors.text }}>
            {title}
          </Text>
          {subtitle ? (
            <Text style={{ marginTop: 2, fontSize: TYPE.small, color: colors.textMuted }}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {info ? (
          <Pressable
            onPress={toggleInfo}
            accessibilityRole="button"
            accessibilityState={{ expanded: showInfo }}
            accessibilityLabel={infoLabel ?? `About ${title}`}
            hitSlop={12}
            style={{ marginLeft: SPACING.sm, paddingTop: 1 }}
          >
            <TabIcon
              name="info"
              size={20}
              color={showInfo ? colors.accentText : colors.textMuted}
              focused={showInfo}
            />
          </Pressable>
        ) : null}
      </View>

      {info && showInfo ? (
        <View
          style={{
            marginTop: SPACING.md,
            backgroundColor: colors.surfaceAlt,
            borderRadius: RADIUS.md,
            borderWidth: 1,
            borderColor: colors.border,
            padding: SPACING.md,
          }}
        >
          {info}
        </View>
      ) : null}

      {legend ? <View style={{ marginTop: SPACING.md }}>{legend}</View> : null}

      <View style={{ marginTop: SPACING.base }} onLayout={onLayout}>
        {width > 0 ? children(width) : null}
      </View>
    </Animated.View>
  )
}
