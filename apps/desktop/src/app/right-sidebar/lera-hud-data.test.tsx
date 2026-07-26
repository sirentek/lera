import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesApiRequest } from '@/global'

import { useLeraHudPoll } from './lera-hud-data'

interface TestUsage {
  ok: boolean
  value?: number
}

const api = vi.fn<(request: HermesApiRequest) => Promise<TestUsage>>()

describe('useLeraHudPoll', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    ;(window as unknown as { hermesDesktop: { api: typeof api } }).hermesDesktop = { api }
    api.mockReset()
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
  })

  it('retries initial unavailable data promptly', async () => {
    api.mockResolvedValueOnce({ ok: false }).mockResolvedValueOnce({ ok: true, value: 42 })

    const { result } = renderHook(() => useLeraHudPoll<TestUsage>('/usage', 300_000, true))

    await act(async () => {})
    expect(api).toHaveBeenCalledTimes(1)
    expect(result.current).toBeNull()

    await act(() => vi.advanceTimersByTimeAsync(5_000))

    expect(api).toHaveBeenCalledTimes(2)
    expect(result.current).toEqual({ ok: true, value: 42 })
  })

  it('uses the normal interval after the first successful payload', async () => {
    api.mockResolvedValue({ ok: true, value: 19 })

    const { result } = renderHook(() => useLeraHudPoll<TestUsage>('/usage', 300_000, true))

    await act(async () => {})
    expect(result.current).toEqual({ ok: true, value: 19 })

    await act(() => vi.advanceTimersByTimeAsync(5_000))
    expect(api).toHaveBeenCalledTimes(1)

    await act(() => vi.advanceTimersByTimeAsync(295_000))
    expect(api).toHaveBeenCalledTimes(2)
  })
})
