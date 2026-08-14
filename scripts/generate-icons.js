/**
 * Generates FORMA's app icon set from geometry — no design tool, no image
 * dependencies, no binary blobs checked into git that nobody can edit.
 *
 *   node scripts/generate-icons.js
 *
 * The mark is a geometric "F" (stem + two arms, rounded caps) in FORMA teal.
 * Everything is rasterised here with a tiny signed-distance-field renderer and
 * written as PNG via zlib, so tweaking the brand means editing numbers in this
 * file and re-running it.
 *
 * Outputs (all into assets/):
 *   icon.png                     1024  main app icon, opaque, full-bleed
 *   splash-icon.png              1024  teal F on transparent, for the splash
 *   android-icon-foreground.png  1024  adaptive foreground, inside the 66% safe zone
 *   android-icon-background.png  1024  adaptive background, the brand gradient
 *   android-icon-monochrome.png  1024  themed-icon + notification glyph (alpha only)
 *   favicon.png                    64  web
 *
 * To use your own artwork instead, just drop a 1024x1024 PNG over any of these
 * files — nothing imports this script at build time. See README-icons.md.
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

// ---------------------------------------------------------------- brand ----

const TEAL = [0x1d, 0x9e, 0x75]
const TEAL_DEEP = [0x14, 0x7a, 0x59]
const MINT_LIGHT = [0xff, 0xff, 0xff]
const MINT_DEEP = [0xc4, 0xe8, 0xda]

// --------------------------------------------------------------- render ----

/** Signed distance to a rounded rect. Negative inside. */
function sdRoundRect(px, py, cx, cy, hx, hy, r) {
  const qx = Math.abs(px - cx) - (hx - r)
  const qy = Math.abs(py - cy) - (hy - r)
  const ox = Math.max(qx, 0)
  const oy = Math.max(qy, 0)
  return Math.hypot(ox, oy) + Math.min(Math.max(qx, qy), 0) - r
}

/**
 * The FORMA "F", as a signed distance field.
 *
 * `size` is the cap height; the glyph is laid out from its top-left corner so
 * callers can centre its bounding box (width is 0.78 * size).
 */
function makeF(left, top, size) {
  const stem = size * 0.24 // stroke weight
  const armW = size * 0.78 // top arm reaches the full glyph width
  const midW = size * 0.60 // middle arm is deliberately shorter
  const midY = top + size * 0.395
  const r = stem * 0.30 // rounded caps, not sharp corners

  const rects = [
    // vertical stem
    [left + stem / 2, top + size / 2, stem / 2, size / 2, r],
    // top arm
    [left + armW / 2, top + stem / 2, armW / 2, stem / 2, r],
    // middle arm
    [left + midW / 2, midY + stem / 2, midW / 2, stem / 2, r],
  ]

  return (px, py) => {
    let d = Infinity
    for (const [cx, cy, hx, hy, rr] of rects) {
      const dd = sdRoundRect(px, py, cx, cy, hx, hy, rr)
      if (dd < d) d = dd
    }
    return d
  }
}

/** SDF -> coverage in [0,1], antialiased across roughly one pixel. */
function coverage(d) {
  return Math.min(1, Math.max(0, 0.5 - d))
}

function lerp(a, b, t) {
  return [
    Math.round(a[0] + (b[0] - a[0]) * t),
    Math.round(a[1] + (b[1] - a[1]) * t),
    Math.round(a[2] + (b[2] - a[2]) * t),
  ]
}

/**
 * Rasterises one RGBA image.
 *
 * `shade(x, y)` returns `[r, g, b, a]` for a pixel centre. Antialiasing of the
 * glyph itself comes from the SDF coverage, so no supersampling is needed.
 */
