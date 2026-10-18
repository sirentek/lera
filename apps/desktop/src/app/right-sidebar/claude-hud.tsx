// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import type { KeyboardEvent } from 'react'

import { useTheme } from '@/themes/context'

import { useClaudeLogin } from './claude-login'
import { LeraCollapsibleHud } from './lera-collapsible-hud'
import {
  type ClaudeUsage,
  type ClaudeUsageLimit,
  gaugePercent,
  HUD_SESSION_WINDOW_SECONDS,
  HUD_WEEKLY_WINDOW_SECONDS,
  hudResetParts,
  remainingWindowPercent,
  useLeraHudPollState
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
 *
 * When the plugin reports `needsLogin` (dead/revoked Claude Code grant), the
 * readouts say SIGN IN and the same click starts `claude auth login` instead —
 * the browser sign-in the VS Code extension pops — and the gauges re-poll on
 * their own once it finishes.
 */
interface ClaudeHudProps {
  onCollapsedHeightChange?: (height: number) => void
}

export function ClaudeHud({ onCollapsedHeightChange }: ClaudeHudProps = {}) {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const { refreshing, reloadToken, triggerProps } = useHudManualRefresh()
  const login = useClaudeLogin()

  const { data: usage, failure } = useLeraHudPollState<ClaudeUsage>(
    '/api/plugins/lera-hud/claude',
    POLL_INTERVAL_MS,
    isHolo,
    reloadToken + login.finished
  )

  const needsLogin = failure?.needsLogin === true
  const notice = login.pending ? 'SIGNING IN' : needsLogin ? 'SIGN IN' : undefined

  const signIn = () => void login.start()

  const cardTrigger = needsLogin
    ? {
        ...triggerProps,
        onClick: signIn,
        onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault()
            signIn()
          }
        }
      }
    : triggerProps

  if (!isHolo) {
    return null
  }

  return (
    <LeraCollapsibleHud
      bodyClassName="hud-trio"
      hud="claude"
      label="Claude plan usage limits"
      onCollapsedHeightChange={onCollapsedHeightChange}
      plan={usage?.plan}
      refreshing={refreshing}
      tabLabel="CLAUDE"
      title="CLAUDE PLAN USAGE"
      triggerProps={cardTrigger}
    >
      <ClaudeGaugeColumn
        gradientId="holoClaudeGaugeSession"
        label="SESSION"
        limit={usage?.session}
        notice={notice}
        refreshing={refreshing}
        windowSeconds={HUD_SESSION_WINDOW_SECONDS}
      />
      <ClaudeGaugeColumn
        gradientId="holoClaudeGaugeWeeklyAll"
        label="WEEKLY"
        limit={usage?.weeklyAll}
        notice={notice}
        refreshing={refreshing}
        windowSeconds={HUD_WEEKLY_WINDOW_SECONDS}
      />
      <ClaudeGaugeColumn
        gradientId="holoClaudeGaugeFable"
        label="FABLE"
        limit={usage?.weeklyFable}
        notice={notice}
        refreshing={refreshing}
        windowSeconds={HUD_WEEKLY_WINDOW_SECONDS}
      />
    </LeraCollapsibleHud>
  )
}

function ClaudeGaugeColumn({
  gradientId,
  label,
  limit,
  notice,
  refreshing,
  windowSeconds
}: {
  gradientId: string
  label: string
  limit: ClaudeUsageLimit | undefined
  /** Replaces the reset stamp while a sign-in is needed or running. */
  notice?: string
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
      {notice ? (
        <span className="hud-duo-reset">{notice}</span>
      ) : limit?.present ? (
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
