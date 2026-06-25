import { useStore } from '@nanostores/react'

import { useI18n } from '@/i18n'
import { LiveDuration, usageContextLabel } from '@/lib/statusbar'
import { $currentUsage, $sessionStartedAt } from '@/store/session'
import { useTheme } from '@/themes/context'

// r=36 in an 84-unit viewBox → circumference the dashoffset animates against.
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 36

/**
 * Holo-skin context gauge docked under the file tree: ring = context window
 * fill, rows = tokens / session clock / cost. The statusbar already carries
 * the same numbers as plain text for every other skin, so this renders only
 * on the holo HUD where it belongs visually (styles live in styles/holo.css).
 */
export function ContextHud() {
  const { themeName } = useTheme()
  const { t } = useI18n()
  const usage = useStore($currentUsage)
  const sessionStartedAt = useStore($sessionStartedAt)

  if (themeName !== 'holo') {
    return null
  }

  const pct = Math.max(0, Math.min(100, Math.round(usage.context_percent ?? 0)))
  const tokens = usageContextLabel(usage)
  const cost = usage.cost_usd ? `$${usage.cost_usd.toFixed(3)}` : '—'

  return (
    <section aria-label={t.shell.statusbar.contextUsage} data-slot="context-hud">
      <header>
        <span>CONTEXT LOAD</span>
      </header>
      <div className="hud-row">
        <div className="hud-gauge">
          <svg viewBox="0 0 84 84">
            <defs>
              <linearGradient id="holoHudGaugeGrad" x1="0" x2="1" y1="0" y2="1">
                <stop offset="0" stopColor="#ffd9cf" />
                <stop offset="1" stopColor="#e8472f" />
              </linearGradient>
            </defs>
            <circle className="hud-track" cx="42" cy="42" fill="none" r="36" strokeWidth="5" />
            <circle
              className="hud-val"
              cx="42"
              cy="42"
              fill="none"
              r="36"
              strokeDasharray={GAUGE_CIRCUMFERENCE}
              strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - pct / 100)}
              strokeWidth="5"
            />
          </svg>
          <div className="hud-pct">
            {pct}
            <small>%</small>
          </div>
        </div>
        <div className="hud-kvs">
          <div>
            <span>TOKENS</span>
            <b>{tokens || '0'}</b>
          </div>
          <div>
            <span>SESSION</span>
            <b>{sessionStartedAt ? <LiveDuration since={sessionStartedAt} /> : '—'}</b>
          </div>
          <div>
            <span>COST</span>
            <b>{cost}</b>
          </div>
        </div>
      </div>
    </section>
  )
}
