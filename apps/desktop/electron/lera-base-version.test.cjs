const test = require('node:test')
const assert = require('node:assert/strict')

const { isRemoteMinorAhead, parseHermesVersion } = require('./lera-base-version.cjs')

test('parses the canonical Hermes version module', () => {
  assert.equal(parseHermesVersion('__version__ = "0.19.0"'), '0.19.0')
})

test('only treats a higher middle version component as a base update', () => {
  assert.equal(isRemoteMinorAhead('0.18.2', '0.19.0'), true)
  assert.equal(isRemoteMinorAhead('0.18.2', '0.18.9'), false)
  assert.equal(isRemoteMinorAhead('0.18.2', '0.17.9'), false)
})
