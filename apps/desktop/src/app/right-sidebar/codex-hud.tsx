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
 */
export function CodexHud() {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const usage = useLeraHudPoll<CodexUsage>('/api/plugins/lera-hud/codex', POLL_INTERVAL_MS, isHolo)

  if (!isHolo) {
    return null
  }

  const primary = usage?.primary ?? null
  // Elapsed share of the 7-day window (window start = resetAt − 7d), shown as
  // the second figure and the ring's triangle marker. Null until a reset stamp
  // exists.
  const remainingPct = primary?.present ? remainingWindowPercent(primary.resetAt, HUD_WEEKLY_WINDOW_SECONDS) : null
  const reset = hudResetParts(primary?.resetAt)

  return (
    <section aria-label="Codex usage limits" data-hud="codex" data-slot="lera-hud">
      <header>
        <span>CODEX ANALYTICS</span>
        {usage?.plan ? <small>{usage.plan.toUpperCase()}</small> : <small>USED</small>}
      </header>
      <div className="hud-duo">
        <div className="hud-duo-col">
          <LeraHudGauge
            gradientId="holoCodexGaugeGradWeek"
            pct={gaugePercent(primary?.usedPercent)}
            remainingPct={remainingPct}
          />
          <span className="hud-duo-label">{codexWindowLabel(primary?.windowSeconds, 'WEEKLY')}</span>
          {primary?.present ? (
            // Match the CLAUDE PLAN USAGE card: "RESETS" label on its own line
            // with the full "JUL 16 16:33" stamp stacked below it, same font.
            <span className="hud-duo-reset hud-reset-stack">
              <span>RESETS</span>
              <span>{reset.stamp}</span>
            </span>
          ) : (
            <span className="hud-duo-reset">NO DATA</span>
          )}
        </div>
      </div>
    </section>
  )
}
