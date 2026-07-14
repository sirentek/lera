// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import { type ClaudeUsage, type ClaudeUsageLimit, gaugePercent, hudResetParts, useLeraHudPoll } from './lera-hud-data'
import { LeraHudGauge } from './lera-hud-gauge'

// The session (5-hour) window moves while a session is active, so poll every
// 5 minutes. The backend plugin caches for ~4.5 minutes on top.
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Holo-skin Claude Code plan-usage card: three gauges showing the share of the
 * session / weekly-all / weekly-Fable limits that has been CONSUMED (not
 * remaining), each with its reset stamp — the same three rows the CLI's
 * `/usage` screen shows. Live data from Claude's OAuth usage endpoint via the
 * lera-hud backend plugin (which reads the CLI's local access token).
 */
export function ClaudeHud() {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const usage = useLeraHudPoll<ClaudeUsage>('/api/plugins/lera-hud/claude', POLL_INTERVAL_MS, isHolo)

  if (!isHolo) {
    return null
  }

  return (
    <section aria-label="Claude plan usage limits" data-hud="claude" data-slot="lera-hud">
      <header>
        <span>CLAUDE PLAN USAGE</span>
        <small>{usage?.plan ? usage.plan.toUpperCase() : 'USED'}</small>
      </header>
      <div className="hud-trio">
        <ClaudeGaugeColumn gradientId="holoClaudeGaugeSession" label="SESSION" limit={usage?.session} />
        <ClaudeGaugeColumn gradientId="holoClaudeGaugeWeeklyAll" label="WEEKLY" limit={usage?.weeklyAll} />
        <ClaudeGaugeColumn gradientId="holoClaudeGaugeFable" label="FABLE" limit={usage?.weeklyFable} />
      </div>
    </section>
  )
}

function ClaudeGaugeColumn({
  gradientId,
  label,
  limit
}: {
  gradientId: string
  label: string
  limit: ClaudeUsageLimit | undefined
}) {
  const reset = hudResetParts(limit?.resetAt)

  return (
    <div className="hud-duo-col">
      <LeraHudGauge gradientId={gradientId} pct={gaugePercent(limit?.usedPercent)} />
      <span className="hud-duo-label">{label}</span>
      {limit?.present ? (
        // "RESETS" label on its own line, full "JUL 16 16:33" stamp on the line
        // below it, so every column keeps one label width and the three rings
        // stay aligned.
        <span className="hud-duo-reset hud-reset-stack">
          <span>RESETS</span>
          <span>{reset.stamp}</span>
        </span>
      ) : (
        <span className="hud-duo-reset">NO DATA</span>
      )}
    </div>
  )
}
