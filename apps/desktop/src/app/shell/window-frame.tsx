import { useStore } from '@nanostores/react'
import { useEffect } from 'react'

import { Codicon } from '@/components/ui/codicon'
import { useI18n } from '@/i18n'
import { IS_MAC } from '@/lib/keybinds/combo'
import { $connection } from '@/store/session'
import { isSecondaryWindow } from '@/store/windows'

// The chamfered "sci-fi HUD" outer shell for the frameless main window.
//
// On Windows/Linux the main BrowserWindow is created `frame: false` +
// `transparent: true` (see electron/main.cjs), so the OS draws no border, no
// min/max/close, and provides no edge-resize. This component paints the holo
// window shell — the actual visible window outline is a clip-path on
// `[data-slot='window-frame']` (holo.css), with a glowing red border and cut
// corners matching the side-panel frames. It also rebuilds the lost OS chrome:
//
//   • min / maximize / close buttons (top-right), and
//   • eight invisible resize hit-zones around the edges/corners that hand the
//     drag to the main process (`window.startResize`).
//
// It renders only where all of these hold: the holo skin is active, we're in
// the Electron shell with the window-control bridge, this is the primary
// window (secondary session windows keep their native frame), and we're not on
// macOS (which keeps its native titlebar + traffic lights).

const RESIZE_HANDLES = [
  'top',
  'right',
  'bottom',
  'left',
  'top-left',
  'top-right',
  'bottom-left',
  'bottom-right'
] as const

type ResizeDirection = (typeof RESIZE_HANDLES)[number]

function shouldRenderWindowShell(): boolean {
  if (IS_MAC) {return false}

  if (isSecondaryWindow()) {return false}

  if (typeof window === 'undefined') {return false}

  return typeof window.hermesDesktop?.window?.startResize === 'function'
}

export function WindowFrame() {
  const { t } = useI18n()
  const connection = useStore($connection)
  const isMaximized = Boolean(connection?.isMaximized)
  const enabled = shouldRenderWindowShell()

  // Mirror the maximized flag onto <html> so the clip-path can flatten its
  // chamfers to square when the window fills the screen (holo.css keys off
  // [data-window-maximized='true']). Cleared on unmount / when disabled so the
  // attribute never lingers on a theme switch.
  useEffect(() => {
    if (typeof document === 'undefined') {return undefined}
    const root = document.documentElement

    // `data-window-shell` flags that the app paints into a frameless notched
    // window, so holo.css clips the app fill to the chamfer (otherwise the
    // opaque body fill would square off the cut corners). `data-window-maximized`
    // flattens that chamfer when the window fills the screen.
    if (enabled) {
      root.dataset.windowShell = 'holo'
    } else {
      delete root.dataset.windowShell
    }

    if (enabled && isMaximized) {
      root.dataset.windowMaximized = 'true'
    } else {
      delete root.dataset.windowMaximized
    }

    return () => {
      delete root.dataset.windowShell
      delete root.dataset.windowMaximized
    }
  }, [enabled, isMaximized])

  if (!enabled) {return null}

  const controls = window.hermesDesktop?.window

  if (!controls) {return null}

  const startResize = (direction: ResizeDirection) => (event: React.PointerEvent) => {
    // Only a primary (left) press starts a resize; ignore while maximized (the
    // window has no floating edges to drag then).
    if (event.button !== 0 || isMaximized) {return}
    event.preventDefault()
    controls.startResize(direction)

    const end = () => {
      controls.endResize()
      window.removeEventListener('pointerup', end)
      window.removeEventListener('blur', end)
    }

    window.addEventListener('pointerup', end)
    window.addEventListener('blur', end)
  }

  return (
    <>
      {/* The visible notched shell + glowing border. Pointer-events:none so it
          never intercepts app input; the clip-path + border live in holo.css.
          The dark floor is the :root background (clipped to the same silhouette
          in holo.css) — no separate backdrop element, so nothing covers the
          app content. */}
      <div aria-hidden="true" className="lera-window-frame" data-slot="window-frame" />

      {/* Glow overlay — sits ABOVE the app content (high z) and casts an inset
          neon halo along the silhouette edge via box-shadow, with a transparent
          fill so it never covers content. This is what makes the outer border
          out-glow the inner sidebar frame. Styling in holo.css. */}
      <div aria-hidden="true" className="lera-window-frame-glow" data-slot="window-frame-glow" />

      {/* Hex (petek) honeycomb wall — a low-opacity overlay above content so the
          ambient HUD pattern is visible everywhere (behind-content layers were
          occluded by the chat surface). pointer-events:none; styling in holo.css. */}
      <div aria-hidden="true" className="lera-window-hex" data-slot="window-hex" />

      {/* Resize grips. Hidden while maximized (no floating edges). */}
      {!isMaximized && (
        <div aria-hidden="true" className="lera-window-resize-layer" data-slot="window-resize-layer">
          {RESIZE_HANDLES.map(direction => (
            <div
              className="lera-window-resize-handle"
              data-resize={direction}
              key={direction}
              onPointerDown={startResize(direction)}
            />
          ))}
        </div>
      )}

      {/* Custom min / maximize / close cluster — replaces the OS overlay. */}
      <div className="lera-window-controls" data-slot="window-controls">
        <button
          aria-label={t.shell.minimizeWindow}
          className="lera-window-control"
          data-control="minimize"
          onClick={() => controls.minimize()}
          type="button"
        >
          <Codicon name="chrome-minimize" />
        </button>
        <button
          aria-label={isMaximized ? t.shell.restoreWindow : t.shell.maximizeWindow}
          className="lera-window-control"
          data-control="maximize"
          onClick={() => controls.toggleMaximize()}
          type="button"
        >
          <Codicon name={isMaximized ? 'chrome-restore' : 'chrome-maximize'} />
        </button>
        <button
          aria-label={t.shell.closeWindow}
          className="lera-window-control lera-window-control-close"
          data-control="close"
          onClick={() => controls.close()}
          type="button"
        >
          <Codicon name="chrome-close" />
        </button>
      </div>
    </>
  )
}
