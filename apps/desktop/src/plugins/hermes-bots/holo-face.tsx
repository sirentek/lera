/**
 * LERA — holo-skin bot faces.
 *
 * The stock faces are soft-body cartoon blobs with cartoon eyes. Under the
 * `holo` theme (a red chamfered sci-fi HUD) they read as a sticker pack, so
 * this module substitutes a HUD instrument for each one: thin wireframe
 * geometry, a glow built from a wide low-alpha companion stroke, and a hot
 * `--holo-core` sensor pip at the center of every glyph. The pip is what ties
 * the set together across hues — the color swatches still pick the line color,
 * so a green face stays green, it just stops being a blob.
 *
 * Shape strings are a stored-appearance contract (see avatar.tsx), so nothing
 * here invents new ones. `glyphFor` MAPS the existing vocabulary — classic
 * shapes, blobatar silhouettes, sigils and the render-only platonic solids —
 * onto eleven instruments. A bot keeps its stored shape and gets its stock
 * face back the moment the theme changes.
 *
 * Non-holo themes never reach this file: `useHoloSkin()` is false and BotFace
 * takes its original path.
 *
 * Animation: CSS keyframes on transform/opacity only (holo-face.css). No rAF,
 * no path morphing, no filters. Every stroke/fill/opacity below is an inline
 * attribute because profile-ops.ts rasterizes this SVG standalone for the
 * backend PNG avatar, where an external stylesheet does not apply.
 */

import './holo-face.css'

import type { CSSProperties } from 'react'
import { useSyncExternalStore } from 'react'

import type { FaceMood } from './types'

// ── theme subscription ──────────────────────────────────────────────────────
// themes/context.tsx rewrites `data-hermes-theme` on <html> when the user
// switches skins. One shared observer, fanned out, so a roster of faces does
// not install a MutationObserver each.

const themeListeners = new Set<() => void>()
let themeObserver: MutationObserver | null = null

function readHolo() {
  return typeof document !== 'undefined' && document.documentElement.getAttribute('data-hermes-theme') === 'holo'
}

function subscribeTheme(notify: () => void) {
  if (!themeObserver && typeof document !== 'undefined' && typeof MutationObserver === 'function') {
    themeObserver = new MutationObserver(() => themeListeners.forEach(listener => listener()))
    themeObserver.observe(document.documentElement, {
      attributeFilter: ['data-hermes-theme'],
      attributes: true
    })
  }

  themeListeners.add(notify)

  return () => void themeListeners.delete(notify)
}

/** True while the holo skin is painted. Re-renders the face on a theme swap. */
export function useHoloSkin(): boolean {
  return useSyncExternalStore(subscribeTheme, readHolo, () => false)
}

// ── geometry ────────────────────────────────────────────────────────────────
// The face box is 40x44 (matching the stock faces, so no tile reflows); the
// body is centered on 20,20 and the mood ticks sit on the y=41 row the stock
// faces already used.

type Point = [number, number]

function ringPath(pts: Point[]) {
  return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join('') + 'Z'
}

/** A lobed ring — the plasma body, in place of the stock 'blob' silhouette. */
function organicPath(r: number, lobe3: number, lobe5: number, phase: number, steps = 44) {
  const pts: Point[] = []

  for (let i = 0; i < steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2
    const rr = r + lobe3 * Math.sin(3 * a + phase) + lobe5 * Math.cos(5 * a + phase)
    pts.push([20 + rr * Math.cos(a), 20 + rr * Math.sin(a)])
  }

  return ringPath(pts)
}

function polygonPath(sides: number, r: number, rot = 0) {
  const pts: Point[] = []

  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2 - Math.PI / 2 + rot
    pts.push([20 + r * Math.cos(a), 20 + r * Math.sin(a)])
  }

  return ringPath(pts)
}

/** The holo frame's chamfered octagon, in face coordinates — the same cut the
 *  window and panel frames use, which is why 'squircle' becomes the signature
 *  glyph of the set (it is also the primary profile's stored shape). */
function chamferPath(inset: number, cut: number) {
  const a = inset
  const b = 40 - inset

  return (
    `M${a + cut} ${a}L${b - cut} ${a}L${b} ${a + cut}L${b} ${b - cut}` +
    `L${b - cut} ${b}L${a + cut} ${b}L${a} ${b - cut}L${a} ${a + cut}Z`
  )
}

