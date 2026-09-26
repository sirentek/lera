import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { LeraSessionPanel } from './lera-session-panel'

const theme = vi.hoisted(() => ({ themeName: 'holo' }))
vi.mock('@/themes/context', () => ({ useTheme: () => theme }))

afterEach(() => {
  cleanup()
  theme.themeName = 'holo'
})

describe('Sessions panel visibility', () => {
  it('restores the same panel, search value, scroll position and keyboard focus', () => {
    render(
      <LeraSessionPanel>
        <input aria-label="Search sessions" />
        <div data-testid="session-list">Sessions</div>
      </LeraSessionPanel>
    )
    const input = screen.getByRole('textbox', { name: 'Search sessions' })
    const list = screen.getByTestId('session-list')
    const collapse = screen.getByRole('button', { name: 'Collapse Sessions' })
    const panel = window.document.getElementById(collapse.getAttribute('aria-controls')!)!
    fireEvent.change(input, { target: { value: 'my session' } })
    list.scrollTop = 120
    fireEvent.click(collapse)

    const restore = screen.getByRole('button', { name: 'Expand Sessions' })
    expect(panel.hidden).toBe(true)
    expect(screen.queryByRole('textbox', { name: 'Search sessions' })).toBeNull()
    expect(window.document.activeElement).toBe(restore)
    fireEvent.click(restore)

    expect(panel.hidden).toBe(false)
    expect(screen.getByRole('textbox', { name: 'Search sessions' })).toBe(input)
    expect((input as HTMLInputElement).value).toBe('my session')
    expect(list.scrollTop).toBe(120)
    expect(window.document.activeElement).toBe(screen.getByRole('button', { name: 'Collapse Sessions' }))
  })

  it('shows the panel without holo controls on other themes', () => {
    theme.themeName = 'nous'
    render(
      <LeraSessionPanel>
        <input aria-label="Search sessions" />
      </LeraSessionPanel>
    )
    expect(screen.getByRole('textbox', { name: 'Search sessions' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Collapse Sessions' })).toBeNull()
  })
})
