// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import {
  type CodexUsage,
  codexWindowLabel,
  gaugePercent,
  HUD_WEEKLY_WINDOW_SECONDS,
  hudResetParts,
  remainingWindowPercent,
  useLeraHudPoll
} from './lera-hud-data'
import { LeraHudGauge } from './lera-hud-gauge'
import { useHudManualRefresh, useScrambledText } from './lera-hud-refresh'

// The 5-hour window moves while a session is active, so poll every 5
// minutes. The backend plugin caches for ~4.5 minutes on top.
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Holo-skin Codex (ChatGPT) rate-limit card: a single gauge showing the share
 * of the primary usage window that has been CONSUMED, stacked over the share
 * of the window's time already elapsed (REMAINING-time %), with a glowing
 * triangle marking that elapsed share on the ring — same grammar as the CLAUDE
 * PLAN USAGE card. Live data from ChatGPT's usage API via the lera-hud backend
 * plugin (which reuses hermes' own Codex credential/refresh path).
 *
 * Clicking (or Enter/Space on) the card runs the same refresh sweep the CLAUDE
 * card does — cache-bypassing re-poll, spinning scan arcs in the ring,
 * scrambling readouts, REFRESHING.. in the header — see lera-hud-refresh.ts.
 */
export function CodexHud() {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const { refreshing, reloadToken, triggerProps } = useHudManualRefresh()
  const usage = useLeraHudPoll<CodexUsage>('/api/plugins/lera-hud/codex', POLL_INTERVAL_MS, isHolo, reloadToken)

  const primary = usage?.primary ?? null
  // Elapsed share of the 7-day window (window start = resetAt − 7d), shown as
  // the second figure and the ring's triangle marker. Null until a reset stamp
  // exists.
  const remainingPct = primary?.present ? remainingWindowPercent(primary.resetAt, HUD_WEEKLY_WINDOW_SECONDS) : null
  const reset = hudResetParts(primary?.resetAt)
  // Derived above the holo bail-out because the scramble hooks feed on them and
  // hooks cannot sit behind a conditional return. Everything here is null-safe.
  const windowLabel = useScrambledText(codexWindowLabel(primary?.windowSeconds, 'WEEKLY'), refreshing)
  const resetStamp = useScrambledText(reset.stamp, refreshing)

  if (!isHolo) {
    return null
  }

  return (
    <section
      {...triggerProps}
      aria-label="Codex usage limits — activate to refresh"
      data-hud="codex"
      data-slot="lera-hud"
    >
      <header>
        <span>CODEX ANALYTICS</span>
        {refreshing ? (
          // Dots are real elements rather than an animated ::after `content`
          // string — discrete content animation is not reliably supported.
          <small className="hud-refresh-tag">
            REFRESHING
            <span className="hud-refresh-dot">.</span>
            <span className="hud-refresh-dot">.</span>
            <span className="hud-refresh-dot">.</span>
          </small>
        ) : (
          <small>{usage?.plan ? usage.plan.toUpperCase() : 'USED'}</small>
        )}
      </header>
      <div className="hud-duo">
        <div className="hud-duo-col">
          <LeraHudGauge
            gradientId="holoCodexGaugeGradWeek"
            pct={gaugePercent(primary?.usedPercent)}
            remainingPct={remainingPct}
          />
          <span className="hud-duo-label">{windowLabel}</span>
          {primary?.present ? (
            // Match the CLAUDE PLAN USAGE card: "RESETS" label on its own line
            // with the full "JUL 16 16:33" stamp stacked below it, same font.
            <span className="hud-duo-reset hud-reset-stack">
              <span>RESETS</span>
              <span>{resetStamp}</span>
            </span>
          ) : (
            <span className="hud-duo-reset">NO DATA</span>
          )}
        </div>
      </div>
    </section>
  )
}
