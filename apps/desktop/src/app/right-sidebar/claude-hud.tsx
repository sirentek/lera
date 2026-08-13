// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import {
  type ClaudeUsage,
  type ClaudeUsageLimit,
  gaugePercent,
  HUD_SESSION_WINDOW_SECONDS,
  HUD_WEEKLY_WINDOW_SECONDS,
  hudResetParts,
  remainingWindowPercent,
  useLeraHudPoll
} from './lera-hud-data'
import { LeraHudGauge } from './lera-hud-gauge'
import { useHudManualRefresh, useScrambledText } from './lera-hud-refresh'

// The session (5-hour) window moves while a session is active, so poll every
// 5 minutes. The backend plugin caches for ~4.5 minutes on top.
const POLL_INTERVAL_MS = 5 * 60 * 1000

/**
 * Holo-skin Claude Code plan-usage card: three gauges showing the share of the
 * session / weekly-all / weekly-Fable limits that has been CONSUMED (not
 * remaining), each with its reset stamp — the same three rows the CLI's
 * `/usage` screen shows. Live data from Claude's OAuth usage endpoint via the
 * lera-hud backend plugin (which reads the CLI's local access token).
 *
 * Clicking (or Enter/Space on) the card forces an immediate re-poll and runs
 * the refresh sweep: the gauge rings gain counter-spinning scan arcs and a
 * radar ping, the labels and reset stamps scramble through random glyphs, and
 * the header tag swaps the plan name for REFRESHING.. — see the
 * `[data-refreshing]` block in lera-hud.css.
 */
export function ClaudeHud() {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const { refreshing, reloadToken, triggerProps } = useHudManualRefresh()
  const usage = useLeraHudPoll<ClaudeUsage>('/api/plugins/lera-hud/claude', POLL_INTERVAL_MS, isHolo, reloadToken)

  if (!isHolo) {
    return null
  }

  return (
    <section
      {...triggerProps}
      aria-label="Claude plan usage limits — activate to refresh"
      data-hud="claude"
      data-slot="lera-hud"
    >
      <header>
        <span>CLAUDE PLAN USAGE</span>
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
      <div className="hud-trio">
        <ClaudeGaugeColumn
          gradientId="holoClaudeGaugeSession"
          label="SESSION"
          limit={usage?.session}
          refreshing={refreshing}
          windowSeconds={HUD_SESSION_WINDOW_SECONDS}
        />
        <ClaudeGaugeColumn
          gradientId="holoClaudeGaugeWeeklyAll"
          label="WEEKLY"
          limit={usage?.weeklyAll}
          refreshing={refreshing}
          windowSeconds={HUD_WEEKLY_WINDOW_SECONDS}
        />
        <ClaudeGaugeColumn
          gradientId="holoClaudeGaugeFable"
          label="FABLE"
          limit={usage?.weeklyFable}
          refreshing={refreshing}
          windowSeconds={HUD_WEEKLY_WINDOW_SECONDS}
        />
      </div>
    </section>
  )
}

function ClaudeGaugeColumn({
  gradientId,
  label,
  limit,
  refreshing,
  windowSeconds
}: {
  gradientId: string
  label: string
  limit: ClaudeUsageLimit | undefined
  refreshing: boolean
  windowSeconds: number
}) {
  const reset = hudResetParts(limit?.resetAt)
  // Share of this rolling window still ahead of now — shown as the second
  // (REMAINING-time) figure in the gauge center and as the glowing triangle
  // marker on the ring. Null (em-dash, no marker) until a reset stamp exists.
  const remainingPct = limit?.present ? remainingWindowPercent(limit.resetAt, windowSeconds) : null
  const scrambledLabel = useScrambledText(label, refreshing)
  const scrambledStamp = useScrambledText(reset.stamp, refreshing)

  return (
    <div className="hud-duo-col">
      <LeraHudGauge gradientId={gradientId} pct={gaugePercent(limit?.usedPercent)} remainingPct={remainingPct} />
      <span className="hud-duo-label">{scrambledLabel}</span>
      {limit?.present ? (
        // "RESETS" label on its own line, full "JUL 16 16:33" stamp on the line
        // below it, so every column keeps one label width and the three rings
        // stay aligned.
        <span className="hud-duo-reset hud-reset-stack">
          <span>RESETS</span>
          <span>{scrambledStamp}</span>
        </span>
      ) : (
        <span className="hud-duo-reset">NO DATA</span>
      )}
    </div>
  )
}
