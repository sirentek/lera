// r=36 in an 84-unit viewBox → circumference the dashoffset animates against
// (same gauge geometry as the CONTEXT LOAD card).
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 36

/**
 * Ring gauge shared by the Lera HUD cards (styles in lera-hud.css). `pct`
 * is 0–100 or null while the first poll is in flight — null renders an
 * em-dash and an empty ring. `gradientId` must be document-unique since
 * SVG gradients resolve by global id.
 *
 * `remainingPct` (CLAUDE card) is the share of the rate-limit window still
 * ahead of now: when passed (even as null) the center stacks the usage %
 * over the remaining %, and a small glowing triangle marks the remaining
 * value on the ring, sweeping the same clockwise-from-top direction as the
 * usage arc. Omit it entirely to keep the single-value layout (CODEX etc.).
 *
 * The `.hud-scan` group is the refresh sweep: inert (opacity 0, no animation)
 * until an ancestor card carries `data-refreshing='true'`, which is what the
 * CLAUDE card sets while a manual re-poll is in flight. It ships on every
 * gauge so the markup stays one shape; cards that never set the attribute
 * never pay for it.
 */
export function LeraHudGauge({
  gradientId,
  pct,
  remainingPct
}: {
  gradientId: string
  pct: number | null
  remainingPct?: number | null
}) {
  const fill = pct ?? 0
  const hasRemainingSlot = remainingPct !== undefined

  return (
    <div className="hud-gauge">
      <svg viewBox="0 0 84 84">
        <defs>
          <linearGradient id={gradientId} x1="0" x2="1" y1="0" y2="1">
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
          stroke={`url(#${gradientId})`}
          strokeDasharray={GAUGE_CIRCUMFERENCE}
          strokeDashoffset={GAUGE_CIRCUMFERENCE * (1 - fill / 100)}
          strokeWidth="5"
        />
        {typeof remainingPct === 'number' ? (
          // Marker angle rides the same clockwise-from-top sweep as the dash
          // (the svg's CSS rotate(-90deg) moves 0° from 3 o'clock to 12), so
          // the triangle sits where the remaining arc would end. It points
          // inward, straddling the ring: base at the viewBox edge, tip past
          // the ring's inner edge, so the svg needs overflow visible for the
          // glow at the base.
          <polygon
            className="hud-remaining-marker"
            points="74.4,42 83.6,36.8 83.6,47.2"
            transform={`rotate(${(remainingPct / 100) * 360} 42 42)`}
          />
        ) : null}
        {/* Refresh sweep: a long arc spinning with the ring, a shorter one
            counter-spinning inside it, a dashed tick ring, and a radar ping
            expanding from the center. All four are driven purely by the
            card's data-refreshing state in lera-hud.css. */}
        <g aria-hidden="true" className="hud-scan">
          <circle
            className="hud-scan-arc"
            cx="42"
            cy="42"
            fill="none"
            r="36"
            strokeDasharray="56 170"
            strokeLinecap="round"
            strokeWidth="2.5"
          />
          <circle
            className="hud-scan-arc hud-scan-arc-inner"
            cx="42"
            cy="42"
            fill="none"
            r="27"
            strokeDasharray="30 140"
            strokeLinecap="round"
            strokeWidth="1.5"
          />
          <circle
            className="hud-scan-ticks"
            cx="42"
            cy="42"
            fill="none"
            r="19"
            strokeDasharray="2.5 7.45"
            strokeWidth="1"
          />
          <circle className="hud-scan-ping" cx="42" cy="42" fill="none" r="36" strokeWidth="1" />
        </g>
      </svg>
      {hasRemainingSlot ? (
        <div className="hud-pct hud-pct-stack">
          {/* Usage running AHEAD of the window's elapsed time-share is the
              burn-too-fast signal — flag the usage figure in alarm red. */}
          <span
            className={
              typeof remainingPct === 'number' && fill > remainingPct ? 'hud-pct-used hud-pct-over' : 'hud-pct-used'
            }
          >
            {pct ?? '—'}
            {pct === null ? null : <small>%</small>}
          </span>
          <span className="hud-pct-remaining">
            {remainingPct ?? '—'}
            {remainingPct === null ? null : <small>%</small>}
          </span>
        </div>
      ) : (
        <div className="hud-pct">
          {pct ?? '—'}
          {pct === null ? null : <small>%</small>}
        </div>
      )}
    </div>
  )
}
