import { sweepChatColumn } from './holo-panel-boot'
import './holo-session-transition.css'

// Holo transitions for things that change AFTER launch (holo-panel-boot.ts
// owns the launch itself and these stay quiet while it runs):
//
//  • Panel close — React unmounts the left panel (`right-sidebar`) outright
//    when a new session opens (or the panel is closed), so it used to vanish
//    in one frame. When it goes, a visual clone is dropped at its last layout
//    box and plays the launch swing in reverse: it turns back against the room
//    wall, flickers and powers off. The clone is inert (aria-hidden, no
//    pointer events) and removed when the animation ends.
//  • New session — the Lera orb (aui_intro) used to appear fully formed: its
//    own boot-in animation is killed by the reduced-motion blanket, which RDP
//    always reports. <html data-holo-session="enter"> drives a materialise
//    sequence in holo-session-transition.css (orb out of a spinning point +
//    shockwave ring, caption and composer flicker on) and the scan beam makes
//    one fast pass over the chat column.

const PANEL = "[data-slot='right-sidebar']"
const INTRO = "[data-slot='aui_intro']"
const SESSION_ATTR = 'data-holo-session'
// Longest piece of the new-session sequence in the CSS (orb arrive + delay).
const SESSION_FX_MS = 2600
// Panel power-off in the CSS.
const GHOST_MS = 1100

type Box = { left: number; top: number; width: number; height: number }

const launching = () => document.documentElement.hasAttribute('data-holo-boot')
const holo = () => document.documentElement.dataset.hermesTheme === 'holo'

// Last layout box of the live panel. It has to be known BEFORE React removes
// the panel, and the panel's own rect is skewed by its wall tilt, so read the
// untransformed wrapper it fills exactly (verified: same 320x728 box).
const lastBox = new WeakMap<Element, Box>()

function remember(panel: Element): void {
  const r = (panel.parentElement ?? panel).getBoundingClientRect()

  if (r.width > 20 && r.height > 20) {
    lastBox.set(panel, { left: r.left, top: r.top, width: r.width, height: r.height })
  }
}

const resizeWatch = new ResizeObserver(entries => {
  for (const entry of entries) {
    remember(entry.target)
  }
})

function track(root: ParentNode): void {
  const panels = root instanceof Element && root.matches(PANEL) ? [root] : [...root.querySelectorAll(PANEL)]

  for (const panel of panels) {
    resizeWatch.observe(panel)
    remember(panel)
  }
}

// Position can shift without a resize (window moved, other pane toggled), so
// refresh on the input that can precede a close as well.
function refreshAll(): void {
  for (const panel of document.querySelectorAll(PANEL)) {
    remember(panel)
  }
}

function powerOffGhost(panel: Element): void {
  const box = lastBox.get(panel)

  if (!box || !holo() || launching()) {
    return
  }

  const ghost = panel.cloneNode(true) as HTMLElement
  ghost.setAttribute('aria-hidden', 'true')
  ghost.setAttribute('data-holo-ghost', '')
  ghost.removeAttribute('id')
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${box.left}px`,
    top: `${box.top}px`,
    width: `${box.width}px`,
    height: `${box.height}px`,
    margin: '0'
  })
  document.body.appendChild(ghost)
  window.setTimeout(() => ghost.remove(), GHOST_MS + 100)
}

let sessionTimer = 0

function playNewSession(): void {
  if (!holo() || launching()) {
    return
  }

  const root = document.documentElement
  // Restart cleanly if another new session lands mid-sequence.
  root.removeAttribute(SESSION_ATTR)
  void root.offsetWidth
  root.setAttribute(SESSION_ATTR, 'enter')
  window.clearTimeout(sessionTimer)
  sessionTimer = window.setTimeout(() => root.removeAttribute(SESSION_ATTR), SESSION_FX_MS)
  sweepChatColumn({ durationMs: 1600, delayMs: 250 })
}

function install(): void {
  if (typeof document === 'undefined') {
    return
  }

  track(document)
  window.addEventListener('pointerdown', refreshAll, true)
  window.addEventListener('keydown', refreshAll, true)
  window.addEventListener('resize', refreshAll)

  new MutationObserver(records => {
    let introAdded = false

    for (const record of records) {
      for (const node of record.removedNodes) {
        if (node instanceof Element) {
          const panels = node.matches(PANEL) ? [node] : [...node.querySelectorAll(PANEL)]

          for (const panel of panels) {
            if (!panel.isConnected) {
              resizeWatch.unobserve(panel)
              powerOffGhost(panel)
            }
          }
        }
      }

      for (const node of record.addedNodes) {
        if (node instanceof Element && !node.hasAttribute('data-holo-ghost')) {
          track(node)

          if (node.matches(INTRO) || node.querySelector(INTRO)) {
            introAdded = true
          }
        }
      }
    }

    if (introAdded) {
      playNewSession()
    }
  }).observe(document.body, { childList: true, subtree: true })
}

install()
