import { type CSSProperties, useEffect, useRef, useState } from 'react'

import { useTheme } from '@/themes/context'

import introCopyJsonl from './intro-copy.jsonl?raw'

type IntroCopy = {
  headline: string
  body: string
}

type IntroCopyRecord = IntroCopy & {
  personality: string
}

export type IntroProps = {
  personality?: string
  seed?: number
}

const NEUTRAL_PERSONALITIES = new Set(['', 'default', 'none', 'neutral'])

const FALLBACK_COPY: IntroCopy[] = [
  {
    headline: 'What are we moving today?',
    body: "Send a bug, branch, plan, or rough idea. I'll inspect the repo and turn it into the next concrete step."
  },
  {
    headline: "What's on your mind?",
    body: "Bring the code, question, or stuck part. I'll read the room before making changes."
  },
  {
    headline: 'What should Hermes look at?',
    body: "Send the task, failing path, or half-formed plan. I'll help turn it into action."
  },
  {
    headline: 'Where should we start?',
    body: "Bring the problem, goal, or file. I'll inspect first and keep the next step concrete."
  },
  {
    headline: 'What needs attention?',
    body: "Send the context you have. I'll help sort it into a plan or a fix."
  }
]

function normalizeKey(value?: string): string {
  return (value || '').trim().toLowerCase()
}

function titleize(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function isIntroCopyRecord(value: unknown): value is IntroCopyRecord {
  if (!value || typeof value !== 'object') {
    return false
  }

  const record = value as Record<string, unknown>

  return (
    typeof record.personality === 'string' &&
    typeof record.headline === 'string' &&
    typeof record.body === 'string' &&
    Boolean(record.personality.trim()) &&
    Boolean(record.headline.trim()) &&
    Boolean(record.body.trim())
  )
}

function parseIntroCopy(raw: string): Record<string, IntroCopy[]> {
  const byPersonality: Record<string, IntroCopy[]> = {}

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()

    if (!trimmed) {
      continue
    }

    try {
      const parsed: unknown = JSON.parse(trimmed)

      if (!isIntroCopyRecord(parsed)) {
        continue
      }

      const key = normalizeKey(parsed.personality)
      byPersonality[key] ??= []
      byPersonality[key].push({
        headline: parsed.headline.trim(),
        body: parsed.body.trim()
      })
    } catch {
      // Bad generated copy should not break the whole desktop app.
    }
  }

  return byPersonality
}

const INTRO_COPY_BY_PERSONALITY = parseIntroCopy(introCopyJsonl)

function neutralCopy(): IntroCopy[] {
  return INTRO_COPY_BY_PERSONALITY.none || INTRO_COPY_BY_PERSONALITY.default || FALLBACK_COPY
}

function fallbackCopyForPersonality(personalityKey: string): IntroCopy[] {
  if (NEUTRAL_PERSONALITIES.has(personalityKey)) {
    return neutralCopy()
  }

  const label = titleize(personalityKey)

  return [
    {
      headline: `${label} mode is on. What should we work on?`,
      body: "Send the task, file, or rough idea. I'll use your configured voice and keep the work grounded in this repo."
    },
    {
      headline: `What does ${label} Hermes need to see?`,
      body: "Bring the context or the stuck part. I'll adapt to your configured personality."
    },
    {
      headline: `${label} mode is ready.`,
      body: "Send the problem, file, or idea. I'll follow the personality you've configured."
    },
    {
      headline: `What should ${label} Hermes tackle?`,
      body: "Drop the task here. I'll keep the work grounded in the repo."
    },
    {
      headline: 'Where should we begin?',
      body: `Give me the context and I'll answer in ${label} mode.`
    }
  ]
}

function pickCopy(copies: IntroCopy[], seed = 0): IntroCopy {
  return copies[Math.abs(seed) % copies.length] || FALLBACK_COPY[0]
}

const WORDMARK = 'HERMES AGENT'

