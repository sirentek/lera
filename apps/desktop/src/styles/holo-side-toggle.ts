import './holo-side-toggle.css'

import { type AnimationEvent, useEffect, useLayoutEffect, useRef, useState } from 'react'

// Holo side-panel show/hide swing (titlebar sidebar buttons, ⌘B and friends).
//
// The side toggles collapse a whole root-row track to `display: none`
// (tree-split.tsx) — the panel stays mounted, it just vanishes in one frame.
// This hook watches each track's "side gone" flag and reports a short phase:
//   arm  the side just came back — the panel waits folded against its room
//        wall, unanimated, until the reveal frame has been drawn
//   in   then it swings in from the wall
//   out  the side was just hidden — the track is KEPT on screen for the swing
//        back against the wall, then actually collapses
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

// The panel swing, or the plain fade a track without a holo panel gets.
const ANIMATIONS: Record<HoloSideFx, readonly string[]> = {
  arm: [],
  in: ['lera-holo-side-in', 'lera-holo-side-fade-in'],
  out: ['lera-holo-side-out', 'lera-holo-side-fade-out']
}

const FALLBACK_MS = 2500
// rAF stops while the window is minimised: don't leave a panel armed forever.
const ARM_FALLBACK_MS = 1500

const active = () => {
  const root = document.documentElement

  return root.dataset.hermesTheme === 'holo' && !root.hasAttribute('data-holo-boot')
}

export interface HoloSideToggle {
  /** The track is hidden by its side toggle but still swinging out. */
  leaving: (id: string) => boolean
  /** Spread on the track element. */
  props: (id: string) => {
    'data-holo-side-fx'?: HoloSideFx
    onAnimationEnd?: (event: AnimationEvent<HTMLElement>) => void
  }
}

/** `gone`: track id → hidden by a side toggle. */
export function useHoloSideToggle(gone: ReadonlyMap<string, boolean>): HoloSideToggle {
  const prev = useRef(gone)
  const timers = useRef(new Map<string, number>())
  const [fx, setFx] = useState<ReadonlyMap<string, HoloSideFx>>(() => new Map())

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

  const finish = (id: string, kind: HoloSideFx) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.delete(id)
    advance(id, kind)
  }

  const start = (id: string, kind: HoloSideFx) => {
    window.clearTimeout(timers.current.get(id))
    timers.current.set(
      id,
      window.setTimeout(() => finish(id, kind), FALLBACK_MS)
    )
  }

  const fire = (id: string) => {
    window.clearTimeout(timers.current.get(id))
    advance(id, 'arm', 'in')
    start(id, 'in')
  }

  // Layout effect: on a hide, the commit that set `display: none` is re-rendered
  // with the track held open BEFORE paint, so the panel never blinks out.
  // Runs every render on purpose: it diffs `gone` against the last render and
  // only sets state on a flip, so it can't loop.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useLayoutEffect(() => {
    const before = prev.current
    prev.current = gone

    const changes: [string, HoloSideFx][] = []

    for (const [id, isGone] of gone) {
      const was = before.get(id)

      if (was !== undefined && was !== isGone) {
        changes.push([id, isGone ? 'out' : 'arm'])
      }
    }

    if (changes.length === 0 || !active()) {
      return
    }

    setFx(current => {
      const next = new Map(current)

      for (const [id, kind] of changes) {
        next.set(id, kind)
      }

      return next
    })

    for (const [id, kind] of changes) {
      if (kind === 'arm') {
        window.clearTimeout(timers.current.get(id))
        timers.current.set(
          id,
          window.setTimeout(() => fire(id), ARM_FALLBACK_MS)
        )
        requestAnimationFrame(() => requestAnimationFrame(() => fire(id)))
      } else {
        start(id, kind)
      }
    }
  })

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
          if (ANIMATIONS[kind].includes(event.animationName)) {
            finish(id, kind)
          }
        }
      }
    }
  }
}
