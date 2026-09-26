import './holo-boot-screen.css'

// Holo launch screen: replaces upstream's CONNECTING decode text for the holo
// theme (that overlay is hidden in holo-boot-screen.css) and, unlike it, stays
// up through the whole boot warm-up — until holo-panel-boot.ts is ready to
// start the panel swings — so the room never sits half-populated in between.
//
// Plain DOM, not React: it has to exist before the app mounts and outlive the
// gateway overlay's own lifecycle. Every bit of motion is a transform/opacity
// CSS animation (compositor), because this is on screen exactly while the
// renderer main thread stalls for seconds at a time.

const HEX = '50,4 89.8,27 89.8,73 50,96 10.2,73 10.2,27'

const LOG = [
  ['Core matrix', 'Online'],
  ['Holo renderer', 'Ready'],
  ['Neural bridge', 'Sync'],
  ['Gateway uplink', 'Linking']
] as const

// Duration of the exit (collapse + shockwave) in holo-boot-screen.css.
export const BOOT_SCREEN_EXIT_MS = 1400

let screen: HTMLElement | null = null

const hexRing = (mod: string) =>
  `<div class="lera-boot__hex lera-boot__hex--${mod}"><svg viewBox="0 0 100 100"><polygon points="${HEX}"/></svg></div>`

export function mountBootScreen(): void {
  if (screen || typeof document === 'undefined') {
    return
  }

  const cells = Array.from({ length: 12 }, (_, i) => `<i style="--i:${i};--a:${i * 30}deg"></i>`).join('')
  const segments = Array.from({ length: 28 }, (_, i) => `<i style="--i:${i}"></i>`).join('')

  const log = LOG.map(
    ([label, state], i) =>
      `<p style="--i:${i}"><span>${label}</span><em></em><b${i === LOG.length - 1 ? ' data-live' : ''}>${state}</b></p>`
  ).join('')

  screen = document.createElement('div')
  screen.className = 'lera-boot'
  screen.setAttribute('aria-hidden', 'true')
  screen.innerHTML = `
    <div class="lera-boot__stage">
      <span class="lera-boot__bracket" data-c="tl"></span>
      <span class="lera-boot__bracket" data-c="tr"></span>
      <span class="lera-boot__bracket" data-c="bl"></span>
      <span class="lera-boot__bracket" data-c="br"></span>
      <div class="lera-boot__core">
        <span class="lera-boot__halo"></span>
        ${hexRing('outer')}
        ${hexRing('mid')}
        ${hexRing('inner')}
        <div class="lera-boot__cells">${cells}</div>
        <div class="lera-boot__word" data-text="LERA">LERA</div>
      </div>
      <div class="lera-boot__log">${log}</div>
      <div class="lera-boot__stream">${segments}</div>
      <span class="lera-boot__scan"></span>
      <span class="lera-boot__shock"></span>
    </div>`

  document.body.appendChild(screen)
}

// Collapse + shockwave, then remove. `done` runs when the exit has played.
export function exitBootScreen(done: () => void): void {
  const el = screen

  if (!el) {
    done()

    return
  }

  screen = null
  const live = el.querySelector('[data-live]')

  if (live) {
    live.textContent = 'Established'
  }

  el.classList.add('is-exiting')
  window.setTimeout(() => {
    el.remove()
    done()
  }, BOOT_SCREEN_EXIT_MS)
}

export function removeBootScreen(): void {
  screen?.remove()
  screen = null
}
