/**
 * LERA FORK — the animated holo mark a bot's empty chat is headed with.
 *
 * Upstream heads that splash with `BotFace`: a filled blob body with two dot
 * eyes, generated from the bot's name. It reads as a toy beside the holo
 * shell's instrument panels, so on the `holo` skin this replaces it with the
 * same vocabulary the HUD cards and the window frame already speak — coral
 * line work, a reactor core, a chamfered ring.
 *
 * Rendered UNCONDITIONALLY and swapped in CSS (see holo.css): the plugin has
 * no theme context of its own, and a `display` swap keeps the one edit to
 * upstream's `chat-empty.tsx` down to a single element.
 *
 * Motion lives entirely in holo.css so it can be disarmed from one place —
 * `prefers-reduced-motion` and the shell's `data-renderer-animations-paused`
 * (set while the window is hidden) both stop it. Every animated property is
 * `transform` or `opacity`, so the whole mark composites on the GPU and costs
 * no per-frame style or layout work. That matters here: the fork deliberately
 * strips upstream's perpetual CSS animations, and this one is only worth its
 * keep because it cannot touch the main thread.
 */

/** The ring's dash pattern — long arcs with hairline gaps, so the rotation
 *  reads as a machined bezel rather than a marching-ants dashed circle. */
const OUTER_DASH = '30 9 16 9 30 9 16 9'
const INNER_DASH = '22 14 8 14'

export function LeraBotSigil({ size = 96 }: { size?: number }) {
  return (
    <svg
      aria-hidden="true"
      className="lera-bot-sigil"
      fill="none"
      height={size}
      viewBox="0 0 100 100"
      width={size}
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        {/* The core's falloff: hot centre, coral body, gone by the rim — the
            same ramp the intro reactor paints on its canvas. */}
        <radialGradient id="lera-sigil-core">
          <stop offset="0%" stopColor="rgba(255,217,207,0.95)" />
          <stop offset="45%" stopColor="rgba(255,122,111,0.55)" />
          <stop offset="100%" stopColor="rgba(255,81,68,0)" />
        </radialGradient>
        {/* Clips the scan sweep to the bezel so it reads as light travelling
            INSIDE the instrument, not a band crossing the page. */}
        <clipPath id="lera-sigil-clip">
          <circle cx="50" cy="50" r="46" />
        </clipPath>
      </defs>

      {/* Static chamfered bezel — the corner notch the whole holo shell uses. */}
      <path
        className="lera-bot-sigil__bezel"
        d="M50 5 A45 45 0 0 1 95 50 A45 45 0 0 1 50 95 A45 45 0 0 1 5 50 A45 45 0 0 1 50 5 Z"
      />

      <g clipPath="url(#lera-sigil-clip)">
        <rect className="lera-bot-sigil__scan" height="10" width="100" x="0" y="-10" />
      </g>

      {/* Counter-rotating rings. */}
      <circle className="lera-bot-sigil__ring" cx="50" cy="50" r="40" strokeDasharray={OUTER_DASH} />
      <circle
        className="lera-bot-sigil__ring lera-bot-sigil__ring--inner"
        cx="50"
        cy="50"
        r="29"
        strokeDasharray={INNER_DASH}
      />

      {/* Cardinal ticks — the instrument's fixed reference marks. */}
      <g className="lera-bot-sigil__ticks">
        <path d="M50 8 V15" />
        <path d="M92 50 H85" />
        <path d="M50 92 V85" />
        <path d="M8 50 H15" />
      </g>

      {/* Breathing reactor core. */}
      <circle className="lera-bot-sigil__core" cx="50" cy="50" fill="url(#lera-sigil-core)" r="17" />
      <circle className="lera-bot-sigil__pupil" cx="50" cy="50" r="4.5" />

      {/* One orbiting spark, on the outer track. */}
      <g className="lera-bot-sigil__orbit">
        <circle cx="50" cy="10" r="2.4" />
      </g>
    </svg>
  )
}