/** Dash pattern that divides a circumference evenly, so a rotating ring has no
 *  seam where one gap is visibly wider than the rest. */
function evenDash(r: number, count: number, duty = 0.5) {
  const seg = (2 * Math.PI * r) / count

  return `${(seg * duty).toFixed(2)} ${(seg * (1 - duty)).toFixed(2)}`
}

/** Radial spokes as one path — n strokes, one node. */
function spokesPath(count: number, r0: number, r1: number, rot = 0) {
  let d = ''

  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2 - Math.PI / 2 + rot
    const c = Math.cos(a)
    const s = Math.sin(a)
    d += `M${(20 + r0 * c).toFixed(2)} ${(20 + r0 * s).toFixed(2)}L${(20 + r1 * c).toFixed(2)} ${(20 + r1 * s).toFixed(2)}`
  }

  return d
}

/** Every marching-ants outline shares this dash so the single `lhf-ants`
 *  keyframe (offset 0 -> -5.2, i.e. exactly one dash period) fits all of them. */
const ANTS_DASH = '2.6 2.6'

// Body outlines are constants — computed once at module load, never per face.
const PLASMA_OUTER = organicPath(15.4, 1.5, 0.6, 0)
const PLASMA_INNER = organicPath(8.6, 1.3, 0.5, 1.9)
const HEX_OUTER = polygonPath(6, 15.8)
const HEX_INNER = polygonPath(6, 8.4)
const MODULE_OUTER = chamferPath(4, 7)
const MODULE_INNER = chamferPath(9.5, 4)
const NODE_OUTER = chamferPath(8, 4.5)
const DELTA_OUTER = 'M20 5.2L21.8 6.2L34.6 30.6L33.6 32.4L6.4 32.4L5.4 30.6L18.2 6.2Z'
const DELTA_INNER = 'M20 13.6L28.4 28.6L11.6 28.6Z'
const BEACON_OUTER = 'M20 4.4C20 4.4 6.4 20.4 6.4 26.8A13.6 13.6 0 0 0 33.6 26.8C33.6 20.4 20 4.4 20 4.4Z'
const BEACON_RING = 'M12.4 26.8a7.6 7.6 0 1 0 15.2 0a7.6 7.6 0 1 0 -15.2 0'

// ── name -> seed ────────────────────────────────────────────────────────────

/** FNV-1a, then xorshift — the same family avatar.tsx uses for sigils, so a
 *  name lands on a stable face across sessions and platforms. */
function seedOf(text: string) {
  let h = 2166136261

  for (const ch of text) {
    h ^= ch.charCodeAt(0)
    h = Math.imul(h, 16777619)
  }

  let state = h >>> 0 || 88675123

  return () => {
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    state >>>= 0

    return state / 4294967296
  }
}

/** Mirrored angular chords on a 5x5 grid — the 'auto' glyph, which has to be
 *  name-derived because the shape it replaces ('blobatar') is the pick that
 *  means "let the name decide". Cached: a roster re-renders constantly. */
const sigilCache = new Map<string, string>()

function sigilStrokes(name: string) {
  const hit = sigilCache.get(name)

  if (hit !== undefined) {
    return hit
  }

  const rng = seedOf(`holo::${name}`)
  const gx = (i: number) => 8 + i * 6
  const gy = (j: number) => 9 + j * 5.5
  const strokes: string[] = []
  const segments = 3 + Math.floor(rng() * 3)

  for (let k = 0; k < segments; k++) {
    const x1 = Math.floor(rng() * 3)
    const y1 = Math.floor(rng() * 5)
    const x2 = Math.min(2, Math.max(0, x1 + (rng() > 0.5 ? 1 : -1)))
    const y2 = Math.min(4, Math.max(0, y1 + Math.floor(rng() * 3) - 1))
    strokes.push(`M${gx(x1)} ${gy(y1)}L${gx(x2)} ${gy(y2)}`)
    strokes.push(`M${gx(4 - x1)} ${gy(y1)}L${gx(4 - x2)} ${gy(y2)}`)

    if (rng() > 0.55) {
      strokes.push(`M${gx(x2)} ${gy(y2)}L${gx(4 - x2)} ${gy(y2)}`)
    }
  }

  const d = strokes.join('')
  sigilCache.set(name, d)

  return d
}

