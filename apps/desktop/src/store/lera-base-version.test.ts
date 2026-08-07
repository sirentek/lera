import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const CACHE_KEY = 'lera:base-version-status'
const desktopWindow = window as unknown as { hermesDesktop?: Window['hermesDesktop'] }
const initialHermesDesktop = desktopWindow.hermesDesktop

const getVersion = vi.fn()
const checkBaseVersion = vi.fn()

/** The store snapshots the cache at import time, so each case needs a fresh module. */
async function loadStore(cached: unknown, appVersion: string) {
  window.localStorage.setItem(CACHE_KEY, JSON.stringify(cached))
  getVersion.mockResolvedValue({ appVersion })
  vi.resetModules()

  return import('./lera-base-version')
}

beforeEach(() => {
  window.localStorage.clear()
  getVersion.mockReset()
  checkBaseVersion.mockReset()
  checkBaseVersion.mockResolvedValue({
    baseVersion: '0.20.0',
    checkedAt: Date.now(),
    currentVersion: '0.20.0',
    remote: 'upstream',
    updateAvailable: false
  })
  desktopWindow.hermesDesktop = {
    getVersion,
    updates: { checkBaseVersion }
  } as unknown as Window['hermesDesktop']
})

afterEach(() => {
  desktopWindow.hermesDesktop = initialHermesDesktop
  window.localStorage.clear()
})

describe('lera base-version store', () => {
  it('drops a cached alert once the fork itself has moved on', async () => {
    const store = await loadStore(
      {
        baseVersion: '0.20.0',
        checkedAt: Date.now(),
        currentVersion: '0.19.0',
        remote: 'upstream',
        updateAvailable: true
      },
      '0.20.0'
    )

    expect(store.$leraBaseVersionStatus.get()?.updateAvailable).toBe(true)

    store.startLeraBaseVersionPoller()

    // The stale verdict goes immediately, then a fresh check replaces it.
    await vi.waitFor(() => expect(checkBaseVersion).toHaveBeenCalledTimes(1))
    await vi.waitFor(() => expect(store.$leraBaseVersionStatus.get()?.updateAvailable).toBe(false))
    store.stopLeraBaseVersionPoller()
  })

  it('keeps a fresh cached verdict and does not re-check within the interval', async () => {
    const store = await loadStore(
      {
        baseVersion: '0.21.0',
        checkedAt: Date.now(),
        currentVersion: '0.20.0',
        remote: 'upstream',
        updateAvailable: true
      },
      '0.20.0'
    )

    store.startLeraBaseVersionPoller()

    await vi.waitFor(() => expect(getVersion).toHaveBeenCalled())
    await new Promise(resolve => setTimeout(resolve, 20))

    expect(checkBaseVersion).not.toHaveBeenCalled()
    expect(store.$leraBaseVersionStatus.get()?.updateAvailable).toBe(true)
    store.stopLeraBaseVersionPoller()
  })
})
