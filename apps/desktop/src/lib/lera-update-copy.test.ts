import { describe, expect, it } from 'vitest'

import { resolveLeraUpdateBody } from './lera-update-copy'

describe('resolveLeraUpdateBody', () => {
  it('adds the upstream base version to a Lera client update', () => {
    expect(
      resolveLeraUpdateBody({
        baseUpdateAvailable: true,
        baseVersion: '0.19.0',
        body: 'A new version of Hermes is ready to install.',
        target: 'client'
      })
    ).toBe('A new version of Lera is ready to install. Base version is at 0.19.0.')
  })

  it('does not rebrand backend update copy', () => {
    expect(
      resolveLeraUpdateBody({
        baseUpdateAvailable: false,
        body: 'A newer version of the connected Hermes backend is ready to install.',
        target: 'backend'
      })
    ).toBe('A newer version of the connected Hermes backend is ready to install.')
  })

  it('shows the base version even when its middle component has not advanced', () => {
    expect(
      resolveLeraUpdateBody({
        baseUpdateAvailable: false,
        baseVersion: '0.18.2',
        body: 'A new version of Hermes is ready to install.',
        target: 'client'
      })
    ).toBe('A new version of Lera is ready to install. Base version is at 0.18.2.')
  })
})
