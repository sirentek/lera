import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { act, cleanup, render, screen } from '@testing-library/react'
import { atom } from 'nanostores'
import { createRef } from 'react'
import { MemoryRouter } from 'react-router'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import type * as ConfigApi from '@/api/config'
import { $settingsRequestProfile } from '@/store/settings-scope'

import type { ConfigSettings as ConfigSettingsType } from './config-settings'

// The vi.mock factory below replaces the computed (read-only) atom with a
// writable one; narrow the import back so tests can drive it.
const scopeProfileMock = $settingsRequestProfile as unknown as { set: (value: string) => void }

const getHermesConfigRecord = vi.fn()
const getHermesConfigSchema = vi.fn()
const saveHermesConfig = vi.fn()
const getElevenLabsVoices = vi.fn()
let onProfileSwitch: (() => void) | undefined

// Keep the real read-origin helpers (WeakMap peek/bind) live: the shared
// config hook reaches them through the barrel, and a bare mock would throw.
vi.mock('@/hermes', async () => ({
  ...(await vi.importActual<typeof ConfigApi>('@/api/config')),
  // use-config-record folds the scope into its cache key via the barrel; the
  // real one is a pure string fold, mirrored here for the string scopes this
  // suite passes.
  profileScopeKey: (scope?: unknown) => (typeof scope === 'string' && scope.trim()) || 'default',
  getHermesConfigRecord: (profile?: string) => getHermesConfigRecord(profile),
  getHermesConfigSchema: () => getHermesConfigSchema(),
  saveHermesConfig: (config: unknown, profile?: string) => saveHermesConfig(config, profile),
  getElevenLabsVoices: () => getElevenLabsVoices(),
  setApiRequestProfile: () => {}
}))

vi.mock('../hooks/use-on-profile-switch', () => ({
  useOnProfileSwitch: (callback: () => void) => {
    onProfileSwitch = callback
  }
}))

vi.mock('./model-settings', () => ({
  ModelSettings: () => <div data-testid="model-settings">Model settings</div>
}))

// The real stores pull in the gateway/profile stack, which needs a live
// backend connection. This page only reads the "applies to" scope override
// and the repo-discovery signature, neither of which this test touches. The
// scope chip it renders also reads the selected profile and the loud-note
// selector, so those are stubbed to the single-profile default shape.
vi.mock('@/store/settings-scope', () => ({
  // The real store derives this from the displayed $settingsScopeProfile
  // (never undefined for a real profile — settings-scope.test.ts pins that);
  // here it is a plain atom so the page's threading of it can be driven.
  $settingsRequestProfile: atom<string | undefined>('default'),
  $settingsScopeEditsNonDefault: atom(false),
  $settingsScopeOverride: atom<null | string>(null),
  $settingsScopeProfile: atom<string>('default')
}))

vi.mock('@/store/projects', () => ({
  $worktreeRefreshToken: atom(0),
  repoDiscoveryPolicyFromConfig: () => ({ enabled: true, roots: [], exclude_paths: [] }),
  repoDiscoveryPolicySignature: (policy: unknown) => JSON.stringify(policy),
  scanAndRecordRepos: vi.fn().mockResolvedValue(undefined)
}))

// The module graph behind ConfigSettings is large (1.5s cold here, >10s on a
// saturated CI runner); load it once under the hook timeout so the 15s test
// budget is spent on the autosave behaviour, not on transform + import.
let ConfigSettings: typeof ConfigSettingsType

beforeAll(async () => {
  ;({ ConfigSettings } = await import('./config-settings'))
}, 60_000)

