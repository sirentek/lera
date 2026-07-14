// r=36 in an 84-unit viewBox → circumference the dashoffset animates against
// (same gauge geometry as the CONTEXT LOAD card).
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * 36

/**
 * Ring gauge shared by the Lera HUD cards (styles in lera-hud.css). `pct`
 * is 0–100 or null while the first poll is in flight — null renders an
 * em-dash and an empty ring. `gradientId` must be document-unique since
 * SVG gradients resolve by global id.
 */
export function LeraHudGauge({ gradientId, pct }: { gradientId: string; pct: number | null }) {
  const fill = pct ?? 0

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
      </svg>
      <div className="hud-pct">
        {pct ?? '—'}
        {pct === null ? null : <small>%</small>}
      </div>
    </div>
  )
}