// ── shared parts ────────────────────────────────────────────────────────────

interface PartProps {
  color: string
}

/** The soft bloom. A wide, low-alpha companion stroke rather than a
 *  `filter: drop-shadow()` — a filter re-rasterizes the whole face every time
 *  an animated child moves, which is exactly the cost this skin exists to
 *  avoid, and it would not survive the standalone PNG raster either. */
function Halo({ d, color, width = 3.6 }: PartProps & { d: string; width?: number }) {
  return <path d={d} fill="none" stroke={color} strokeLinejoin="round" strokeOpacity={0.16} strokeWidth={width} />
}

function Line({
  d,
  color,
  width = 1.4,
  opacity = 0.95,
  dash,
  className,
  delay
}: PartProps & {
  className?: string
  d: string
  dash?: string
  delay?: number
  opacity?: number
  width?: number
}) {
  return (
    <path
      className={className}
      d={d}
      fill="none"
      stroke={color}
      strokeDasharray={dash}
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeOpacity={opacity}
      strokeWidth={width}
      style={delay === undefined ? undefined : { animationDelay: `${delay}s` }}
    />
  )
}

/** The hologram plate — barely-there fill so the glyph reads as a lit surface
 *  rather than bare line art. */
function Plate({ d, color }: PartProps & { d: string }) {
  return <path d={d} fill={color} fillOpacity={0.1} stroke="none" />
}

/**
 * The sensor pip every glyph carries: the bot's hue outside, the holo core
 * highlight inside. `--holo-core` gets a literal fallback because the PNG
 * raster runs this markup as a standalone document with no theme vars in scope.
 */
function Core({ color, cy = 20, r = 2.6 }: PartProps & { cy?: number; r?: number }) {
  return (
    <g className={cy === 20 ? 'lhf-core' : 'lhf-core lhf-pivot'}>
      <circle cx={20} cy={cy} fill={color} fillOpacity={0.9} r={r} />
      <circle cx={20} cy={cy} fill="var(--holo-core, #ffd9cf)" fillOpacity={0.95} r={r * 0.42} />
    </g>
  )
}

/** A sensor slit — the flat-eyed alternative to the stock cartoon eyes. */
function Slit({ color, cy = 20, half = 6 }: PartProps & { cy?: number; half?: number }) {
  return (
    <g className="lhf-core">
      <path
        d={`M${20 - half} ${cy}L${20 + half} ${cy}`}
        stroke={color}
        strokeLinecap="round"
        strokeOpacity={0.85}
        strokeWidth={2.6}
      />
      <path
        d={`M${20 - half * 0.45} ${cy}L${20 + half * 0.45} ${cy}`}
        stroke="var(--holo-core, #ffd9cf)"
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </g>
  )
}

/** Horizontal sweep. The keyframe travels ±11 units, so only glyphs whose
 *  silhouette is still solid 11 units above and below center use it — that is
 *  what lets the bar run without a clipPath (a clip would force a separate
 *  raster pass on every frame of the sweep). */
function Scan({ half }: { half: number }) {
  return (
    <rect
      className="lhf-scan"
      fill="var(--holo-core, #ffd9cf)"
      height={1.4}
      opacity={0}
      width={half * 2}
      x={20 - half}
      y={19.3}
    />
  )
}

/** The three working ticks, on the same y=41 row the stock faces used, so the
 *  mood affordance survives the reskin. Idle draws nothing. */
function Ticks({ color, mood }: PartProps & { mood: FaceMood }) {
  if (mood !== 'work' && mood !== 'think') {
    return null
  }

  return (
    <g>
      {[16.2, 20, 23.8].map((x, i) => (
        <rect
          className="lhf-seq"
          fill={color}
          height={2.2}
          key={x}
          style={{ animationDelay: `${i * 0.18}s` }}
          width={2.6}
          x={x - 1.3}
          y={40}
        />
      ))}
    </g>
  )
}

// ── the eleven instruments ──────────────────────────────────────────────────

type GlyphId =
  | 'bar'
  | 'beacon'
  | 'cell'
  | 'delta'
  | 'mesh'
  | 'module'
  | 'node'
  | 'plasma'
  | 'reticle'
  | 'sigil'
  | 'star'

