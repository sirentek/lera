import { useEffect, useState } from 'react'

/**
 * Polling glue for the Lera-only sidebar HUD cards (Firecrawl / Codex / Claude).
 *
 * Data comes from the lera-hud backend plugin (a user plugin in
 * HERMES_HOME/plugins/lera-hud, mounted by hermes' web server at
 * /api/plugins/lera-hud/*) via the existing generic `hermesDesktop.api`
 * IPC — so no upstream code carries this plumbing. The plugin holds its
 * own short TTL cache, which keeps these poll intervals honest even with
 * several windows open.
 */

export interface FirecrawlUsage {
  ok: boolean
  remainingCredits?: number | null
  planCredits?: number | null
  billingPeriodStart?: string | null
  billingPeriodEnd?: string | null
}

export interface CodexUsageWindow {
  usedPercent: number | null
  remainingPercent: number | null
  resetAt: string | null
  /** Window length in seconds (e.g. 18000 = 5h, 604800 = 7d), or null. */
  windowSeconds: number | null
  /** True when ChatGPT actually returned this window (vs an empty slot). */
  present: boolean
}

export interface CodexUsage {
  ok: boolean
  plan?: string | null
  /** Primary rate-limit window (5h on most plans; a 7-day window on some). */
  primary?: CodexUsageWindow
  /** Secondary window — null slot on plans that don't expose a second one. */
  secondary?: CodexUsageWindow
}

export interface ClaudeUsageLimit {
  /** Consumed share of this limit (0–100), or null when the row is absent. */
  usedPercent: number | null
  /** ISO reset timestamp for this window, or null. */
  resetAt: string | null
  /** True when the upstream returned this limit row (vs an empty slot). */
  present: boolean
}

export interface ClaudeUsage {
  ok: boolean
  /** Plan tag for the header badge ("Pro", "Max", …). */
  plan?: string | null
  /** Rolling session (5-hour) window. */
  session?: ClaudeUsageLimit
  /** Weekly cap across all models. */
  weeklyAll?: ClaudeUsageLimit
  /** Weekly cap scoped to the Fable model. */
  weeklyFable?: ClaudeUsageLimit
}

/**
 * Short label for a rate-limit window from its duration: "5H" for the ~5-hour
 * window, "WEEKLY" for the 7-day one, else a rounded hour/day count. Falls back
 * to `fallback` when the duration is unknown (ChatGPT omits it on empty slots).
 */
export function codexWindowLabel(seconds: number | null | undefined, fallback: string): string {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) {
    return fallback
  }

  const hours = Math.round(seconds / 3600)

  if (hours >= 24 * 6) {
    return 'WEEKLY'
  }

  if (hours >= 24) {
    return `${Math.round(hours / 24)}D LIMIT`
  }

  return `${hours}H LIMIT`
}

const REQUEST_TIMEOUT_MS = 30_000
const INITIAL_RETRY_MS = 5_000

/**
 * Poll a lera-hud plugin endpoint; keeps the last good payload across
 * transient failures (a HUD flashing to zero on one bad poll reads as an
 * outage). `enabled` gates the whole loop so non-holo skins never poll.
 *
 * `reloadToken` is a manual-refresh counter: bump it (CLAUDE card, on click)
 * to tear the timer down and poll immediately with `?force=1` — which makes
 * the plugin bypass its own TTL cache, so the numbers really move instead of
 * replaying the cached payload — then resume the normal cached cadence from
 * that moment. Omit it for cards that only ever poll on their interval.
 */
