import { atom } from 'nanostores'

import type { DesktopBaseVersionStatus } from '@/global'
import { persistString, storedString } from '@/lib/storage'

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000
const CACHE_KEY = 'lera:base-version-status'

export const $leraBaseVersionStatus = atom<DesktopBaseVersionStatus | null>(readCachedStatus())

let timer: ReturnType<typeof setTimeout> | null = null
let running = false

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

// A cached verdict only describes the version pair it names. Merging upstream —
// the very thing the alert asks for — moves `currentVersion` out from under it,
// so a record from the old fork version would keep the statusbar blinking for up
// to a full day after the update landed. Void it as soon as the versions differ.
async function dropCacheIfVersionMoved(): Promise<void> {
  const cached = $leraBaseVersionStatus.get()

  if (!cached) {
    return
  }

  try {
    const live = (await window.hermesDesktop?.getVersion?.())?.appVersion

    if (live && live !== cached.currentVersion) {
      $leraBaseVersionStatus.set(null)
      persistString(CACHE_KEY, null)
    }
  } catch {
    // No live version to disagree with the cache: leave the cache alone.
  }
}

export function startLeraBaseVersionPoller(): void {
  running = true

  // The version probe is async, so a stop() can land first — don't arm a timer
  // the caller has already cancelled.
  void dropCacheIfVersionMoved().then(() => {
    if (!running) {
      return
    }

    const lastCheckedAt = $leraBaseVersionStatus.get()?.checkedAt ?? 0
    const age = Date.now() - lastCheckedAt

    schedule(age >= CHECK_INTERVAL_MS ? 0 : CHECK_INTERVAL_MS - age)
  })
}

export function stopLeraBaseVersionPoller(): void {
  running = false

  if (timer !== null) {
    clearTimeout(timer)
    timer = null
  }
}