/** circle / round — targeting reticle. */
function Reticle({ color }: PartProps) {
  const body = polygonPath(48, 15.5)

  return (
    <g>
      <Plate color={color} d={body} />
      <Halo color={color} d={body} />
      <Line color={color} d={body} />
      <g className="lhf-spin">
        <Line color={color} d={polygonPath(48, 11.2)} dash={evenDash(11.2, 6, 0.52)} opacity={0.8} width={1.2} />
      </g>
      <Line color={color} d={spokesPath(4, 12.8, 15.5)} opacity={0.85} width={1.3} />
      <Core color={color} />
    </g>
  )
}

/** blob / organic — containment field around a plasma core. */
function Plasma({ color }: PartProps) {
  return (
    <g>
      <Plate color={color} d={PLASMA_OUTER} />
      <Halo color={color} d={PLASMA_OUTER} />
      <Line color={color} d={PLASMA_OUTER} />
      <g className="lhf-spin-rev">
        <Line color={color} d={PLASMA_INNER} opacity={0.6} width={1.1} />
      </g>
      <Core color={color} />
    </g>
  )
}

/** squircle / boxy — the chamfered HUD module, twin of the window frame. */
function Module({ color }: PartProps) {
  // Corner brackets drawn just inside the chamfer — the HUD-card grammar.
  const brackets =
    'M5.4 12.6L5.4 9.6L9.6 5.4L12.6 5.4M27.4 5.4L30.4 5.4L34.6 9.6L34.6 12.6' +
    'M34.6 27.4L34.6 30.4L30.4 34.6L27.4 34.6M12.6 34.6L9.6 34.6L5.4 30.4L5.4 27.4'

  return (
    <g>
      <Plate color={color} d={MODULE_OUTER} />
      <Halo color={color} d={MODULE_OUTER} />
      <Line color={color} d={MODULE_OUTER} />
      <Line color={color} d={brackets} opacity={0.55} width={1.6} />
      <Line className="lhf-ants" color={color} d={MODULE_INNER} dash={ANTS_DASH} opacity={0.45} width={1} />
      <Scan half={9} />
      <Slit color={color} />
    </g>
  )
}

/** pill / capsule — a load gauge, five segments filling left to right. */
function Bar({ color }: PartProps) {
  const body = 'M13 10.5L27 10.5A9.5 9.5 0 0 1 27 29.5L13 29.5A9.5 9.5 0 0 1 13 10.5Z'
  const segs = [11.4, 15.7, 20, 24.3, 28.6]

  return (
    <g>
      <Plate color={color} d={body} />
      <Halo color={color} d={body} />
      <Line color={color} d={body} />
      {segs.map((x, i) => (
        <rect
          className="lhf-seq"
          fill={color}
          height={9}
          key={x}
          rx={0.8}
          style={{ animationDelay: `${i * 0.16}s` }}
          width={2.6}
          x={x - 1.3}
          y={15.5}
        />
      ))}
      <circle cx={20} cy={20} fill="var(--holo-core, #ffd9cf)" fillOpacity={0.9} r={1.1} />
    </g>
  )
}

/** triangle / tetrahedron — a delta with truncated corners and an apex pip. */
function Delta({ color }: PartProps) {
  return (
    <g>
      <Plate color={color} d={DELTA_OUTER} />
      <Halo color={color} d={DELTA_OUTER} />
      <Line color={color} d={DELTA_OUTER} />
      <Line className="lhf-ants" color={color} d={DELTA_INNER} dash={ANTS_DASH} opacity={0.45} width={1} />
      <Core color={color} cy={24.4} r={2.3} />
      <circle className="lhf-core lhf-pivot" cx={20} cy={10.6} fill={color} fillOpacity={0.85} r={1.3} />
    </g>
  )
}

/** hexagon — a cell node, echoing the holo hexagon wall. */
function Cell({ color }: PartProps) {
  return (
    <g>
      <Plate color={color} d={HEX_OUTER} />
      <Halo color={color} d={HEX_OUTER} />
      <Line color={color} d={HEX_OUTER} />
      <g className="lhf-spin">
        <Line color={color} d={HEX_INNER} opacity={0.5} width={1} />
        <Line color={color} d={spokesPath(3, 8.4, 14)} opacity={0.4} width={1} />
      </g>
      <Core color={color} />
    </g>
  )
}

