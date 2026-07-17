// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import { type FirecrawlUsage, elapsedPeriodPercent, formatHudDate, gaugePercent, useLeraHudPoll } from './lera-hud-data'
import { LeraHudGauge } from './lera-hud-gauge'

// Credits only move when a scrape actually runs, so a 10-minute poll is
// plenty. The backend plugin caches for ~9 minutes on top.
const POLL_INTERVAL_MS = 10 * 60 * 1000

/**
 * Holo-skin Firecrawl credit gauge, docked between the file tree and the
 * CODEX/CONTEXT cards: ring = share of the monthly credit allotment that has
 * been CONSUMED (not remaining), rows = remaining / plan / billing period.
 * Live data from Firecrawl's credit-usage API via the lera-hud backend plugin.
 */
export function FirecrawlHud() {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const usage = useLeraHudPoll<FirecrawlUsage>('/api/plugins/lera-hud/firecrawl', POLL_INTERVAL_MS, isHolo)

  if (!isHolo) {
    return null
  }

  const remaining = usage?.remainingCredits ?? null
  const plan = usage?.planCredits ?? null

  // Consumed share of the monthly allotment (used = plan − remaining). Rollover
  // /bonus credits can push the balance above the plan, making used negative —
  // gaugePercent clamps that back to a floor of 0%.
  const pct =
    remaining !== null && plan !== null && plan > 0
      ? gaugePercent(((plan - remaining) / plan) * 100)
      : null

  // Elapsed share of the billing period, from its real start/end stamps (not a
  // fixed 30-day assumption — months vary, and Firecrawl gives us both edges),
  // shown as the second figure and the ring's triangle marker. Null until both
  // stamps exist.
  const remainingPct = elapsedPeriodPercent(usage?.billingPeriodStart, usage?.billingPeriodEnd)

  return (
    <section aria-label="Firecrawl credits" data-hud="firecrawl" data-slot="lera-hud">
      <header>
        <span>FIRECRAWL</span>
        <small>USED</small>
      </header>
      <div className="hud-row">
        <LeraHudGauge gradientId="holoFirecrawlGaugeGrad" pct={pct} remainingPct={remainingPct} />
        <div className="hud-kvs">
          <div>
            <span>REMAINING</span>
            <b>{remaining === null ? '—' : remaining.toLocaleString('en-US')}</b>
          </div>
          <div>
            <span>PLAN</span>
            <b>{plan === null ? '—' : `${plan.toLocaleString('en-US')}/MO`}</b>
          </div>
          <div>
            <span>PERIOD START</span>
            <b>{formatHudDate(usage?.billingPeriodStart)}</b>
          </div>
          <div>
            <span>PERIOD END</span>
            <b>{formatHudDate(usage?.billingPeriodEnd)}</b>
          </div>
        </div>
      </div>
    </section>
  )
}
