// The tab bar's icons, drawn as SVG.

import Svg, { Circle, Path, Rect } from 'react-native-svg'

export type TabIconName =
  | 'activity'
  | 'plus'
  | 'calendar'
  | 'trending'
  | 'sliders'
  | 'more'
  | 'info'
  | 'alert-triangle'
  | 'check-circle'
  | 'trending-down'
  | 'chevron-right'
  | 'shield'

interface TabIconProps {
  name: TabIconName
  color: string
  size?: number
  focused?: boolean
}

export default function TabIcon({ name, color, size = 24, focused = false }: TabIconProps) {
  const strokeWidth = focused ? 2.4 : 1.9
  const common = {
    stroke: color,
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    fill: 'none',
  }

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'activity' ? <Path d="M22 12h-4l-3 9L9 3l-3 9H2" {...common} /> : null}

      {name === 'plus' ? (
        <>
          <Circle cx={12} cy={12} r={9} {...common} />
          <Path d="M12 8v8M8 12h8" {...common} />
        </>
      ) : null}

      {name === 'calendar' ? (
        <>
          <Rect x={3} y={5} width={18} height={16} rx={2} {...common} />
          <Path d="M16 3v4M8 3v4M3 11h18" {...common} />
        </>
      ) : null}

      {name === 'trending' ? (
        <>
          <Path d="M23 6l-9.5 9.5-5-5L1 18" {...common} />
          <Path d="M17 6h6v6" {...common} />
        </>
      ) : null}

      {name === 'sliders' ? (
        <>
          <Path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3" {...common} />
          <Path d="M1 14h6M9 8h6M17 16h6" {...common} />
        </>
      ) : null}

      {name === 'info' ? (
        <>
          <Circle cx={12} cy={12} r={9.5} {...common} />
          <Path d="M12 16v-4.5M12 8h.01" {...common} />
        </>
      ) : null}

      {name === 'alert-triangle' ? (
        <>
          <Path
            d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"
            {...common}
          />
          <Path d="M12 9v4M12 17h.01" {...common} />
        </>
      ) : null}

      {name === 'check-circle' ? (
        <>
          <Path d="M22 11.1V12a10 10 0 1 1-5.9-9.1" {...common} />
          <Path d="M22 4 12 14l-3-3" {...common} />
        </>
      ) : null}

      {name === 'trending-down' ? (
        <>
          <Path d="M23 18l-9.5-9.5-5 5L1 6" {...common} />
          <Path d="M17 18h6v-6" {...common} />
        </>
      ) : null}

      {name === 'chevron-right' ? <Path d="M9 18l6-6-6-6" {...common} /> : null}

      {name === 'shield' ? (
        <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...common} />
      ) : null}

      {name === 'more' ? (
        <>
          <Circle cx={12} cy={5} r={1.6} fill={color} stroke="none" />
          <Circle cx={12} cy={12} r={1.6} fill={color} stroke="none" />
          <Circle cx={12} cy={19} r={1.6} fill={color} stroke="none" />
        </>
      ) : null}
    </Svg>
  )
}
