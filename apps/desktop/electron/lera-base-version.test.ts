import assert from 'node:assert/strict'

import { test } from 'vitest'

import { isRemoteMinorAhead, latestStableVersion, parseHermesVersion } from './lera-base-version'

test('parses the canonical Hermes version module', () => {
  assert.equal(parseHermesVersion('__version__ = "0.19.0"'), '0.19.0')
})

test('only treats a higher middle version component as a base update', () => {
  assert.equal(isRemoteMinorAhead('0.18.2', '0.19.0'), true)
  assert.equal(isRemoteMinorAhead('0.18.2', '0.18.9'), false)
  assert.equal(isRemoteMinorAhead('0.18.2', '0.17.9'), false)
})

test('picks the highest stable semver tag, ignoring CalVer, canary and rc tags', () => {
  const lsRemote = [
    'aaa\trefs/tags/v0.21.5',
    'bbb\trefs/tags/v0.22.2',
    'ccc\trefs/tags/v0.22.10',
    'ddd\trefs/tags/v0.9.0',
    'eee\trefs/tags/v2026.9.24',
    'fff\trefs/tags/v0.22.2+canary.20261021T070232Z',
    'ggg\trefs/tags/v0.23.0-rc.1'
  ].join('\n')

  assert.equal(latestStableVersion(lsRemote), '0.22.10')
  assert.equal(latestStableVersion('aaa\trefs/tags/v2026.9.24'), null)
})