/** cloud — a broadcast stack. The three arcs keep the cloud's lumpy top
 *  silhouette while reading as signal strength instead of weather. */
function Mesh({ color }: PartProps) {
  // True semicircles about the node at 20,30.5 (not shallow chords) — a chord
  // arc tops out well below the box and the glyph reads squat next to the
  // round/octagonal ones. Radii 14.5 / 10.2 / 5.9 put the outer crown at
  // y=16, matching the other bodies' top edge.
  const arcs = [
    'M5.5 30.5A14.5 14.5 0 0 1 34.5 30.5',
    'M9.8 30.5A10.2 10.2 0 0 1 30.2 30.5',
    'M14.1 30.5A5.9 5.9 0 0 1 25.9 30.5'
  ]

  return (
    <g>
      <Plate color={color} d="M5.5 30.5A14.5 14.5 0 0 1 34.5 30.5Z" />
      {arcs.map((d, i) => (
        <g key={d}>
          <Halo color={color} d={d} width={3.2} />
          <path
            className="lhf-seq"
            d={d}
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.5}
            style={{ animationDelay: `${(2 - i) * 0.22}s` }}
          />
        </g>
      ))}
      <Line color={color} d="M5.5 30.5L34.5 30.5" opacity={0.5} width={1.3} />
      <Line color={color} d="M11.6 34.2L28.4 34.2" opacity={0.75} width={1.6} />
      <Core color={color} cy={30.5} r={2.3} />
    </g>
  )
}

/** drop / droplet — a plumb beacon with an orbiting lock ring. */
function Beacon({ color }: PartProps) {
  return (
    <g>
      <Plate color={color} d={BEACON_OUTER} />
      <Halo color={color} d={BEACON_OUTER} />
      <Line color={color} d={BEACON_OUTER} />
      <Line className="lhf-ants" color={color} d="M20 8.6L20 19.4" dash={ANTS_DASH} opacity={0.5} width={1} />
      <g className="lhf-spin lhf-pivot">
        <Line color={color} d={BEACON_RING} dash={evenDash(7.6, 4, 0.5)} opacity={0.55} width={1} />
      </g>
      <Core color={color} cy={26.8} r={2.4} />
    </g>
  )
}

/** sun — an emitter: eight rays turning one way inside a ring turning the other. */
function Star({ color }: PartProps) {
  const rays = spokesPath(8, 10.4, 15.4)

  return (
    <g>
      <Plate color={color} d={polygonPath(48, 9.4)} />
      <g className="lhf-spin">
        <Halo color={color} d={rays} width={3} />
        <Line color={color} d={rays} width={1.4} />
      </g>
      <g className="lhf-spin-rev">
        <Line color={color} d={polygonPath(48, 15.4)} dash={evenDash(15.4, 8, 0.32)} opacity={0.45} width={1} />
      </g>
      <Line color={color} d={polygonPath(48, 9.4)} opacity={0.9} width={1.3} />
      <Core color={color} />
    </g>
  )
}

/** nub — a compact relay node with four antenna stubs. */
function Node({ color }: PartProps) {
  return (
    <g>
      <Plate color={color} d={NODE_OUTER} />
      <Halo color={color} d={NODE_OUTER} />
      <Line color={color} d={NODE_OUTER} />
      {[0, 1, 2, 3].map(i => (
        <Line
          className="lhf-seq"
          color={color}
          d={spokesPath(1, 13.2, 16.4, Math.PI / 4 + (i * Math.PI) / 2)}
          delay={i * 0.17}
          key={i}
          opacity={0.85}
          width={1.3}
        />
      ))}
      <Slit color={color} half={4.2} />
    </g>
  )
}

/** blobatar (unpinned) / sigil-N — the name-derived glyph. */
function Sigil({ color, name }: PartProps & { name: string }) {
  const body = polygonPath(6, 15.6)

  return (
    <g>
      <Plate color={color} d={body} />
      <Halo color={color} d={body} width={3.2} />
      <Line color={color} d={body} opacity={0.75} width={1.2} />
      <Line color={color} d={sigilStrokes(name)} opacity={0.95} width={1.5} />
      <g className="lhf-spin">
        <Line color={color} d={polygonPath(48, 12.6)} dash={evenDash(12.6, 9, 0.3)} opacity={0.4} width={1} />
      </g>
      <Core color={color} r={1.9} />
    </g>
  )
}