function render(size, shade) {
  const raw = Buffer.alloc(size * (size * 4 + 1))
  let p = 0
  for (let y = 0; y < size; y++) {
    raw[p++] = 0 // PNG filter type: none
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = shade(x + 0.5, y + 0.5)
      raw[p++] = r
      raw[p++] = g
      raw[p++] = b
      raw[p++] = a
    }
  }
  return raw
}

// ------------------------------------------------------------------ png ----

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()

function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(size, raw) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ---------------------------------------------------------------- icons ----

const OUT = path.join(__dirname, '..', 'assets')

/** Diagonal white -> mint wash, the shared background of the icon set. */
function gradient(x, y, size) {
  const t = Math.min(1, Math.max(0, (x / size) * 0.45 + (y / size) * 0.55))
  return lerp(MINT_LIGHT, MINT_DEEP, t)
}

function write(name, size, shade) {
  const file = path.join(OUT, name)
  fs.writeFileSync(file, encodePng(size, render(size, shade)))
  console.log(`  ${name}  ${size}x${size}`)
}

/** Composites the teal F over whatever `bg(x,y)` paints. */
function tealFOver(size, capHeight, bg) {
  const glyphW = capHeight * 0.78
  const f = makeF((size - glyphW) / 2, (size - capHeight) / 2, capHeight)
  return (x, y) => {
    const c = coverage(f(x, y))
    const base = bg(x, y)
    // The F picks up a touch of the gradient too, so it never looks pasted on.
    const ink = lerp(TEAL, TEAL_DEEP, Math.min(1, (x / size) * 0.3 + (y / size) * 0.5))
    const out = lerp(base, ink, c)
    return [out[0], out[1], out[2], 255]
  }
}

console.log('Generating FORMA icons into assets/ ...')

// Main icon: full-bleed, opaque, no rounded corners (the OS masks it itself).
write('icon.png', 1024, tealFOver(1024, 600, (x, y) => gradient(x, y, 1024)))

// Adaptive foreground: the launcher crops to a circle/squircle, so the glyph
// has to stay inside the centre 66% safe zone -> a much smaller cap height.
write('android-icon-foreground.png', 1024, (() => {
  const cap = 400
  const glyphW = cap * 0.78
  const f = makeF((1024 - glyphW) / 2, (1024 - cap) / 2, cap)
  return (x, y) => {
    const c = coverage(f(x, y))
    const ink = lerp(TEAL, TEAL_DEEP, Math.min(1, (x / 1024) * 0.3 + (y / 1024) * 0.5))
    return [ink[0], ink[1], ink[2], Math.round(c * 255)]
  }
})())

// Adaptive background: the same wash, drawn oversized because the launcher can
// parallax/crop up to 25% off each edge.
write('android-icon-background.png', 1024, (x, y) => {
  const [r, g, b] = gradient(x, y, 1024)
  return [r, g, b, 255]
})

// Monochrome: alpha-only glyph. Android tints it for themed icons, and
// expo-notifications uses the same file as the status-bar glyph — both read the
// alpha channel only, so the RGB here is irrelevant.
write('android-icon-monochrome.png', 1024, (() => {
  const cap = 400
  const glyphW = cap * 0.78
  const f = makeF((1024 - glyphW) / 2, (1024 - cap) / 2, cap)
  return (x, y) => [255, 255, 255, Math.round(coverage(f(x, y)) * 255)]
})())

// Splash mark: transparent so it sits on the configured splash background.
write('splash-icon.png', 1024, (() => {
  const cap = 820
  const glyphW = cap * 0.78
  const f = makeF((1024 - glyphW) / 2, (1024 - cap) / 2, cap)
  return (x, y) => {
    const c = coverage(f(x, y))
    const ink = lerp(TEAL, TEAL_DEEP, Math.min(1, (x / 1024) * 0.3 + (y / 1024) * 0.5))
    return [ink[0], ink[1], ink[2], Math.round(c * 255)]
  }
})())

write('favicon.png', 64, tealFOver(64, 38, (x, y) => gradient(x, y, 64)))

console.log('Done.')
