import { useEffect, useState } from 'react'

import type { ClaudeLoginStatus } from './lera-hud-data'

const LOGIN_PATH = '/api/plugins/lera-hud/claude/login'

// Local-only status check (no upstream call), so a short beat is cheap and
// the gauges fill within a few seconds of finishing the browser sign-in.
const STATUS_POLL_MS = 3_000

/**
 * Card-started Claude sign-in: `start` asks the lera-hud plugin to run
 * `claude auth login` (claude.exe opens the browser and writes the shared
 * ~/.claude/.credentials.json), then watches it until the process exits and
 * bumps `finished` — fold that into the usage poll's reload token so the card
 * re-polls with the new grant. The plugin reaps an abandoned sign-in after 10
 * minutes, which ends `pending` here too.
 */
export function useClaudeLogin() {
  const [pending, setPending] = useState(false)
  const [finished, setFinished] = useState(0)

  useEffect(() => {
    if (!pending) {
      return
    }

    let disposed = false
    let timer: number | undefined

    const check = async () => {
      let running = true

      try {
        const status = await window.hermesDesktop.api<ClaudeLoginStatus>({ path: LOGIN_PATH })
        running = status?.running === true
      } catch {
        // Backend hiccup: keep waiting, the next beat retries.
      }

      if (disposed) {
        return
      }

      if (running) {
        timer = window.setTimeout(() => void check(), STATUS_POLL_MS)
      } else {
        setPending(false)
        setFinished(count => count + 1)
      }
    }

    timer = window.setTimeout(() => void check(), STATUS_POLL_MS)

    return () => {
      disposed = true

      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [pending])

  const start = async () => {
    if (pending || !window.hermesDesktop?.api) {
      return
    }

    try {
      const status = await window.hermesDesktop.api<ClaudeLoginStatus>({ method: 'POST', path: LOGIN_PATH })

      if (status?.ok && status.running) {
        setPending(true)
      }
    } catch {
      // Nothing started; the card keeps offering SIGN IN.
    }
  }

  return { finished, pending, start }
}
