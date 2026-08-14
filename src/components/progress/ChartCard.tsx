import { useState, type ReactNode } from 'react'
import { LayoutChangeEvent, Text, View } from 'react-native'
import Animated, { FadeInDown } from 'react-native-reanimated'
import { CARD, COLORS } from '../../constants/theme'

interface ChartCardProps {
  title: string
  subtitle?: string
  /** Emoji rendered before the title (e.g. 🔥 for calories). */
  icon?: string
  /** Ms before the card fades/slides in. */
  delay?: number
  /** Rendered under the header, above the plot — typically a legend. */
  legend?: ReactNode
  /**
   * The plot. Receives the card's measured inner width so the SVG can size
   * itself exactly, then re-render responsively when the layout settles. Not
   * called until a non-zero width is known, so charts never draw at width 0.
   */
  children: (width: number) => ReactNode
}

/**
 * The white rounded card every progress chart sits in — title, optional subtitle
 * and legend, then a width-measured plot area. Centralises the shadow, padding
 * and entrance animation so all the charts read as one system.
 */
export default function ChartCard({
  title,
  subtitle,
  icon,
  delay = 0,
  legend,
  children,
}: ChartCardProps) {
  const [width, setWidth] = useState(0)

  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width
    // Only re-render on a real change — avoids a render loop from sub-pixel jitter.
    if (Math.abs(w - width) > 0.5) setWidth(w)
  }

  return (
    <Animated.View entering={FadeInDown.delay(delay).duration(360)} style={card}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {icon ? <Text style={{ fontSize: 18, marginRight: 7 }}>{icon}</Text> : null}
        <Text style={{ fontSize: 16, fontWeight: '800', color: COLORS.ink }}>{title}</Text>
      </View>
      {subtitle ? (
        <Text style={{ marginTop: 2, fontSize: 13, color: COLORS.muted }}>{subtitle}</Text>
      ) : null}

      {legend ? <View style={{ marginTop: 12 }}>{legend}</View> : null}

      <View style={{ marginTop: 14 }} onLayout={onLayout}>
        {width > 0 ? children(width) : null}
      </View>
    </Animated.View>
  )
}

/** The app's standard card — radius, padding, border and shadow all shared. */
const card = CARD
