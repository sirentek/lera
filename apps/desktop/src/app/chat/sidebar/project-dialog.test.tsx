import { cleanup, render, screen } from '@testing-library/react'
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { $projectsRpcAvailable, closeProjectDialog, openProjectCreate } from '@/store/projects'

import { ProjectDialog } from './project-dialog'

describe('ProjectDialog', () => {
  beforeEach(() => {
    $projectsRpcAvailable.set(true)
    closeProjectDialog()
  })

  afterEach(() => {
    cleanup()
    closeProjectDialog()
    $projectsRpcAvailable.set(null)
  })

  it('renders the create dialog when project creation is requested', async () => {
    render(<ProjectDialog />)

    await act(async () => openProjectCreate())

    expect(await screen.findByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'New project' })).toBeTruthy()
    expect(screen.getByPlaceholderText('e.g. Skunkworks')).toBeTruthy()
  })
})
