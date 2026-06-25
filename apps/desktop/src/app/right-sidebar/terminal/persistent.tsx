import { useStore } from '@nanostores/react'
import { atom } from 'nanostores'
import { type CSSProperties, useEffect, useLayoutEffect, useRef, useState } from 'react'

import { TerminalTab } from './index'

/**
 * One xterm Terminal mounted at the layout root and CSS-overlayed onto
 * whichever `<TerminalSlot />` is active. Moving the host DOM detaches xterm's
 * WebGL renderer (it observes its own attachment) and resets the screen, so
 * the host stays put and we chase the slot's bounding rect with position:fixed.
 */

const $slot = atom<HTMLElement | null>(null)

const SLOT_CLASS = 'relative flex min-h-0 min-w-0 flex-1 flex-col'

export function TerminalSlot({ className = SLOT_CLASS }: { className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = ref.current

    if (!el) {
      return
    }

    $slot.set(el)

    return () => {
      if ($slot.get() === el) {
        $slot.set(null)
      }
    }
  }, [])

  return <div className={className} ref={ref} />
}

interface PersistentTerminalProps {
  cwd: string
  onAddSelectionToChat: (text: string, label?: string) => void
}

interface Rect {
  top: number
  left: number
  width: number
  height: number
}

const sameRect = (a: Rect | null, b: Rect) =>
  !!a && a.top === b.top && a.left === b.left && a.width === b.width && a.height === b.height

// Transition properties that can move or resize the slot (sidebar slides,
// panel collapses). Anything else — color, opacity, shadow — can't displace
// it, so those transitions don't trigger a re-measure.
const LAYOUT_TRANSITION_PROPS = new Set([
  'width',
  'height',
  'min-width',
  'min-height',
  'max-width',
  'max-height',
  'top',
  'right',
  'bottom',
  'left',
  'inset',
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'flex-basis',
  'flex-grow',
  'grid-template-columns',
  'grid-template-rows',
  'transform',
  'translate'
])

// How long the rect must hold still before the measure loop goes back to
// sleep. Long enough to bridge a transition's start-up frames, short enough
// that an idle app does zero per-frame work.
const SETTLE_MS = 220

export function PersistentTerminal({ cwd, onAddSelectionToChat }: PersistentTerminalProps) {
  const slot = useStore($slot)
  const [rect, setRect] = useState<Rect | null>(null)
  const [ready, setReady] = useState(false)

  // A permanent rAF loop here kept the renderer painting (and a core busy)
  // the entire time the window was visible. Instead, re-measure only when
  // something signals the slot may have moved (resize/scroll/layout
  // transitions), and run a short rAF "settle" loop that lives only while
  // the rect is still changing — sidebar slides stay pixel-tracked, idle
  // cost is zero.
  useLayoutEffect(() => {
    if (!slot) {
      setRect(null)

      return
    }

    let prev: Rect | null = null
    let frame = 0
    let settleUntil = 0

    const measure = () => {
      const r = slot.getBoundingClientRect()
      // floor top/left + ceil right/bottom: overlay always covers the slot's
      // full pixel footprint, so half-pixel rects can't leak page bg through.
      const top = Math.floor(r.top)
      const left = Math.floor(r.left)
      const next: Rect = { top, left, width: Math.ceil(r.right) - left, height: Math.ceil(r.bottom) - top }

      if (sameRect(prev, next)) {
        return false
      }

      prev = next
      setRect(next)

      if (next.width > 0 && next.height > 0) {
        setReady(true)
      }

      return true
    }

    const tick = (now: number) => {
      frame = 0

      if (measure()) {
        settleUntil = now + SETTLE_MS
      }

      if (now < settleUntil) {
        frame = requestAnimationFrame(tick)
      }
    }

    const kick = () => {
      settleUntil = performance.now() + SETTLE_MS

      if (!frame) {
        frame = requestAnimationFrame(tick)
      }
    }

    measure()

    // Fires once on observe, so the post-mount layout settle is covered too.
    const observer = new ResizeObserver(kick)
    observer.observe(slot)
    observer.observe(document.documentElement)

    const onTransitionRun = (event: Event) => {
      if (LAYOUT_TRANSITION_PROPS.has((event as TransitionEvent).propertyName)) {
        kick()
      }
    }

    window.addEventListener('resize', kick)
    document.addEventListener('scroll', kick, { capture: true, passive: true })
    document.addEventListener('transitionrun', onTransitionRun, true)

    return () => {
      cancelAnimationFrame(frame)
      observer.disconnect()
      window.removeEventListener('resize', kick)
      document.removeEventListener('scroll', kick, { capture: true })
      document.removeEventListener('transitionrun', onTransitionRun, true)
    }
  }, [slot])

  const visible = Boolean(rect && rect.width > 0 && rect.height > 0)

  const style: CSSProperties = {
    position: 'fixed',
    top: rect?.top ?? 0,
    left: rect?.left ?? 0,
    width: rect?.width ?? 0,
    height: rect?.height ?? 0,
    display: 'flex',
    flexDirection: 'column',
    visibility: visible ? 'visible' : 'hidden',
    pointerEvents: visible ? 'auto' : 'none',
    zIndex: 4,
    // Match the live skin surface so the header strip (transparent) and body
    // read as one cohesive pane instead of revealing a near-black slab behind.
    backgroundColor: 'var(--ui-editor-surface-background)',
    contain: 'layout size paint'
  }

  // Defer mount until real dims — booting xterm at 0×0 starts the shell at
  // 80×24, then the first ResizeObserver SIGWINCH redraws the prompt on a
  // new line. After first measurement we keep it mounted forever.
  return (
    <div aria-hidden={!visible} style={style}>
      {ready && <TerminalTab cwd={cwd} onAddSelectionToChat={onAddSelectionToChat} />}
    </div>
  )
}
