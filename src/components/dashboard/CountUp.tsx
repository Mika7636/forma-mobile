// A number that animates from its previous value to the next.

import { useEffect, useRef, useState } from 'react'
import { Text, type StyleProp, type TextStyle } from 'react-native'

interface CountUpProps {
  value: number
  duration?: number
  format?: (value: number) => string
  style?: StyleProp<TextStyle>
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3)
}

export default function CountUp({
  value,
  duration = 900,
  format = (v) => String(Math.round(v)),
  style,
}: CountUpProps) {
  const [display, setDisplay] = useState(0)
  const displayRef = useRef(0)
  const frameRef = useRef<number | null>(null)

  useEffect(() => {
    const from = displayRef.current
    const to = value

    if (from === to) return
    if (duration <= 0) {
      displayRef.current = to
      setDisplay(to)
      return
    }

    const start = Date.now()
    const tick = () => {
      const progress = Math.min(1, (Date.now() - start) / duration)
      const next = from + (to - from) * easeOutCubic(progress)
      displayRef.current = next
      setDisplay(next)
      if (progress < 1) {
        frameRef.current = requestAnimationFrame(tick)
      } else {
        displayRef.current = to
        setDisplay(to)
      }
    }
    frameRef.current = requestAnimationFrame(tick)

    return () => {
      if (frameRef.current != null) cancelAnimationFrame(frameRef.current)
    }
  }, [value, duration])

  return <Text style={style}>{format(display)}</Text>
}
