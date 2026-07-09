import './holo-room-background.css'

const SLOT = 'lera-room-background'
const CORNER_GLOW_SLOT = 'lera-window-corner-glow'

function cssUrl(url: string): string {
  return `url("${url.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}")`
}

function resolvePublicAsset(path: string): string {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.href)
  return new URL(path.replace(/^\/+/, ''), baseUrl).toString()
}

function appendCornerGlowLayer(): void {
  if (document.querySelector(`[data-slot="${CORNER_GLOW_SLOT}"]`)) {
    return
  }

  const layer = document.createElement('div')
  layer.dataset.slot = CORNER_GLOW_SLOT
  layer.setAttribute('aria-hidden', 'true')

  for (const corner of ['top-left', 'top-right', 'bottom-right', 'bottom-left']) {
    const segment = document.createElement('span')
    segment.dataset.corner = corner
    layer.appendChild(segment)
  }

  document.body.appendChild(layer)
}

function installHoloRoomBackground(): void {
  if (typeof document === 'undefined') {
    return
  }

  const root = document.documentElement
  root.style.setProperty('--lera-room-image', cssUrl(resolvePublicAsset('lera-background.png')))
  appendCornerGlowLayer()

  if (document.querySelector(`[data-slot="${SLOT}"]`)) {
    return
  }

  const layer = document.createElement('div')
  layer.dataset.slot = SLOT
  layer.setAttribute('aria-hidden', 'true')
  document.body.insertBefore(layer, document.getElementById('root'))
}

installHoloRoomBackground()