type HoloPoint = {
  a: number
  r: number
  s: number
  z: number
  blink: number
}

type HoloRingSeed = {
  a: number
  wobble: number
  len: number
  amp: number
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)

    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function randomUnit(): number {
  if (globalThis.crypto?.getRandomValues) {
    const value = new Uint32Array(1)
    globalThis.crypto.getRandomValues(value)

    return value[0] / 4294967296
  }

  return Math.random()
}

function randomBetween(min: number, max: number): number {
  return min + randomUnit() * (max - min)
}

function smooth(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)))

  return t * t * (3 - 2 * t)
}

function refillLetterPool(previousLetter: number): number[] {
  const pool = [0, 1, 2, 3]

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(randomUnit() * (i + 1))

    ;[pool[i], pool[j]] = [pool[j], pool[i]]
  }

  if (pool[0] === previousLetter) {
    ;[pool[0], pool[1]] = [pool[1], pool[0]]
  }

  return pool
}

function LeraHoloEffect({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!active) {
      return
    }

    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d', { alpha: true })

    if (!canvas || !ctx) {
      return
    }

    const sequenceSteps = 43
    const stepMs = 144
    const sequenceMs = sequenceSteps * stepMs
    const bootFrameMs = 1000 / 30
    // Idle runs at a deliberately low frame rate. The boot is a one-time 6.2s
    // burst; the idle loop runs forever, so its cost is what matters for the
    // home screen's steady-state CPU/GPU. ~24fps is smooth enough for the slow
    // orbital drift but roughly halves the per-second composite work vs 60fps.
    const idleFrameMs = 1000 / 24

    const start = performance.now()
    const rand = mulberry32(1138)
    const particles: HoloPoint[] = []
    const ringSeeds: HoloRingSeed[] = []

    const letterGlitch = {
      nextAt: sequenceMs / 1000 + 5 + randomBetween(0, 15),
      startAt: -1,
      duration: 0.18,
      letter: 0,
      pool: [] as number[]
    }

    let animationFrame = 0
    let lastPaint = -Infinity
    let disposed = false
    const reduceMotion =
      typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Halved from the original 96. The field still reads as dense once the arcs
    // and filaments are layered over it, but the continuously-running idle loop
    // now redraws far fewer shadowed dots per frame.
    const particleCount = 48

    for (let i = 0; i < particleCount; i++) {
      particles.push({
        a: rand() * Math.PI * 2,
        r: 0.1 + rand() * 0.34,
        s: 0.3 + rand() * 1.8,
        z: 0.2 + rand() * 0.8,
        blink: rand() * Math.PI * 2
      })
    }

    for (let i = 0; i < 28; i++) {
      ringSeeds.push({
        a: rand() * Math.PI * 2,
        wobble: rand() * 16,
        len: 0.018 + rand() * 0.052,
        amp: 0.92 + rand() * 0.22
      })
    }

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      canvas.width = Math.floor(rect.width * dpr)
      canvas.height = Math.floor(rect.height * dpr)
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // Writing canvas.width/height wipes the bitmap. Under reduced-motion the
      // loop has already stopped on its settled frame, so a resize would leave
      // the orb blank — re-arm a single repaint to redraw it at the new size.
      // (No-op while the live loop is running; it will repaint on its own.)
      if (reduceMotion && !disposed) {
        cancelAnimationFrame(animationFrame)
        animationFrame = requestAnimationFrame(draw)
      }
    }

    const getLetterGlitch = (time: number, ready: boolean) => {
      if (!ready) {
        return { amount: 0, letter: -1 }
      }

      if (letterGlitch.startAt < 0 && time >= letterGlitch.nextAt) {
        if (letterGlitch.pool.length === 0) {
          letterGlitch.pool = refillLetterPool(letterGlitch.letter)
        }

        letterGlitch.startAt = time
        letterGlitch.duration = randomBetween(0.16, 0.34)
        letterGlitch.letter = letterGlitch.pool.shift() ?? 0
      }

      if (letterGlitch.startAt >= 0) {
        const t = (time - letterGlitch.startAt) / letterGlitch.duration

        if (t >= 1) {
          letterGlitch.startAt = -1
          letterGlitch.nextAt = time + randomBetween(5, 20)

          return { amount: 0, letter: -1 }
        }

        return { amount: Math.sin(t * Math.PI) ** 2, letter: letterGlitch.letter }
      }

      return { amount: 0, letter: -1 }
    }

    const drawNoisyArc = (
      cx: number,
      cy: number,
      radius: number,
      width: number,
      alpha: number,
      time: number,
      turn: number,
      color: string
    ) => {
      ctx.save()
      ctx.lineCap = 'round'
      ctx.strokeStyle = color
      ctx.shadowColor = color
      ctx.shadowBlur = width * 1.7
      ctx.lineWidth = width

      for (const seed of ringSeeds) {
        const drift = Math.sin(time * seed.amp + seed.wobble) * 0.018
        const a0 = seed.a + turn + drift
        const a1 = a0 + seed.len
        const rr = radius + Math.sin(seed.a * 5 + time * 1.7) * width * 1.2
        ctx.globalAlpha = alpha * (0.22 + 0.78 * Math.sin(seed.a * 9 + time * 2.3) ** 2)
        ctx.beginPath()
        ctx.arc(cx, cy, rr, a0, a1)
        ctx.stroke()
      }

      ctx.restore()
    }

    const drawCore = (cx: number, cy: number, unit: number, time: number, p: number) => {
      const core = unit * (0.145 + Math.sin(time * 2.1) * 0.006)
      const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core * 1.25)
      g.addColorStop(0, 'rgba(255,209,199,.48)')
      g.addColorStop(0.52, 'rgba(255,81,68,.18)')
      g.addColorStop(1, 'rgba(255,81,68,0)')
      ctx.fillStyle = g
      ctx.beginPath()
      ctx.arc(cx, cy, core * 1.4, 0, Math.PI * 2)
      ctx.fill()

      ctx.save()
      ctx.strokeStyle = 'rgba(255,209,199,.22)'
      ctx.lineWidth = Math.max(1, unit * 0.004)
      ctx.shadowColor = 'rgba(255,81,68,.85)'
      ctx.shadowBlur = unit * 0.016

      for (let lat = -2; lat <= 2; lat++) {
        ctx.globalAlpha = 0.2 + p * 0.16
        ctx.beginPath()
        ctx.ellipse(
          cx,
          cy,
          core * (1 - Math.abs(lat) * 0.055),
          core * (0.3 + Math.abs(lat) * 0.045),
          time * 0.45 + lat * 0.35,
          0,
          Math.PI * 2
        )
        ctx.stroke()
      }

      for (let i = 0; i < 6; i++) {
        ctx.beginPath()
        ctx.ellipse(cx, cy, core * 0.98, core * 0.24, time * 0.28 + (i * Math.PI) / 10, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.restore()
    }

    const drawParticles = (cx: number, cy: number, unit: number, time: number, p: number, reveal: number) => {
      ctx.save()
      ctx.fillStyle = 'rgba(255,209,199,.95)'
      ctx.shadowColor = 'rgba(255,81,68,.95)'
      ctx.shadowBlur = unit * 0.009

      for (const pt of particles) {
        const orbit = pt.a + time * 0.08 * pt.s
        const breathe = Math.sin(time * pt.s + pt.blink)
        const radial = unit * (pt.r + Math.sin(time * 0.7 + pt.a * 3) * 0.012)
        const flatten = 0.82 + 0.06 * Math.sin(time * 0.5)
        const x = cx + Math.cos(orbit) * radial
        const y = cy + Math.sin(orbit) * radial * flatten
        const dot = unit * (0.0022 + pt.z * 0.0032)
        ctx.globalAlpha = (0.1 + 0.34 * (breathe * 0.5 + 0.5)) * (0.55 + p * 0.45) * reveal
        ctx.beginPath()
        ctx.arc(x, y, dot, 0, Math.PI * 2)
        ctx.fill()
      }

      ctx.restore()
    }

    const drawGlitchWord = (cx: number, cy: number, unit: number, time: number, reveal: number, step: number) => {
      if (reveal <= 0) {
        return
      }

      const letters = ['L', 'E', 'R', 'A']
      const fontSize = unit * 0.165
      const slot = unit * 0.172
      const total = slot * letters.length
      // The slot grid is mathematically centered on cx, but "LERA" is optically
      // right-heavy: 'L' carries ink only on its left/bottom while 'E','R','A'
      // fill their slots, so the visible glyph mass sits right of the geometric
      // center and the wordmark reads as shifted toward the right of the orb.
      // Nudge the whole block left by a fraction of a slot so the *ink* centers.
      const opticalShift = -slot * 0.13
      const left = cx - total / 2 + slot / 2 + opticalShift
      const slices = 16
      const postReveal = smooth(0.96, 1, reveal)
      const glitch = getLetterGlitch(time, postReveal > 0.995)
      const bootJitter = Math.max(0, 1 - reveal) * unit * 0.034 + (step < 39 ? unit * 0.009 : 0)
      let glitchX = cx

      ctx.save()
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.font = `900 ${fontSize}px Orbitron, sans-serif`
      ctx.lineJoin = 'round'

      for (let letterIndex = 0; letterIndex < letters.length; letterIndex++) {
        const letter = letters[letterIndex]
        const lx = left + slot * letterIndex
        const letterGlitchAmount = glitch.letter === letterIndex ? glitch.amount : 0
        const baseJitter = bootJitter + letterGlitchAmount * unit * 0.018
        const letterLife = 1 + letterGlitchAmount * Math.sin(time * 22 + letterIndex * 1.4) * 0.035

        const letterReveal = Math.min(
          1,
          smooth(0.05 + letterIndex * 0.16, 0.48 + letterIndex * 0.12, reveal) * letterLife
        )

        const ignition = smooth(0.01 + letterIndex * 0.14, 0.18 + letterIndex * 0.14, reveal)

        if (ignition <= 0) {
          continue
        }

        if (letterGlitchAmount > 0) {
          glitchX = lx
        }

        const signalAlpha = ignition * (Math.max(0, 1 - smooth(0.68, 0.98, letterReveal)) + letterGlitchAmount * 0.8)

        // The 7 horizontal "signal" lines only carry the reveal scanline and the
        // glitch flicker; once the letter is fully lit and not glitching their
        // alpha is effectively zero, so the whole shadowed-stroke loop is wasted
        // work on every idle frame. Skip it when it can't show.
        if (signalAlpha > 0.002) {
          ctx.save()
          ctx.globalAlpha = signalAlpha * 0.46
          ctx.strokeStyle = 'rgba(255,81,68,.62)'
          ctx.lineWidth = Math.max(1, unit * 0.0025)
          ctx.shadowColor = 'rgba(255,81,68,.9)'
          ctx.shadowBlur = unit * 0.01

          for (let i = 0; i < 7; i++) {
            const y = cy - fontSize * 0.42 + i * fontSize * 0.084
            const phase = Math.sin(time * 9 + i * 1.8 + letterIndex)
            const span = slot * (0.22 + letterReveal * 0.54) * (0.72 + Math.abs(phase) * 0.28)
            const x0 = lx - span / 2 + phase * unit * 0.008
            const x1 = lx + span / 2 + Math.cos(time * 7 + i) * unit * 0.008
            ctx.beginPath()
            ctx.moveTo(x0, y)
            ctx.lineTo(x1, y + Math.sin(time * 13 + i) * unit * 0.003)
            ctx.stroke()
          }

          ctx.restore()
        }

        // The 16-slice clipped redraw only animates while the letter is still
        // wiping in or actively glitching. Fully revealed and steady, every slice
        // re-renders the identical glyph — 16 clip+shadow fills that the base
        // stroke/fill below already cover. Collapse it to nothing in that case.
        const sliceActive = letterReveal < 0.999 || letterGlitchAmount > 0

        if (sliceActive) {
          for (let i = 0; i < slices; i++) {
            const sliceProgress = smooth(i / slices - 0.08, i / slices + 0.3, letterReveal)

            if (sliceProgress <= 0) {
              continue
            }

            const phase = letterGlitchAmount > 0 ? Math.sin(time * 10.5 + i * 4.17 + letterIndex * 2.1) : 0
            const bandY = cy - fontSize * 0.52 + i * (fontSize / slices)
            const bandHeight = (fontSize / slices) * (1.15 + Math.abs(phase) * 0.28)
            const offset = phase * baseJitter + ((i % 3) - 1) * baseJitter * 0.32

            ctx.save()
            ctx.beginPath()
            ctx.rect(lx - slot * 0.48, bandY, slot * 0.96, bandHeight)
            ctx.clip()
            const sliceBlink = letterGlitchAmount * Math.max(0, Math.sin(time * 18 + i * 1.7 + letterIndex)) ** 8
            ctx.globalAlpha = ignition * sliceProgress * (0.36 + Math.abs(phase) * 0.22 + sliceBlink * 0.18)
            ctx.fillStyle = 'rgba(255,209,199,.94)'
            ctx.shadowColor = 'rgba(255,81,68,.98)'
            ctx.shadowBlur = unit * (0.007 + sliceProgress * 0.01)
            ctx.fillText(letter, lx + offset, cy)
            ctx.restore()
          }
        }

        ctx.save()
        ctx.globalAlpha = letterReveal * (0.3 + letterGlitchAmount * 0.08)
        ctx.strokeStyle = 'rgba(255,209,199,.88)'
        ctx.lineWidth = Math.max(1, unit * 0.005)
        ctx.shadowColor = 'rgba(255,81,68,.95)'
        ctx.shadowBlur = unit * 0.018
        ctx.strokeText(letter, lx, cy)
        ctx.restore()

        ctx.save()
        // When the slice loop is skipped the glyph loses the bright slice fill
        // that gave its body weight, so lift the steady fill to keep "LERA" lit
        // at the same intensity instead of fading to just the outline.
        const fillBoost = sliceActive ? 0.3 : 0.62
        ctx.globalAlpha = smooth(0.72, 1, letterReveal) * (fillBoost + letterGlitchAmount * 0.08)
        ctx.fillStyle = 'rgba(255,217,207,.74)'
        ctx.shadowColor = 'rgba(255,81,68,.95)'
        ctx.shadowBlur = unit * 0.012
        ctx.fillText(
          letter,
          lx + letterGlitchAmount * Math.sin(time * 18 + letterIndex) * unit * 0.003,
          cy - unit * 0.002
        )
        ctx.restore()
      }

      ctx.save()
      ctx.globalAlpha = reveal * glitch.amount * (0.18 + 0.18 * Math.max(0, Math.sin(time * 20)))
      ctx.strokeStyle = 'rgba(255,209,199,.50)'
      ctx.lineWidth = Math.max(1, unit * 0.003)

      for (let i = 0; i < 7; i++) {
        const y = cy - unit * 0.075 + (i - 8.5) * unit * 0.009
        const wave = Math.sin(time * 7 + i * 0.8)
        const x0 = glitchX - slot * (0.38 + wave * 0.08)
        const x1 = glitchX + slot * (0.38 + Math.cos(time * 8 + i) * 0.08)
        ctx.beginPath()
        ctx.moveTo(x0, y)
        ctx.lineTo(x1, y + Math.sin(time * 12 + i) * unit * 0.004)
        ctx.stroke()
      }

      ctx.restore()
      ctx.restore()
    }

    const drawFilaments = (cx: number, cy: number, unit: number, time: number, intensity: number) => {
      if (intensity <= 0) {
        return
      }

      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineWidth = Math.max(1, unit * 0.0024)
      ctx.strokeStyle = 'rgba(255,209,199,.46)'
      ctx.shadowColor = 'rgba(255,81,68,.95)'
      ctx.shadowBlur = unit * 0.01

      for (let i = 0; i < 18; i++) {
        const a = i * 0.71 + time * (0.18 + (i % 5) * 0.018)
        const r0 = unit * (0.16 + (i % 7) * 0.028)
        const r1 = r0 + unit * (0.04 + Math.sin(time * 2 + i) * 0.018)
        const bend = Math.sin(time * 1.7 + i) * 0.18
        ctx.globalAlpha = intensity * (0.12 + 0.28 * Math.sin(time * 4 + i) ** 2)
        ctx.beginPath()
        ctx.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0 * 0.82)
        ctx.quadraticCurveTo(
          cx + Math.cos(a + bend) * (r0 + r1) * 0.5,
          cy + Math.sin(a - bend) * (r0 + r1) * 0.41,
          cx + Math.cos(a + 0.22) * r1,
          cy + Math.sin(a + 0.22) * r1 * 0.82
        )
        ctx.stroke()
      }

      ctx.restore()
    }

    // The background and vignette gradients only depend on the canvas geometry,
    // not on time, so rebuilding them every frame is pure waste. Cache them and
    // only regenerate when the box (unit) actually changes.
    let cachedGradUnit = -1
    let bgGradient: CanvasGradient | null = null
    let vignetteGradient: CanvasGradient | null = null

    const ensureGradients = (cx: number, cy: number, unit: number) => {
      if (unit === cachedGradUnit && bgGradient && vignetteGradient) {
        return
      }

      cachedGradUnit = unit

      bgGradient = ctx.createRadialGradient(cx, cy, unit * 0.08, cx, cy, unit * 0.56)
      bgGradient.addColorStop(0, 'rgba(177,37,24,.22)')
      bgGradient.addColorStop(0.45, 'rgba(114,23,17,.16)')
      bgGradient.addColorStop(1, 'rgba(0,0,0,0)')

      vignetteGradient = ctx.createRadialGradient(cx, cy, unit * 0.12, cx, cy, unit * 0.66)
      vignetteGradient.addColorStop(0, 'rgba(40,6,4,0)')
      vignetteGradient.addColorStop(0.5, 'rgba(40,6,4,.08)')
      vignetteGradient.addColorStop(1, 'rgba(0,0,0,.50)')
    }

    // The reactor's expensive 3-layer drop-shadow filter is gone (it is now a
    // content-independent box-shadow the GPU caches once), so a perpetually
    // animating canvas no longer forces a per-frame filter re-composite — the
    // heat that previously survived every throttle. We can therefore keep the
    // orb alive: full-speed boot, then a low-frame-rate idle that drifts forever
    // but is paused whenever the document is hidden or reduced-motion is on.
    const draw = () => {
      if (disposed) {
        return
      }

      // Stop burning frames while the window/tab is in the background — an
      // off-screen orb composites for no one. We re-arm on visibilitychange.
      if (typeof document !== 'undefined' && document.hidden) {
        return
      }

      const now = performance.now()
      const elapsed = now - start
      const inBoot = elapsed < sequenceMs
      const frameBudget = inBoot ? bootFrameMs : idleFrameMs

      if (elapsed - lastPaint < frameBudget) {
        animationFrame = requestAnimationFrame(draw)

        return
      }

      lastPaint = elapsed

      // During boot, advance through the reveal sequence. After boot, hold the
      // sequence at its settled end state but let `time` keep advancing so the
      // particles/arcs/core continue their slow orbital drift.
      const clamped = inBoot ? elapsed : sequenceMs
      const step = Math.min(sequenceSteps - 1, Math.floor(clamped / stepMs))
      const p = clamped / sequenceMs
      const w = canvas.clientWidth
      const h = canvas.clientHeight

      // Keep the backing buffer matched to the live CSS box every frame. If the
      // reactor was laid out (or grew) after resize() last ran, the buffer would
      // otherwise stay a different size and the browser would stretch a small
      // buffer over the orb — smearing particles and pushing the arcs/word
      // off-canvas, leaving the interior nearly empty.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)

      if (canvas.width !== Math.floor(w * dpr) || canvas.height !== Math.floor(h * dpr)) {
        resize()
      }

      const unit = Math.min(w, h)
      const cx = w / 2
      const cy = h / 2
      // `time` drives the orbital/breathing motion and must keep advancing in
      // idle (not be pinned to the boot duration) or the orb freezes the moment
      // the reveal completes. Using real elapsed time makes boot flow seamlessly
      // into idle with no jump.
      const time = elapsed * 0.001

      ctx.clearRect(0, 0, w, h)
      ctx.globalCompositeOperation = 'source-over'

      ensureGradients(cx, cy, unit)
      ctx.fillStyle = bgGradient as CanvasGradient
      ctx.fillRect(0, 0, w, h)

      ctx.globalCompositeOperation = 'lighter'
      const collapse = smooth(0.58, 0.78, p)
      const secondPass = smooth(32 / 43, 42 / 43, p)
      const wordReveal = smooth(20 / 43, 42 / 43, p)
      const ringRadius = unit * (0.365 - collapse * 0.065 + Math.sin(time * 0.8) * 0.007)
      const outerRadius = unit * (0.424 - collapse * 0.038 + Math.cos(time * 0.5) * 0.006)

      // Every painted frame is full quality: the boot frames and the single
      // terminal "settled" frame. The settled frame is drawn once and then the
      // loop stops (see the freeze logic above), so there is no idle budget to
      // protect — full shadowBlur, full seed count and full particle field give a
      // crisp frozen orb at no ongoing cost.
      drawParticles(cx, cy, unit, time, p, 1 - collapse * 0.22 + secondPass * 0.18)
      drawNoisyArc(
        cx,
        cy,
        outerRadius,
        unit * 0.011,
        0.62 - collapse * 0.24 + secondPass * 0.2,
        time,
        time * 0.1,
        'rgba(255,209,199,.84)'
      )
      drawNoisyArc(
        cx,
        cy,
        outerRadius * 0.91,
        unit * 0.005,
        0.26 + secondPass * 0.14,
        time,
        -time * 0.26,
        'rgba(255,81,68,.58)'
      )
      drawNoisyArc(cx, cy, ringRadius, unit * 0.006, 0.42 + secondPass * 0.2, time, -time * 0.16, 'rgba(255,81,68,.70)')

      // Inner detail arcs + filaments: drawn on every painted frame (boot and the
      // terminal settled frame) so the frozen orb keeps its full interior.
      drawNoisyArc(
        cx,
        cy,
        unit * 0.255,
        unit * 0.004,
        0.2 + secondPass * 0.18,
        time,
        time * 0.22,
        'rgba(255,209,199,.45)'
      )
      drawNoisyArc(
        cx,
        cy,
        unit * 0.205,
        unit * 0.003,
        0.14 + wordReveal * 0.22,
        time,
        -time * 0.34,
        'rgba(255,81,68,.42)'
      )
      drawFilaments(cx, cy, unit, time, smooth(12 / 43, 42 / 43, p))

      drawCore(cx, cy, unit, time, p)

      drawGlitchWord(cx, cy + unit * 0.008, unit, time, wordReveal, step)

      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = vignetteGradient as CanvasGradient
      ctx.fillRect(0, 0, w, h)

      // Keep the loop alive: boot frames flow into the perpetual idle drift.
      // Under reduced-motion we still want the orb to *look* complete, so we let
      // the boot run to its settled frame and then stop — one full render, no
      // ongoing motion.
      if (!reduceMotion || inBoot) {
        animationFrame = requestAnimationFrame(draw)
      }
    }

    resize()
    window.addEventListener('resize', resize)

    // draw() bails out while document.hidden, killing the rAF chain. When the
    // tab/window comes back, re-arm the loop (unless reduced-motion, which holds
    // a single settled frame and needs no restart).
    const handleVisibility = () => {
      if (!disposed && !document.hidden && !reduceMotion) {
        cancelAnimationFrame(animationFrame)
        animationFrame = requestAnimationFrame(draw)
      }
    }

    document.addEventListener('visibilitychange', handleVisibility)

    // The intro sits inside a flex chat layout, so the reactor's final box is
    // not known at mount — getBoundingClientRect() can report 0 (or an interim
    // size) before layout settles. Without re-syncing, the canvas buffer stays
    // locked to that stale measurement and every particle/arc/word is drawn
    // into a mismatched (often near-zero) buffer, leaving the orb nearly empty.
    // A ResizeObserver keeps the backing buffer matched to the live box so the
    // canvas fills the orb exactly like the reference.
    const resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize())

    resizeObserver?.observe(canvas)

    void (document.fonts?.ready ?? Promise.resolve()).then(() => {
      if (!disposed) {
        resize()
        animationFrame = requestAnimationFrame(draw)
      }
    })

    return () => {
      disposed = true
      cancelAnimationFrame(animationFrame)
      window.removeEventListener('resize', resize)
      document.removeEventListener('visibilitychange', handleVisibility)
      resizeObserver?.disconnect()
    }
  }, [active])

  if (!active) {
    return null
  }

  return (
    <div aria-hidden="true" className="lera-holo-orb">
      <div className="lera-holo-reactor">
        <canvas ref={canvasRef} />
        <div className="lera-holo-ring-pass" />
        <div className="lera-holo-scanline" />
      </div>
      <div className="lera-holo-hud-lines">
        <i />
        <i />
        <i />
        <i />
      </div>
    </div>
  )
}

