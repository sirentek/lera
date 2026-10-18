// LERA FORK: double-clicking the frameless holo window's titlebar band toggles
// maximize/restore, like a native Windows title bar.
//
// A `transparent: true` window on Windows does not get this from the OS
// (Electron's documented transparent-window limits), and the renderer can't do
// it either: the band is `-webkit-app-region: drag`, so Windows treats it as the
// caption (HTCAPTION) and no mouse event ever reaches the page.
//
// Hooking WM_NCLBUTTONDBLCLK does NOT work: real clicks land on Chromium's
// child Chrome_RenderWidgetHostHWND, which hands them straight to the frame's
// message handler, bypassing the top-level window proc that hookWindowMessage
// observes. What DOES reach that proc is the result: DefWindowProc turns the
// caption double-click into WM_SYSCOMMAND/SC_MAXIMIZE, which Electron then
// swallows for transparent windows. The hook sees it first, so act on it there.
// Electron's maximize on a transparent window is emulated (no WS_MAXIMIZE), so
// the OS sends SC_MAXIMIZE even when the window is already maximized — treat it
// as a toggle.

const WM_SYSCOMMAND = 0x0112
const SC_MASK = 0xfff0
const SC_MAXIMIZE = 0xf030
const SC_RESTORE = 0xf120

interface CaptionWindow {
  hookWindowMessage(message: number, callback: (wParam: Buffer, lParam: Buffer) => void): void
  isDestroyed(): boolean
  isMaximized(): boolean
  isMinimized(): boolean
  maximize(): void
  unmaximize(): void
}

export function toggleMaximizeOnCaptionDoubleClick(win: CaptionWindow): void {
  win.hookWindowMessage(WM_SYSCOMMAND, wParam => {
    const command = wParam.readUInt32LE(0) & SC_MASK

    // SC_RESTORE also un-minimizes from the taskbar — leave that to the OS.
    if (command !== SC_MAXIMIZE && (command !== SC_RESTORE || win.isMinimized())) {
      return
    }

    const wasMaximized = win.isMaximized()

    if (command === SC_RESTORE && !wasMaximized) {
      return
    }

    // The hook runs before Electron's own handling; if that ever does act on
    // the command itself (a future Electron), don't toggle it straight back.
    setImmediate(() => {
      if (win.isDestroyed() || win.isMaximized() !== wasMaximized) {
        return
      }

      if (wasMaximized) {
        win.unmaximize()
      } else {
        win.maximize()
      }
    })
  })
}
