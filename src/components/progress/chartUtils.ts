// Small, dependency-free maths shared by the SVG progress charts: nice axis
// scales, Catmull-Rom smoothing, and compact number formatting. Kept pure so the
// charts themselves stay declarative.

export interface Point {
  x: number
  y: number
}

export interface Scale {
  /** Rounded lower bound of the axis. */
  min: number
  /** Rounded upper bound of the axis. */
  max: number
  /** Evenly-spaced gridline values from min to max. */
  ticks: number[]
}

/** Round a range up to a "nice" 1/2/5×10ⁿ number (Heckbert's algorithm). */
function niceNum(range: number, round: boolean): number {
  const exp = Math.floor(Math.log10(range))
  const frac = range / Math.pow(10, exp)
  let nf: number
  if (round) {
    if (frac < 1.5) nf = 1
    else if (frac < 3) nf = 2
    else if (frac < 7) nf = 5
    else nf = 10
  } else {
    if (frac <= 1) nf = 1
    else if (frac <= 2) nf = 2
    else if (frac <= 5) nf = 5
    else nf = 10
  }
  return nf * Math.pow(10, exp)
}

/**
 * A human-friendly axis scale spanning [min, max] with roughly `maxTicks`
 * gridlines landing on round values. Handles a flat series (min === max) and
 * negative ranges (Form crosses zero) without producing NaNs.
 */
export function niceScale(min: number, max: number, maxTicks = 5): Scale {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min === max) {
    // Degenerate input (no data, or one flat value): give a small symmetric band
    // around the value so a line still renders mid-chart.
    const base = Number.isFinite(min) ? min : 0
    return { min: base - 1, max: base + 1, ticks: [base - 1, base, base + 1] }
  }
  const range = niceNum(max - min, false)
  const step = niceNum(range / Math.max(1, maxTicks - 1), true)
  const niceMin = Math.floor(min / step) * step
  const niceMax = Math.ceil(max / step) * step
  const ticks: number[] = []
  for (let v = niceMin; v <= niceMax + step / 2; v += step) {
    ticks.push(Math.round(v * 1000) / 1000)
  }
  return { min: niceMin, max: niceMax, ticks }
}

/**
 * A smooth SVG path through `points` using a Catmull-Rom → cubic-Bézier
 * conversion (tension 1/6). Endpoints are duplicated so the curve doesn't
 * overshoot at the edges. Returns an empty string for no points.
 */
export function smoothPath(points: Point[]): string {
  if (points.length === 0) return ''
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`
  let d = `M ${points[0].x} ${points[0].y}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i]
    const p1 = points[i]
    const p2 = points[i + 1]
    const p3 = points[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C ${cp1x.toFixed(2)} ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)} ${cp2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`
  }
  return d
}

/** Straight polyline path through `points`. */
export function linePath(points: Point[]): string {
  if (points.length === 0) return ''
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' ')
}

/**
 * SVG path for a bar with only its top two corners rounded, anchored to the
 * baseline. `yTop` is the bar's top edge, `yBase` the axis; `r` is clamped so it
 * never exceeds half the bar's width or height (short bars stay clean).
 */
export function roundedTopBar(
  x: number,
  yTop: number,
  w: number,
  yBase: number,
  r: number,
): string {
  const h = Math.max(0, yBase - yTop)
  const rr = Math.min(r, w / 2, h)
  return (
    `M ${x} ${yBase} ` +
    `L ${x} ${yTop + rr} ` +
    `Q ${x} ${yTop} ${x + rr} ${yTop} ` +
    `L ${x + w - rr} ${yTop} ` +
    `Q ${x + w} ${yTop} ${x + w} ${yTop + rr} ` +
    `L ${x + w} ${yBase} Z`
  )
}

/**
 * Compact axis label: 1240 → "1.2k", 15000 → "15k", 42 → "42". Keeps y-axis
 * ticks from crowding on the big load/calorie charts.
 */
export function formatCompact(value: number): string {
  const abs = Math.abs(value)
  if (abs >= 1000) {
    const k = value / 1000
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k`
  }
  return String(Math.round(value))
}