beforeEach(() => {
  onProfileSwitch = undefined
  scopeProfileMock.set('default')
  getElevenLabsVoices.mockResolvedValue({ available: false })
  getHermesConfigSchema.mockResolvedValue({ fields: {} })
  saveHermesConfig.mockResolvedValue({ ok: true })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function renderConfigSettings(activeSectionId = 'safety') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  const importInputRef = createRef<HTMLInputElement>()

  const view = render(
    <MemoryRouter>
      <QueryClientProvider client={client}>
        <ConfigSettings activeSectionId={activeSectionId} importInputRef={importInputRef} />
      </QueryClientProvider>
    </MemoryRouter>
  )

  return { importInputRef, ...view }
}

describe('ConfigSettings autosave', () => {
  it('sends a later revert instead of diffing it away against the stale page-load baseline', async () => {
    getHermesConfigRecord.mockResolvedValue({ checkpoints: { enabled: false }, other: 'untouched' })

    vi.useFakeTimers({ shouldAdvanceTime: true })

    try {
      renderConfigSettings()

      const toggle = await screen.findByRole('switch')

      // Edit: flip checkpoints.enabled on, let the debounced autosave fire.
      toggle.click()
      await vi.advanceTimersByTimeAsync(700)

      await vi.waitFor(() => expect(saveHermesConfig).toHaveBeenCalledTimes(1))
      expect(saveHermesConfig.mock.calls[0][0]).toEqual({ checkpoints: { enabled: true } })

      // Revert: flip it back to its original value and let autosave fire again.
      toggle.click()
      await vi.advanceTimersByTimeAsync(700)

      await vi.waitFor(() => expect(saveHermesConfig).toHaveBeenCalledTimes(2))
      // Must still explicitly send the reverted value — diffing against the
      // never-advanced page-load baseline would produce an empty patch here
      // (the field is back to its original value) and leave disk stuck at
      // `enabled: true` from the first save.
      expect(saveHermesConfig.mock.calls[1][0]).toEqual({ checkpoints: { enabled: false } })
    } finally {
      vi.useRealTimers()
    }
  })

  it('threads the "Applies to" request scope into both the config read and the autosave write', async () => {
    // #118432: the request scope is the concrete profile the page displays
    // (see settings-scope.test.ts). The page must carry it into the read AND
    // the write — a read scoped to B with a write that falls back to the
    // ambient (launch) profile is exactly the silent cross-profile write.
    scopeProfileMock.set('nash')
    getHermesConfigRecord.mockResolvedValue({ checkpoints: { enabled: false } })

    vi.useFakeTimers({ shouldAdvanceTime: true })

    try {
      renderConfigSettings()

      await vi.waitFor(() => expect(getHermesConfigRecord).toHaveBeenCalledWith('nash'))

      ;(await screen.findByRole('switch')).click()
      await vi.advanceTimersByTimeAsync(700)

      await vi.waitFor(() => expect(saveHermesConfig).toHaveBeenCalledWith({ checkpoints: { enabled: true } }, 'nash'))
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('ConfigSettings loading', () => {
  it('renders the model panel without waiting for the generic config schema', async () => {
    let resolveSchema!: (value: { fields: Record<string, never> }) => void

    getHermesConfigRecord.mockResolvedValue({})
    getHermesConfigSchema.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSchema = resolve
        })
    )

    const { container } = await renderConfigSettings('model')

    expect(await screen.findByTestId('model-settings')).toBeTruthy()
    expect(container.querySelector('[data-slot="settings-skeleton"]')).toBeNull()

    resolveSchema({ fields: {} })
  })

  it('renders Chat from config without waiting for the schema request', async () => {
    let resolveSchema!: (value: { fields: Record<string, never> }) => void

    getHermesConfigRecord.mockResolvedValue({
      agent: { image_input_mode: 'auto' },
      display: { personality: 'helpful', show_reasoning: true },
      timezone: ''
    })
    getHermesConfigSchema.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveSchema = resolve
        })
    )

    const { container } = await renderConfigSettings('chat')

    expect(await screen.findByText('Max preview / image load size')).toBeTruthy()
    await vi.waitFor(() => expect(container.querySelector('[data-tour="field-display.personality"]')).toBeTruthy())
    expect(container.querySelector('[data-tour="field-display.show_reasoning"]')).toBeTruthy()
    expect(container.querySelector('[data-tour="field-agent.image_input_mode"]')).toBeTruthy()

    resolveSchema({ fields: {} })
  })

  it('re-seeds the draft when a profile refetch returns a structurally identical config', async () => {
    const record = { checkpoints: { enabled: false } }
    let resolveRefetch!: (value: typeof record) => void

    getHermesConfigRecord.mockResolvedValue(record)

    await renderConfigSettings('safety')
    expect(await screen.findByRole('switch')).toBeTruthy()

    getHermesConfigRecord.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveRefetch = resolve
        })
    )

    act(() => onProfileSwitch?.())
    expect(screen.queryByRole('switch')).toBeNull()

    await act(async () => resolveRefetch(record))
    expect(await screen.findByRole('switch')).toBeTruthy()
  })
})
