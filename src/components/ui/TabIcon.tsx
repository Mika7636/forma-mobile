import Svg, { Circle, Path, Rect } from 'react-native-svg'

/**
 * The tab bar's icons.
 *
 * ## Why these are drawn here rather than pulled from an icon package
 *
 * The tabs used to be emoji — 📊 ➕ 🗓️ 📈 ⚙️ — rendered as `<Text>` at 20pt.
 * Emoji are the fastest way to get an icon on screen and the worst way to keep
 * one: they are full-colour bitmaps supplied by the OS, so they cannot take the
 * active/inactive tint (the old code faked it with `opacity: 0.55`), they are
 * drawn in a different style by every Android version, and at tab-bar size on a
 * dim 720p panel they turn to mush. They were the single most obvious "this is
 * a prototype" tell left in the UI.
 *
 * The usual fix is `@expo/vector-icons`, but it is not a dependency of this
 * project and adding an icon font to ship five glyphs is a poor trade.
 * `react-native-svg` *is* already here — the progress charts are built on it —
 * so these are drawn directly: one consistent 24×24 grid, one 2pt stroke, round
 * caps and joins, and `currentColor` semantics via the `color` prop so the
 * navigator's active/inactive tints drive them properly instead of an opacity
 * hack.
 *
 * Geometry follows Feather's, which is a 24×24 grid with a 2px stroke — a
 * well-proportioned open-source set, and matching it keeps the glyphs
 * consistent with each other and with anything added later.
 *
 * It has since outgrown the tab bar — `more` is the overflow button on the
 * workout summary and the session detail sheet — but the rule is unchanged:
 * anywhere the UI wants an icon, it is drawn here rather than reached for as an
 * emoji, so it can take a colour and hold its shape at small sizes.
 */
export type TabIconName =
  | 'activity'
  | 'plus'
  | 'calendar'
  | 'trending'
  | 'sliders'
  | 'more'

interface TabIconProps {
  name: TabIconName
  /** Comes from the navigator's active/inactive tint. */
  color: string
  size?: number
  /**
   * The focused tab draws a touch heavier. A colour change alone is a weak
   * signal on a dim display in daylight, and weight is the cheapest way to add
   * a second, non-colour channel to it — which also keeps the active tab
   * identifiable without relying on hue.
   */
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

      {/* Feather's `more-vertical`. Filled rather than stroked: at r=1 a hollow
          ring is mush on a 720p panel, and dots are the one glyph where the
          shape carries no meaning beyond "there is a menu here". */}
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
