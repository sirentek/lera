import { useEffect, useState } from 'react'

/**
 * Polling glue for the Lera-only sidebar HUD cards (Firecrawl / Codex).
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

/**
 * Poll a lera-hud plugin endpoint; keeps the last good payload across
 * transient failures (a HUD flashing to zero on one bad poll reads as an
 * outage). `enabled` gates the whole loop so non-holo skins never poll.
 */
export function useLeraHudPoll<T extends { ok: boolean }>(path: string, intervalMs: number, enabled: boolean) {
  const [data, setData] = useState<T | null>(null)

  useEffect(() => {
    if (!enabled || !window.hermesDesktop?.api) {
      return
    }

    let disposed = false

    const poll = async () => {
      try {
        const result = await window.hermesDesktop.api<T>({ path, timeoutMs: REQUEST_TIMEOUT_MS })

        if (!disposed && result?.ok) {
          setData(result)
        }
      } catch {
        // Keep showing the last snapshot; the next tick retries.
      }
    }

    void poll()
    const timer = window.setInterval(() => void poll(), intervalMs)

    return () => {
      disposed = true
      window.clearInterval(timer)
    }
  }, [path, intervalMs, enabled])

  return data
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

/** Reset stamp in local time as "JUL 16 16:33", or em-dash when absent. */
export function formatHudReset(iso: string | null | undefined): string {
  if (!iso) {
    return '—'
  }

  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return `${hudDatePart(date)} ${hudTimePart(date)}`
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
