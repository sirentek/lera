import './holo-side-toggle.css'

import { type AnimationEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Holo side-panel show/hide swing (titlebar sidebar buttons, ⌘B and friends).
//
// The side toggles collapse a whole root-row track to `display: none`
// (tree-split.tsx) — the panel stays mounted, it just vanishes in one frame.
// When the side column is its own zone, the toggle MINIMIZES it to a 28px rail
// instead, which unmounts the panel and hands its width to the chat column in
// the same frame. This hook watches each track's state and reports a phase:
//   arm  the side just came back (or its rail was restored) — the panel waits
//        folded against its room wall, unanimated, until the reveal frame has
//        been drawn
//   in   then it swings in from the wall
//   out  the side was just hidden or railed — the track is KEPT on screen (and
//        a railed zone unminimized) for the swing back against the wall, then
//        actually collapses
// holo-side-toggle.css plays the swing on the panel inside the track
// (data-holo-side-fx on the track). Other themes, and the launch sequence
// (holo-panel-boot.ts owns that), get the plain instant toggle.
//
// A phase ends on the swing's own `animationend`, not on a timer: the toggle
// itself costs this renderer 100–500ms of main-thread work, and the compositor
// only starts the animation after that frame — a fixed timer cut the swing-out
// short. The timer is only a backstop in case no animation runs at all.
// The same cost is why a reveal is armed first: re-showing a side panel is a
// ~700ms frame (style + layout of the whole panel). An animation started with
// the reveal had its clock running through that frame and was ~90% done when
// it first reached the screen; `in` starts two frames later instead.
//
// Kept out of tree-split.tsx so an upstream merge only touches the call site.

export type HoloSideFx = 'arm' | 'in' | 'out'

/** shown, hidden by a side toggle, or minimized to its rail. */
export type HoloSideState = 'shown' | 'gone' | 'rail'

// The panel swing, or the plain fade a track without a holo panel gets.
const ANIMATIONS: Record<HoloSideFx, readonly string[]> = {
  arm: [],
  in: ['lera-holo-side-in', 'lera-holo-side-fade-in'],
  out: ['lera-holo-side-out', 'lera-holo-side-fade-out']
}

const FALLBACK_MS = 2500
// rAF stops while the window is minimised: don't leave a panel armed forever.
const ARM_FALLBACK_MS = 1500

// The panel holo-session-transition.ts replays as a power-off ghost when it
// unmounts. A railed zone has already swung it off, so it is marked first.
const GHOSTED_PANEL = "[data-slot='right-sidebar']"

const active = () => {
  const root = document.documentElement

  return root.dataset.hermesTheme === 'holo' && !root.hasAttribute('data-holo-boot')
}

const sameStates = (a: ReadonlyMap<string, HoloSideState>, b: ReadonlyMap<string, HoloSideState>) =>
  a.size === b.size && [...a].every(([id, state]) => b.get(id) === state)

export interface HoloSideToggle {
  /** The track is hidden or railed but still swinging out. */
  leaving: (id: string) => boolean
  /** Spread on the track element. */
  props: (id: string) => {
    'data-holo-side-fx'?: HoloSideFx
    onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void
  }
}

/** `sides`: track id → its state. */
export function useHoloSideToggle(sides: ReadonlyMap<string, HoloSideState>): HoloSideToggle {
  const [seen, setSeen] = useState(sides)
  const [fx, setFx] = useState<ReadonlyMap<string, HoloSideFx>>(() => new Map())
  const timers = useRef(new Map<string, number>())
  const started = useRef(new Map<string, HoloSideFx>())

  // Diffed DURING render (React's "adjust state when a prop changes"): React
  // re-runs this render before committing it, so a zone that was just railed
  // is never committed minimized — its panel would unmount and remount, and
  // the chat column would take its width for a frame. Terminates: `seen`
  // catches up, and an equal map sets nothing.
  if (!sameStates(seen, sides)) {
    setSeen(sides)

    if (active()) {
      const next = new Map(fx)

      for (const [id, state] of sides) {
        const was = seen.get(id)

        if (was === undefined || was === state) {
          continue
        }

        if (was === 'shown') {
          next.set(id, 'out')
        } else if (state === 'shown') {
          next.set(id, 'arm')
        }
      }

      setFx(next)
    }
  }

  // Move `id` from phase `from` to `to` (undefined = done), unless a newer
  // toggle already replaced `from`.
  const advance = (id: string, from: HoloSideFx, to?: HoloSideFx) =>
    setFx(current => {
      if (current.get(id) !== from) {
        return current
      }

      const next = new Map(current)

      if (to) {
        next.set(id, to)
      } else {
        next.delete(id)
      }

      return next
    })

  // Each phase's backstop timer (and an arm's double-rAF start), set once per
  // phase entered.
  useLayoutEffect(() => {
    for (const [id, kind] of fx) {
      if (started.current.get(id) === kind) {
        continue
      }

      started.current.set(id, kind)
      window.clearTimeout(timers.current.get(id))

      if (kind === 'arm') {
        timers.current.set(
          id,
          window.setTimeout(() => advance(id, 'arm', 'in'), ARM_FALLBACK_MS)
        )
        requestAnimationFrame(() => requestAnimationFrame(() => advance(id, 'arm', 'in')))
      } else {
        timers.current.set(
          id,
          window.setTimeout(() => advance(id, kind), FALLBACK_MS)
        )
      }
    }

    for (const id of [...started.current.keys()]) {
      if (!fx.has(id)) {
        started.current.delete(id)
        window.clearTimeout(timers.current.get(id))
        timers.current.delete(id)
      }
    }
  }, [fx])

  useEffect(() => {
    const pending = timers.current

    return () => pending.forEach(id => window.clearTimeout(id))
  }, [])

  return {
    leaving: id => fx.get(id) === 'out',
    props: id => {
      const kind = fx.get(id)

      if (!kind) {
        return {}
      }

      return {
        'data-holo-side-fx': kind,
        onAnimationEnd: event => {
          if (!ANIMATIONS[kind].includes(event.animationName)) {
            return
          }

          if (kind === 'out' && sides.get(id) === 'rail') {
            for (const panel of event.currentTarget.querySelectorAll(GHOSTED_PANEL)) {
              panel.setAttribute('data-holo-folded', '')
            }
          }

          advance(id, kind)
        }
      }
    }
  }
}
