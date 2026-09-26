import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesApiRequest } from '@/global'

import { CodexHud } from './codex-hud'
import type { CodexUsage } from './lera-hud-data'

vi.mock('@/themes/context', () => ({ useTheme: () => ({ themeName: 'holo' }) }))

const api = vi.fn<(request: HermesApiRequest) => Promise<CodexUsage>>()

describe('Codex HUD visibility', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    api.mockReset().mockResolvedValue({ ok: true, plan: 'Plus' })
    ;(window as unknown as { hermesDesktop: { api: typeof api } }).hermesDesktop = { api }
  })

  afterEach(() => {
    cleanup()
    vi.useRealTimers()
    delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
  })

  it('hides and restores the mounted card without triggering refresh or losing keyboard focus', async () => {
    render(<CodexHud />)
    await act(async () => {})
    const panel = screen.getByRole('region', { name: 'Codex usage limits' })
    const collapse = screen.getByRole('button', { name: 'Collapse CODEX ANALYTICS' })
    act(() => collapse.focus())
    fireEvent.click(collapse)

    expect(panel.hidden).toBe(true)
    const restore = screen.getByRole('button', { name: 'Expand CODEX ANALYTICS' })
    expect(window.document.activeElement).toBe(restore)
    expect(api).toHaveBeenCalledTimes(1)

    fireEvent.click(restore)
    expect(screen.getByRole('region', { name: 'Codex usage limits' })).toBe(panel)
    expect(panel.hidden).toBe(false)
    expect(window.document.activeElement).toBe(collapse)
    expect(api).toHaveBeenCalledTimes(1)

    fireEvent.keyDown(screen.getByRole('button', { name: /activate to refresh/ }), { key: 'Enter' })
    await act(async () => {})
    expect(api).toHaveBeenCalledTimes(2)
  })
})
