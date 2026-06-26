const test = require('node:test')
const assert = require('node:assert/strict')

const {
  getSoundSettingsInvocationCandidates
} = require('./sound')

test('sound service provides sound settings open candidates', () => {
  const candidates = getSoundSettingsInvocationCandidates()

  assert.deepEqual(candidates[0], {
    command: '/usr/bin/open',
    args: ['x-apple.systempreferences:com.apple.Sound-Settings.extension']
  })
  assert.deepEqual(candidates[1], {
    command: '/usr/bin/open',
    args: ['x-apple.systempreferences:com.apple.preference.sound']
  })
})
