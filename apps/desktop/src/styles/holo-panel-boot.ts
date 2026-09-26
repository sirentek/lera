import { $desktopBoot } from '@/store/boot'
import { $gatewayState } from '@/store/session'

import { exitBootScreen, mountBootScreen, removeBootScreen } from './holo-boot-screen'
import './holo-panel-boot.css'

// Launch choreography sequencer for holo-panel-boot.css.
//
// <html data-holo-boot>:
//   hold  (startup)       the holo launch screen (holo-boot-screen.ts) is up;
//                         panels and the whole centre column wait invisible
//                         underneath it until the gateway is open AND the GPU
//                         has warmed up — then the launch screen plays its exit
//   run   (screen gone)   panel stages play one after another
//   text  (panels done)   composer, tabs, orb and session text come in
//   —     (removed)       nothing replays: panel toggles, tab switches and
//                         scrolling later render normally
//
// Panels mount at unrelated times on a cold launch (the right sidebar can land
// seconds after the Sessions stack). Starting each on mount made the second
// swing and the text reveal cut into the first swing + scan beam, so each
// panel is marked data-holo-enter="play" only when the previous stage has
// FINISHED; until then CSS keeps it hidden in its folded pose.
const ATTR = 'data-holo-boot'
const PANEL_ATTR = 'data-holo-enter'
const PANELS = [
  "[data-slot='pane-body-stack']:has(> [data-slot='lera-zone-hud'])",
  "[data-slot='sidebar']",
  "[data-slot='bots-panel']",
  "[data-slot='lera-zone-hud']",
  "[data-slot='right-sidebar']"
].join(', ')
const ZONE_STACK = "[data-slot='pane-body-stack']:has(> [data-slot='lera-zone-hud'])"

// Matches the CSS: panel swing, and the text reveal's last stagger + duration.
const SWING_MS = 7200
const TEXT_MS = 600 + 11 * 280 + 2400 + 500
// Pause between one finished stage and the next one starting.
const STAGE_GAP_MS = 120
// Gateway open -> first stage: let the connecting screen clear first.
const RUN_DELAY_MS = 300
// First stage waits for the session content and for frames to have been
// arriving without a gap longer than SMOOTH_FRAME_MS for SMOOTH_WINDOW_MS —
// see "GPU warm-up" below. Capped so a slow machine still gets the show.
const SMOOTH_FRAME_MS = 50
const SMOOTH_WINDOW_MS = 600
const SMOOTH_CAP_MS = 8000
// After the text starts, how long a straggler panel may still be waited for.
const QUIET_CLOSE_MS = TEXT_MS + 400
// Gateway never opened (boot failure covers the screen): stop hiding things.
const HOLD_FALLBACK_MS = 60_000
// Hard stop for the whole sequence once running.
const RUN_FALLBACK_MS = 60_000

function sweepChatColumn(): void {
  const target =
    document.querySelector<HTMLElement>("[data-slot='aui_thread-viewport']") ??
    document.querySelector<HTMLElement>('main')

  const rect = target?.getBoundingClientRect()

  if (!rect || rect.width < 40 || rect.height < 40) {
    return
  }

  const beam = document.createElement('div')
  beam.className = 'lera-holo-scan-beam'
  beam.setAttribute('aria-hidden', 'true')
  Object.assign(beam.style, {
    left: `${rect.left}px`,
    top: `${rect.top}px`,
    width: `${rect.width}px`,
    height: `${rect.height}px`
  })
  beam.style.setProperty('--scan-h', `${rect.height + 100}px`)
  document.body.appendChild(beam)
  window.setTimeout(() => beam.remove(), 6200)
}

// Inside the shared zone stack the stack owns the transform (holo.css), so its
// children are not panels of their own.
function isOwnPanel(el: Element): boolean {
  const stack = el.parentElement?.closest(ZONE_STACK)

  return !stack
}

function panelKey(el: HTMLElement): string {
  const side = el.classList.contains('border-r') ? 'r' : el.classList.contains('border-l') ? 'l' : ''

  return `${el.dataset.slot}:${side}`
}