export function useLeraHudPoll<T extends { ok: boolean }>(
  path: string,
  intervalMs: number,
  enabled: boolean,
  reloadToken = 0
) {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    if (!enabled || !window.hermesDesktop?.api) {
      return
    }

    let disposed = false
    let hasSuccessfulPayload = false
    let timer: number | undefined
    // Only the first request of a manually-triggered run carries ?force=1,
    // which makes the plugin skip its TTL cache and actually re-fetch upstream.
    // Every scheduled poll after it goes back through the cache, so several
    // open windows still can't hammer the API.
    let force = reloadToken > 0

    const poll = async () => {
      const requestPath = force ? `${path}${path.includes('?') ? '&' : '?'}force=1` : path

      force = false

      try {
        const result = await window.hermesDesktop.api<T>({ path: requestPath, timeoutMs: REQUEST_TIMEOUT_MS })

        if (!disposed && result?.ok) {
          hasSuccessfulPayload = true
          setData(result)
        }
      } catch {
        // Keep showing the last snapshot; the next tick retries.
      }

      if (!disposed) {
        // The local backend and its user plugins can still be warming up when
        // the holo sidebar first mounts. Retry an initial failure promptly
        // instead of leaving all gauges at NO DATA for a full poll interval.
        // Once a payload has arrived, retain it and return to the normal,
        // upstream-friendly cadence across transient failures.
        timer = window.setTimeout(() => void poll(), hasSuccessfulPayload ? intervalMs : INITIAL_RETRY_MS)
      }
    }

    void poll()

    return () => {
      disposed = true

      if (timer !== undefined) {
        window.clearTimeout(timer)
      }
    }
  }, [path, intervalMs, enabled, reloadToken])

  return data
}

/** Rolling-window lengths shared by the HUD cards' elapsed-time gauges. */
export const HUD_SESSION_WINDOW_SECONDS = 5 * 60 * 60
export const HUD_WEEKLY_WINDOW_SECONDS = 7 * 24 * 60 * 60

/**
 * Share of a rolling rate-limit window already BEHIND now, as a 0–100
 * integer: (now − windowStart) / windowLength, where windowStart is
 * resetAt − windowLength. 0 right after a reset, 100 right at the next one —
 * e.g. weekly reset on the 16th, today the 14th → ~70. Read next to the
 * usage %, it shows pacing: time-share ahead of usage-share means headroom.
 * Null when the reset stamp is absent/invalid (renders as an em-dash).
 */
export function remainingWindowPercent(resetAt: string | null | undefined, windowSeconds: number): number | null {
  if (!resetAt || windowSeconds <= 0) {
    return null
  }

  const reset = new Date(resetAt).getTime()

  if (Number.isNaN(reset)) {
    return null
  }

  const fraction = 1 - (reset - Date.now()) / (windowSeconds * 1000)

  return Math.max(0, Math.min(100, Math.round(fraction * 100)))
}

/**
 * Elapsed share of a billing period with EXPLICIT start and end stamps, as a
 * 0–100 integer: (now − start) / (end − start). Preferred over
 * remainingWindowPercent when both edges are known (Firecrawl reports both),
 * since it uses the real period length instead of assuming a fixed window —
 * e.g. a 12 Jul → 12 Aug period on 15 Jul → ~10, not the ~5 a fixed 30-day
 * window rounded to. Null when either stamp is absent/invalid or the period
 * has zero/negative length.
 */
export function elapsedPeriodPercent(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) {
    return null
  }

  const startMs = new Date(start).getTime()
  const endMs = new Date(end).getTime()

  if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
    return null
  }

  const fraction = (Date.now() - startMs) / (endMs - startMs)

  return Math.max(0, Math.min(100, Math.round(fraction * 100)))
}

/** 0–100 integer for the gauge ring, or null when the value is unknown. */
export function gaugePercent(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null
  }

  return Math.max(0, Math.min(100, Math.round(value)))
}

const HUD_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** Local "JUL 07" (uppercase month + zero-padded day) for a Date. */
function hudDatePart(date: Date): string {
  const month = HUD_MONTHS[date.getMonth()]
  const day = String(date.getDate()).padStart(2, '0')

  return `${month} ${day}`
}

/** Zero-padded local 24-hour "HH:MM" for a Date. */
function hudTimePart(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')

  return `${hours}:${minutes}`
}

/** "JUL 16" from an ISO timestamp, or em-dash when absent. */
export function formatHudDate(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return hudDatePart(date)
}

export interface HudResetParts {
  /** Full "JUL 16 16:33" stamp, or em-dash when the timestamp is absent. */
  stamp: string
}

/**
 * Reset stamp for the CLAUDE card as a single "JUL 16 16:33" line, shown on its
 * own row below the "RESETS" label. Returned in a struct (rather than a bare
 * string) so callers stay stable if the card wants more parts again later.
 */
export function hudResetParts(iso: string | null | undefined): HudResetParts {
  if (!iso) {
    return { stamp: '—' }
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return { stamp: '—' }
  }

  return { stamp: `${hudDatePart(date)} ${hudTimePart(date)}` }
}
