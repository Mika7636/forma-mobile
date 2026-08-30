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

// LayoutAnimation is opt-in on old-architecture Android and a no-op without
// this. Idempotent, and harmless on the new architecture and on iOS where it is
// already on — so this card does not depend on some other screen having been
// imported first to animate its own disclosure.
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true)
}

interface ChartCardProps {
  title: string
  subtitle?: string
  /** Ms before the card fades/slides in. */
  delay?: number
  /**
   * Rendered under the header, above the plot — typically a compact legend.
   *
   * Compact is the operative word: this sits between the reader and the chart,
   * so anything longer than one row belongs behind {@link info} instead.
   */
  legend?: ReactNode
  /**
   * The long-form explanation, behind an info button in the header.
   *
   * The load chart's legend used to spell out all three states on their own
   * lines — three rows of prose above a 200px plot, which is a third of the
   * card spent explaining a chart nobody could see yet. The wording is not
   * worse for being one tap away; it is simply no longer in front of the thing
   * it describes.
   */
  info?: ReactNode
  /** Accessible name for the info button, e.g. "About the training load chart". */
  infoLabel?: string
  /**
   * The plot. Receives the card's measured inner width so the SVG can size
   * itself exactly, then re-render responsively when the layout settles. Not
   * called until a non-zero width is known, so charts never draw at width 0.
   */
  children: (width: number) => ReactNode
}

/**
 * The rounded card every progress chart sits in — title, optional subtitle,
 * an optional info disclosure and legend, then a width-measured plot area.
 * Centralises the shadow, padding and entrance animation so all the charts read
 * as one system.
 */
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
    // Only re-render on a real change — avoids a render loop from sub-pixel jitter.
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
            // A generous hit slop rather than a 44pt box: the button is a 20pt
            // glyph tucked into the header, and padding it out to the touch
            // minimum would push the title off-centre.
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