function installHoloPanelBoot(): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.setAttribute(ATTR, 'hold')

  const played = new Set<string>()
  let busyUntil = 0
  let firstStage = true
  let textAt = 0
  let scanQueued = false
  let stageTimer = 0
  let closeTimer = 0
  const observer = new MutationObserver(() => queueScan())

  const close = () => {
    observer.disconnect()
    window.clearTimeout(stageTimer)
    window.clearTimeout(closeTimer)
    root.removeAttribute(ATTR)
  }

  const contentReady = () =>
    Boolean(document.querySelector("[data-slot='aui_message-group'], [data-slot='aui_intro']"))

  function waiting(): HTMLElement[] {
    return [...document.querySelectorAll<HTMLElement>(PANELS)].filter(
      el => !el.hasAttribute(PANEL_ATTR) && isOwnPanel(el) && el.getBoundingClientRect().width > 0
    )
  }

  function scan() {
    scanQueued = false

    if (!root.hasAttribute(ATTR)) {
      return
    }

    const now = performance.now()

    if (now < busyUntil) {
      window.clearTimeout(stageTimer)
      stageTimer = window.setTimeout(scan, busyUntil - now)

      return
    }

    const fresh = waiting()

    // A remount of a panel that already swung shows at rest, no replay.
    const stage = fresh.filter(el => !played.has(panelKey(el)))

    for (const el of fresh) {
      el.setAttribute(PANEL_ATTR, stage.includes(el) ? 'play' : 'rest')
    }

    if (stage.length > 0) {
      for (const el of stage) {
        played.add(panelKey(el))
      }

      if (firstStage) {
        firstStage = false
        sweepChatColumn()
      }

      busyUntil = now + SWING_MS + STAGE_GAP_MS
      stageTimer = window.setTimeout(scan, SWING_MS + STAGE_GAP_MS)

      // A straggler after the text: don't let the close cut its swing short.
      if (textAt) {
        window.clearTimeout(closeTimer)
        closeTimer = window.setTimeout(close, SWING_MS + 400)
      }

      return
    }

    // Panels are all done: the text goes last, on its own.
    if (!textAt && contentReady()) {
      textAt = now
      root.setAttribute(ATTR, 'text')
      busyUntil = now + TEXT_MS
      window.clearTimeout(closeTimer)
      closeTimer = window.setTimeout(close, QUIET_CLOSE_MS)
    }
  }

  function queueScan() {
    if (!scanQueued) {
      scanQueued = true
      queueMicrotask(scan)
    }
  }

  const run = () => {
    if (root.getAttribute(ATTR) !== 'hold') {
      return
    }

    root.setAttribute(ATTR, 'run')
    closeTimer = window.setTimeout(close, RUN_FALLBACK_MS)
    observer.observe(document.body, { childList: true, subtree: true })
    scan()
  }

  // Launch screen out first (collapse + shockwave), then the panels.
  let starting = false

  const start = () => {
    if (starting) {
      return
    }

    starting = true
    unsubscribe()
    window.clearTimeout(holdFallback)
    exitBootScreen(run)
  }

  const holdFallback = window.setTimeout(start, HOLD_FALLBACK_MS)
  let opened = false

  // GPU warm-up. Traced over CDP: the first swing was composited fine, yet
  // the screen stopped updating for 930 / 755 / 718 / 484 / 433 ms inside it
  // while the second swing had no gap at all. The GPU process was busy with
  // first-time work — rasterising the freshly loaded session/HUD content
  // (single RendererRasterWorker tasks of ~0.9s) and first-use render passes
  // for the frame filters — and a compositor animation can't draw either
  // while that runs. So the sequence (a) keeps waiting elements at opacity
  // 0.01, not 0 (see the CSS): invisible on the dark room, but still drawn,
  // so their raster + filter passes are paid during the hold; and (b) only
  // starts once frames have been arriving smoothly for a while.
  const waitForSmoothFrames = (then: () => void) => {
    let last = performance.now()
    let smoothSince = last
    let finished = false

    const finish = () => {
      if (!finished) {
        finished = true
        window.clearTimeout(cap)
        then()
      }
    }

    // The cap is a real timer, not a check inside the rAF loop: rAF stops
    // while the window is minimised / behind the RDP client, and the launch
    // then sat in `hold` until the 60s fallback.
    const cap = window.setTimeout(finish, SMOOTH_CAP_MS)

    const tick = (now: number) => {
      if (finished) {
        return
      }

      if (now - last > SMOOTH_FRAME_MS) {
        smoothSince = now
      }

      last = now

      if (contentReady() && now - smoothSince >= SMOOTH_WINDOW_MS) {
        finish()
      } else {
        requestAnimationFrame(tick)
      }
    }

    requestAnimationFrame(tick)
  }

  const onOpen = () => {
    if (!opened) {
      opened = true
      window.setTimeout(() => waitForSmoothFrames(start), RUN_DELAY_MS)
    }
  }

  const unsubscribe = $gatewayState.listen(state => state === 'open' && onOpen())

  // Boot failed: upstream's failure overlay owns the screen — drop the launch
  // screen and stop hiding anything.
  const stopOnError = $desktopBoot.listen(boot => {
    if (boot.error) {
      stopOnError()
      removeBootScreen()
      close()
    }
  })

  mountBootScreen()

  if ($gatewayState.get() === 'open') {
    onOpen()
  }
}

installHoloPanelBoot()