// ── shape vocabulary -> instrument ──────────────────────────────────────────

/** Every stored shape string the app can hand BotFace, mapped onto a glyph.
 *  Silhouette names come from blobatar (BLOB_KINDS), the rest are the classic
 *  picker shapes plus the render-only platonic solids. */
const GLYPH_BY_SHAPE: Record<string, GlyphId> = {
  blob: 'plasma',
  boxy: 'module',
  capsule: 'bar',
  circle: 'reticle',
  cloud: 'mesh',
  cube: 'module',
  dodecahedron: 'cell',
  drop: 'beacon',
  droplet: 'beacon',
  hex: 'cell',
  hexagon: 'cell',
  icosahedron: 'cell',
  nub: 'node',
  octahedron: 'cell',
  organic: 'plasma',
  pebble: 'plasma',
  pill: 'bar',
  round: 'reticle',
  squircle: 'module',
  sun: 'star',
  teardrop: 'beacon',
  tetrahedron: 'delta',
  triangle: 'delta',
  wedge: 'delta'
}

const FALLBACK_SHAPES = ['circle', 'squircle', 'pill', 'triangle', 'hexagon', 'cloud', 'drop']

/**
 * A shape string is either a classic shape, `sigil-<n>`, or
 * `blobatar[:seed[:kind]]`. A pinned blobatar silhouette picks the matching
 * instrument; an unpinned one means "the name decides", which is what the
 * seeded sigil is for. An unknown or empty shape falls back to a name-stable
 * instrument rather than making every such bot identical.
 */
export function glyphFor(shape: null | string | undefined, name: string): GlyphId {
  const raw = (shape || '').trim()

  if (raw.startsWith('sigil-')) {
    return 'sigil'
  }

  if (raw === 'blobatar' || raw.startsWith('blobatar:')) {
    const kind = raw.split(':')[2]

    return (kind && GLYPH_BY_SHAPE[kind]) || 'sigil'
  }

  if (GLYPH_BY_SHAPE[raw]) {
    return GLYPH_BY_SHAPE[raw]
  }

  const rng = seedOf(`holo-shape::${name}`)

  return GLYPH_BY_SHAPE[FALLBACK_SHAPES[Math.floor(rng() * FALLBACK_SHAPES.length)]]
}

// ── the face ────────────────────────────────────────────────────────────────

interface HoloFaceProps {
  color: string
  mood?: FaceMood
  name?: string
  shape: string
  size?: number
}

/**
 * Holo-skin replacement for BotFace's vector path. Keeps `data-bot-face` so
 * the roster PNG backfill (profile-ops.ts) still finds and rasterizes it, and
 * deliberately omits `data-hb-math` so the legacy face clock never adopts it —
 * a holo face must cost zero animation frames of JS.
 */
export function HoloFace({ shape, color, size = 36, name = 'agent', mood = 'idle' }: HoloFaceProps) {
  const glyph = glyphFor(shape, name)
  // Desync the shared keyframes per bot so a roster does not breathe in
  // lock-step. A negative animation-delay (holo-face.css) just offsets the
  // start phase; it schedules nothing extra.
  const phase = (seedOf(`holo-phase::${name}:${shape}`)() * 8).toFixed(2)

  return (
    <svg
      aria-hidden
      className="lhf"
      data-bot-face={name}
      data-mood={mood}
      height={size}
      style={{ '--lhf-phase': `${phase}s` } as CSSProperties}
      viewBox="0 0 40 44"
      width={size}
    >
      {glyph === 'reticle' ? <Reticle color={color} /> : null}
      {glyph === 'plasma' ? <Plasma color={color} /> : null}
      {glyph === 'module' ? <Module color={color} /> : null}
      {glyph === 'bar' ? <Bar color={color} /> : null}
      {glyph === 'delta' ? <Delta color={color} /> : null}
      {glyph === 'cell' ? <Cell color={color} /> : null}
      {glyph === 'mesh' ? <Mesh color={color} /> : null}
      {glyph === 'beacon' ? <Beacon color={color} /> : null}
      {glyph === 'star' ? <Star color={color} /> : null}
      {glyph === 'node' ? <Node color={color} /> : null}
      {glyph === 'sigil' ? <Sigil color={color} name={name} /> : null}
      <Ticks color={color} mood={mood} />
    </svg>
  )
}
