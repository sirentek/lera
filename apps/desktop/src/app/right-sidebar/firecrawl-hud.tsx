// Lera-only card: styles are deliberately co-located in lera-hud.css
// (imported here, NOT added to upstream styles/holo.css) so Hermes updates
// never conflict with this panel. See holo-room-background.css for the same
// keep-out-of-upstream pattern.
import './lera-hud.css'

import { useTheme } from '@/themes/context'

import { elapsedPeriodPercent, type FirecrawlUsage, formatHudDate, gaugePercent, useLeraHudPoll } from './lera-hud-data'
import { LeraHudGauge } from './lera-hud-gauge'
import { useHudManualRefresh, useScrambledText } from './lera-hud-refresh'

// Credits only move when a scrape actually runs, so a 10-minute poll is
// plenty. The backend plugin caches for ~9 minutes on top.
const POLL_INTERVAL_MS = 10 * 60 * 1000

/**
 * Holo-skin Firecrawl credit gauge, docked between the file tree and the
 * CODEX/CONTEXT cards: ring = share of the monthly credit allotment that has
 * been CONSUMED (not remaining), rows = remaining / plan / billing period.
 * Live data from Firecrawl's credit-usage API via the lera-hud backend plugin.
 *
 * Clicking (or Enter/Space on) the card runs the same refresh sweep the CLAUDE
 * and CODEX cards do — cache-bypassing re-poll, spinning scan arcs in the ring,
 * REFRESHING.. in the header — except the scramble lands on the four credit
 * rows instead of gauge-column labels. See lera-hud-refresh.ts.
 */
export function FirecrawlHud() {
  const { themeName } = useTheme()
  const isHolo = themeName === 'holo'
  const { refreshing, reloadToken, triggerProps } = useHudManualRefresh()
  const usage = useLeraHudPoll<FirecrawlUsage>('/api/plugins/lera-hud/firecrawl', POLL_INTERVAL_MS, isHolo, reloadToken)

  if (!isHolo) {
    return null
  }

  const remaining = usage?.remainingCredits ?? null
  const plan = usage?.planCredits ?? null

  // Consumed share of the monthly allotment (used = plan − remaining). Rollover
  // /bonus credits can push the balance above the plan, making used negative —
  // gaugePercent clamps that back to a floor of 0%.
  const pct = remaining !== null && plan !== null && plan > 0 ? gaugePercent(((plan - remaining) / plan) * 100) : null

  // Elapsed share of the billing period, from its real start/end stamps (not a
  // fixed 30-day assumption — months vary, and Firecrawl gives us both edges),
  // shown as the second figure and the ring's triangle marker. Null until both
  // stamps exist.
  const remainingPct = elapsedPeriodPercent(usage?.billingPeriodStart, usage?.billingPeriodEnd)

  return (
    <section
      {...triggerProps}
      aria-label="Firecrawl credits — activate to refresh"
      data-hud="firecrawl"
      data-slot="lera-hud"
    >
      <header>
        <span>FIRECRAWL</span>
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
          <small>USED</small>
        )}
      </header>
      <div className="hud-row">
        <LeraHudGauge gradientId="holoFirecrawlGaugeGrad" pct={pct} remainingPct={remainingPct} />
        <div className="hud-kvs">
          <FirecrawlRow
            label="REMAINING"
            refreshing={refreshing}
            value={remaining === null ? '—' : remaining.toLocaleString('en-US')}
          />
          <FirecrawlRow
            label="PLAN"
            refreshing={refreshing}
            value={plan === null ? '—' : `${plan.toLocaleString('en-US')}/MO`}
          />
          <FirecrawlRow label="PERIOD START" refreshing={refreshing} value={formatHudDate(usage?.billingPeriodStart)} />
          <FirecrawlRow label="PERIOD END" refreshing={refreshing} value={formatHudDate(usage?.billingPeriodEnd)} />
        </div>
      </div>
    </section>
  )
}

/**
 * One credit row. A component (rather than four inline hook calls) so the
 * scramble hook has somewhere to live per row — the values are the readouts
 * that churn while the card refreshes; the labels stay legible and only
 * flicker, which is what keeps the row identifiable mid-sweep.
 */
function FirecrawlRow({ label, refreshing, value }: { label: string; refreshing: boolean; value: string }) {
  const display = useScrambledText(value, refreshing)

  return (
    <div>
      <span>{label}</span>
      <b>{display}</b>
    </div>
  )
}
