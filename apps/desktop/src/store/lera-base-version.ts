import { atom } from 'nanostores'

import type { DesktopBaseVersionStatus } from '@/global'
import { persistString, storedString } from '@/lib/storage'

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const CACHE_KEY = 'lera:base-version-status'

export const $leraBaseVersionStatus = atom<DesktopBaseVersionStatus | null>(readCachedStatus())

let timer: ReturnType<typeof setTimeout> | null = null

function readCachedStatus(): DesktopBaseVersionStatus | null {
  try {
    const cached = JSON.parse(storedString(CACHE_KEY) || 'null') as DesktopBaseVersionStatus | null

    return cached?.checkedAt ? cached : null
  } catch {
    return null
  }
}

async function checkBaseVersion(): Promise<void> {
  try {
    const status = await window.hermesDesktop?.updates.checkBaseVersion?.()

    if (status) {
      $leraBaseVersionStatus.set(status)
      persistString(CACHE_KEY, JSON.stringify(status))
    }
  } catch {
    // Keep the last successful result. A transient fetch failure must not
    // clear an already-known base update or create an unhandled timer error.
  } finally {
    schedule(CHECK_INTERVAL_MS)
  }
}

function schedule(delay: number): void {
  if (timer !== null) {
    clearTimeout(timer)
  }

  timer = setTimeout(() => void checkBaseVersion(), Math.max(0, delay))
}

export function startLeraBaseVersionPoller(): void {
  const lastCheckedAt = $leraBaseVersionStatus.get()?.checkedAt ?? 0
  const age = Date.now() - lastCheckedAt

  schedule(age >= CHECK_INTERVAL_MS ? 0 : CHECK_INTERVAL_MS - age)
}

export function stopLeraBaseVersionPoller(): void {
  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}
