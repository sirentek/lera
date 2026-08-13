import { type KeyboardEvent, useEffect, useState } from 'react'

/**
 * Click-to-refresh glue shared by the Lera HUD cards (CLAUDE PLAN USAGE,
 * CODEX ANALYTICS).
 *
 * The visual half lives entirely in lera-hud.css, hanging off the single
 * `data-refreshing` attribute these hooks set: spinning scan arcs inside the
 * gauge rings, a scan-line down the gauge row, glitch-flicker on the readouts.
 * The text half is useScrambledText below, which churns the labels and reset
 * stamps through random glyphs for the same beat.
 */

// How long the refresh sweep runs. The re-poll itself usually returns in well
// under a second, so this is an animation floor, not a wait: the rings spin and
// the text scrambles for this long regardless, which is what makes the refresh
// legible instead of a silent flicker.
const REFRESH_ANIMATION_MS = 1600

// Cycle rate of the character scramble — fast enough to read as machine
// chatter, slow enough that individual glyphs register.
const SCRAMBLE_TICK_MS = 55

const SCRAMBLE_GLYPHS = '0123456789ABCDEFXZ#%*/><'

/**
 * Card-level manual refresh: spread `triggerProps` onto the card's <section>
 * to make the whole card an activatable button, and pass `reloadToken` to
 * useLeraHudPoll so activating it forces an immediate, cache-bypassing re-poll.
 * `refreshing` is the same state the CSS reads, exposed for the header tag.
 */
export function useHudManualRefresh() {
  const [reloadToken, setReloadToken] = useState(0)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    if (!refreshing) {
      return
    }

    const timer = window.setTimeout(() => setRefreshing(false), REFRESH_ANIMATION_MS)

    return () => window.clearTimeout(timer)
  }, [refreshing])

  // Ignored while a sweep is already running, so a double-click can't stack
  // two re-polls or cut the animation short.
  const start = () => {
    if (refreshing) {
      return
    }

    setRefreshing(true)
    setReloadToken(token => token + 1)
  }

  return {
    refreshing,
    reloadToken,
    triggerProps: {
      'aria-busy': refreshing,
      'data-refreshing': refreshing ? 'true' : undefined,
      onClick: start,
      onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          start()
        }
      },
      role: 'button',
      tabIndex: 0
    }
  }
}

/**
 * Text that churns through random glyphs while `active`, snapping back to the
 * real string the moment it stops — the readout-reacquiring-its-signal beat
 * under each gauge. Spaces and colons are held so the "JUL 16 16:33" stamp
 * keeps its shape (and its width) while it scrambles.
 */
export function useScrambledText(text: string, active: boolean): string {
  const [display, setDisplay] = useState(text)

  useEffect(() => {
    if (!active) {
      setDisplay(text)

      return
    }

    const scramble = () =>
      setDisplay(text.replace(/[^\s:]/g, () => SCRAMBLE_GLYPHS[Math.floor(Math.random() * SCRAMBLE_GLYPHS.length)]))

    scramble()

    const timer = window.setInterval(scramble, SCRAMBLE_TICK_MS)

    return () => window.clearInterval(timer)
  }, [text, active])

  return display
}
