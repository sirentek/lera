// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import { type CodexUsage, codexWindowLabel, formatHudReset, gaugePercent, useLeraHudPoll } from './lera-hud-data'
import { LeraHudGauge } from './lera-hud-gauge'

// The 5-hour window moves while a session is active, so poll every 5
// minutes. The backend plugin caches for ~4.5 minutes on top.
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Holo-skin Codex (ChatGPT) rate-limit card: two gauges showing the share of
 * the primary/secondary usage windows that has been CONSUMED (not remaining),
 * each with its reset stamp. Each ring is labeled by its real window duration
 * (5H vs WEEKLY) since ChatGPT reports a single 7-day window as the primary on
 * some plans. Live data from ChatGPT's usage API via the lera-hud backend
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
  const secondary = usage?.secondary ?? null

  return (
    <section aria-label="Codex usage limits" data-hud="codex" data-slot="lera-hud">
      <header>
        <span>CODEX ANALYTICS</span>
        {usage?.plan ? <small>{usage.plan.toUpperCase()}</small> : <small>USED</small>}
      </header>
      <div className="hud-duo">
        <div className="hud-duo-col">
          <LeraHudGauge gradientId="holoCodexGaugeGrad5h" pct={gaugePercent(primary?.usedPercent)} />
          <span className="hud-duo-label">{codexWindowLabel(primary?.windowSeconds, '5H LIMIT')}</span>
          <span className="hud-duo-reset">RESETS {formatHudReset(primary?.resetAt)}</span>
        </div>
        <div className="hud-duo-col">
          <LeraHudGauge gradientId="holoCodexGaugeGradWeek" pct={gaugePercent(secondary?.usedPercent)} />
          {/* Empty slot: ChatGPT returns no secondary window on some plans
              (Plus today). Label it "SECONDARY" so it doesn't duplicate the
              primary ring's WEEKLY tag, and mark it NO DATA. */}
          <span className="hud-duo-label">{codexWindowLabel(secondary?.windowSeconds, 'SECONDARY')}</span>
          <span className="hud-duo-reset">
            {secondary?.present ? `RESETS ${formatHudReset(secondary.resetAt)}` : 'NO DATA'}
          </span>
        </div>
      </div>
    </section>
  )
}
