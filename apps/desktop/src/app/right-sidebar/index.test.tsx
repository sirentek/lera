import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { HermesReadDirResult } from '@/global'
import { $panesFlipped } from '@/store/layout'
import { $projectDialog, closeProjectDialog } from '@/store/projects'
import { $connection, $selectedStoredSessionId, $workspaceCwdOwner, setCurrentCwd } from '@/store/session'

import { resetProjectTreeState } from './files/use-project-tree'

import { RightSidebarPane } from './index'

const readDir = vi.fn<(path: string) => Promise<HermesReadDirResult>>()
const api = vi.fn().mockResolvedValue({ ok: true, remainingCredits: 700, planCredits: 1000 })
const theme = vi.hoisted(() => ({ themeName: 'nous' }))
vi.mock('@/themes/context', () => ({ useTheme: () => theme }))

function installBridge() {
  ;(window as unknown as { hermesDesktop: { readDir: typeof readDir; api: typeof api } }).hermesDesktop = {
    readDir,
    api
  }
}

describe('RightSidebarPane', () => {
  beforeEach(() => {
    $connection.set(null)
    $selectedStoredSessionId.set(null)
    $workspaceCwdOwner.set(null)
    resetProjectTreeState()
    readDir.mockReset()
    api.mockClear()
    readDir.mockResolvedValue({ entries: [{ isDirectory: false, name: 'README.md', path: '/repo/README.md' }] })
    installBridge()
  })

  afterEach(() => {
    cleanup()
    theme.themeName = 'nous'
    $connection.set(null)
    $selectedStoredSessionId.set(null)
    $workspaceCwdOwner.set(null)
    setCurrentCwd('')
    resetProjectTreeState()
    closeProjectDialog()
    delete (window as unknown as { hermesDesktop?: unknown }).hermesDesktop
  })

  it('renders the tree whenever the session has a working dir (repo or not) — no picker', async () => {
    setCurrentCwd('/repo')

    render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)

    const refresh = await screen.findByRole('button', { name: 'Refresh tree' })

    readDir.mockClear()
    fireEvent.click(refresh)
    await waitFor(() => expect(readDir).toHaveBeenCalledWith('/repo'))

    // The freeform folder picker is retired.
    expect(screen.queryByRole('button', { name: 'Open folder' })).toBeNull()
  })

  it('does not read a retained cwd while it belongs to a previous session', async () => {
    $selectedStoredSessionId.set('new-session')
    $workspaceCwdOwner.set('previous-session')
    setCurrentCwd('/home/doug/default-profile-workspace')

    render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Refresh tree' })).toBeNull())
    expect(readDir).not.toHaveBeenCalled()
  })

  it('shows no tree for a detached chat (no working dir)', async () => {
    setCurrentCwd('')

    render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)

    await waitFor(() => expect(screen.queryByRole('button', { name: 'Refresh tree' })).toBeNull())
    expect(readDir).not.toHaveBeenCalled()
  })

  it('opens project creation from the detached-chat empty state', async () => {
    setCurrentCwd('')

    render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'New Project' }))

    await waitFor(() => expect($projectDialog.get()).toEqual({ mode: 'create' }))
  })

  it('exposes the right-sidebar slot used by theme frame selectors', () => {
    setCurrentCwd('/repo')

    const { container } = render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)

    expect(container.querySelector('aside')?.getAttribute('data-slot')).toBe('right-sidebar')
  })

  it('independently hides and restores all four holo panels while retaining the file tree and data', async () => {
    theme.themeName = 'holo'
    setCurrentCwd('/repo')
    const { container } = render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)

    const tree = await waitFor(() => {
      const element = container.querySelector('[data-project-tree]')
      expect(element).toBeTruthy()

      return element!
    })

    await waitFor(() => expect(screen.getByText('700')).toBeTruthy())
    const titles = ['File system', 'FIRECRAWL', 'CONTEXT LOAD', 'MODEL']

    const panels = titles.map(title => {
      const button = screen.getByRole('button', { name: `Collapse ${title}` })

      return window.document.getElementById(button.getAttribute('aria-controls')!)!
    })

    readDir.mockClear()
    api.mockClear()

    for (const [index, title] of titles.entries()) {
      fireEvent.click(screen.getByRole('button', { name: `Collapse ${title}` }))
      expect(index === 0 ? panels[index].getAttribute('aria-hidden') === 'true' : panels[index].hidden).toBe(true)

      for (const other of panels.slice(index + 1)) {
        expect(other.hidden).toBe(false)
      }

      expect(window.document.activeElement).toBe(screen.getByRole('button', { name: `Expand ${title}` }))
    }

    for (const [index, title] of titles.entries()) {
      fireEvent.click(screen.getByRole('button', { name: `Expand ${title}` }))
      const button = screen.getByRole('button', { name: `Collapse ${title}` })
      expect(window.document.getElementById(button.getAttribute('aria-controls')!)).toBe(panels[index])
      expect(panels[index].hidden).toBe(false)
      expect(window.document.activeElement).toBe(button)
    }

    expect(container.querySelector('[data-project-tree]')).toBe(tree)
    expect(screen.getByText('700')).toBeTruthy()
    expect(readDir).not.toHaveBeenCalled()
    expect(api).not.toHaveBeenCalled()
  })

  it('keeps the file panel controls available without a workspace and follows the pane side', () => {
    theme.themeName = 'holo'
    setCurrentCwd('')
    const initialFlipped = $panesFlipped.get()
    const { container } = render(<RightSidebarPane onActivateFile={vi.fn()} onActivateFolder={vi.fn()} />)
    fireEvent.click(screen.getByRole('button', { name: 'Collapse File system' }))
    expect(screen.queryByRole('button', { name: 'New Project' })).toBeNull()

    try {
      act(() => $panesFlipped.set(true))
      expect(container.querySelector('.hud-collapse-rail')?.getAttribute('data-restore-side')).toBe('left')
      act(() => $panesFlipped.set(false))
      expect(container.querySelector('.hud-collapse-rail')?.getAttribute('data-restore-side')).toBe('right')
      fireEvent.click(screen.getByRole('button', { name: 'Expand File system' }))
      expect(screen.getByRole('button', { name: 'New Project' })).toBeTruthy()
    } finally {
      act(() => $panesFlipped.set(initialFlipped))
    }
  })
})