function resolveCopy(personality?: string, seed?: number): IntroCopy {
  const personalityKey = normalizeKey(personality)

  const copies = NEUTRAL_PERSONALITIES.has(personalityKey)
    ? INTRO_COPY_BY_PERSONALITY[personalityKey] || neutralCopy()
    : INTRO_COPY_BY_PERSONALITY[personalityKey] || fallbackCopyForPersonality(personalityKey)

  return pickCopy(copies, seed)
}

export function Intro({ personality, seed }: IntroProps) {
  const [mountSeed] = useState(() => Math.floor(Math.random() * 100000))
  const { themeName } = useTheme()
  const copy = resolveCopy(personality, mountSeed + (seed ?? 0))
  const showLeraHoloEffect = themeName === 'holo'

  return (
    <div
      className="pointer-events-none flex w-full min-w-0 flex-col items-center justify-center px-0.5 py-6 text-center text-muted-foreground sm:px-6 lg:px-8"
      data-slot="aui_intro"
    >
      <LeraHoloEffect active={showLeraHoloEffect} />
      {showLeraHoloEffect ? (
        <p className="lera-holo-prompt m-0 text-center leading-normal tracking-tight">{copy.body}</p>
      ) : (
        <div className="relative z-[2] w-full min-w-0">
          <p
            aria-label={WORDMARK}
            className="fit-text mx-auto mb-1 w-[calc(100%-1rem)] font-['Collapse'] font-bold uppercase leading-[0.9] tracking-[0.08em] text-midground mix-blend-plus-lighter dark:text-foreground/90"
            style={{ '--fit-min': '2.75rem' } as CSSProperties}
          >
            <span>
              <span>{WORDMARK}</span>
            </span>
            <span aria-hidden="true">{WORDMARK}</span>
          </p>

          <p className="m-0 text-center leading-normal tracking-tight">{copy.body}</p>
        </div>
      )}
    </div>
  )
}
