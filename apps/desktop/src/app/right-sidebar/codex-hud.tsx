// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import {
  type CodexUsage,
  type CodexUsageWindow,
  codexWindowLabel,
  gaugePercent,
  HUD_SESSION_WINDOW_SECONDS,
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
 * Holo-skin Codex (ChatGPT) rate-limit card: one gauge per rate-limit window
 * ChatGPT reports — the rolling 5-hour window (`primary`) and the weekly one
 * (`secondary`) — side by side in the same grammar as the CLAUDE PLAN USAGE
 * card. Each ring shows the share of its window that has been CONSUMED,
 * stacked over the share of the window's time already elapsed (REMAINING-time
 * %), with a glowing triangle marking that elapsed share on the ring. Live
 * data from ChatGPT's usage API via the lera-hud backend plugin (which reuses
 * hermes' own Codex credential/refresh path).
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
        {/* ChatGPT returns the short rolling window first and the long one
            second, which lines the columns up with the CLAUDE card's
            SESSION-then-WEEKLY reading order. Each column labels itself from
            its own reported duration, so a plan that ships only one 7-day
            window (Plus) still labels the left ring WEEKLY. */}
        <CodexGaugeColumn
          fallbackLabel="5H LIMIT"
          fallbackWindowSeconds={HUD_SESSION_WINDOW_SECONDS}
          gradientId="holoCodexGaugePrimary"
          refreshing={refreshing}
          window={usage?.primary}
        />
        <CodexGaugeColumn
          fallbackLabel="WEEKLY"
          fallbackWindowSeconds={HUD_WEEKLY_WINDOW_SECONDS}
          gradientId="holoCodexGaugeSecondary"
          refreshing={refreshing}
          window={usage?.secondary}
        />
      </div>
    </section>
  )
}

function CodexGaugeColumn({
  fallbackLabel,
  fallbackWindowSeconds,
  gradientId,
  refreshing,
  window: usageWindow
}: {
  fallbackLabel: string
  /** Window length assumed for the elapsed-time figure when ChatGPT omits it. */
  fallbackWindowSeconds: number
  gradientId: string
  refreshing: boolean
  window: CodexUsageWindow | undefined
}) {
  const reset = hudResetParts(usageWindow?.resetAt)

  // Elapsed share of THIS window (window start = resetAt − its own duration),
  // shown as the second figure and the ring's triangle marker. Null (em-dash,
  // no marker) until a reset stamp exists.
  const remainingPct = usageWindow?.present
    ? remainingWindowPercent(usageWindow.resetAt, usageWindow.windowSeconds || fallbackWindowSeconds)
    : null

  // Derived before any conditional return because the scramble hooks feed on
  // them and hooks cannot sit behind one. Everything here is null-safe.
  const label = useScrambledText(codexWindowLabel(usageWindow?.windowSeconds, fallbackLabel), refreshing)
  const resetStamp = useScrambledText(reset.stamp, refreshing)

  return (
    <div className="hud-duo-col">
      <LeraHudGauge gradientId={gradientId} pct={gaugePercent(usageWindow?.usedPercent)} remainingPct={remainingPct} />
      <span className="hud-duo-label">{label}</span>
      {usageWindow?.present ? (
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
  )
}
