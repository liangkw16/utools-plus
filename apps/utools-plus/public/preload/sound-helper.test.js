const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  buildActionEnvelope,
  getSoundSettingsInvocationCandidates,
  normalizeMuteState,
  normalizeVolumeScalar,
  parseSoundHelperResponse,
  resolveActionInvocation,
  setOutputMuted,
  setOutputVolume,
  toSoundActionError
} = require('./sound-helper')

test('parseSoundHelperResponse reads the CoreAudio device snapshot', () => {
  const helperResponse = JSON.stringify({
    ok: true,
    devices: [
      {
        uid: 'built-in-output',
        id: 64,
        name: 'MacBook Pro Speakers',
        manufacturer: 'Apple Inc.',
        input: false,
        output: true,
        defaultInput: false,
        defaultOutput: true,
        defaultSystemOutput: true
      },
      {
        uid: 'studio-mic',
        id: 72,
        name: 'Studio Microphone',
        manufacturer: 'Acme',
        input: true,
        output: false,
        defaultInput: true,
        defaultOutput: false,
        defaultSystemOutput: false
      }
    ],
    defaults: {
      input: 'studio-mic',
      output: 'built-in-output',
      systemOutput: 'built-in-output'
    },
    controls: {
      output: {
        uid: 'built-in-output',
        volume: 0.72,
        muted: false,
        volumeSupported: true,
        muteSupported: true
      },
      input: {
        uid: 'studio-mic',
        volume: 0.35,
        muted: null,
        volumeSupported: true,
        muteSupported: false
      }
    }
  })

  assert.deepEqual(parseSoundHelperResponse(helperResponse, 'list'), {
    ok: true,
    devices: [
      {
        uid: 'built-in-output',
        id: 64,
        name: 'MacBook Pro Speakers',
        manufacturer: 'Apple Inc.',
        input: false,
        output: true,
        defaultInput: false,
        defaultOutput: true,
        defaultSystemOutput: true
      },
      {
        uid: 'studio-mic',
        id: 72,
        name: 'Studio Microphone',
        manufacturer: 'Acme',
        input: true,
        output: false,
        defaultInput: true,
        defaultOutput: false,
        defaultSystemOutput: false
      }
    ],
    defaults: {
      input: 'studio-mic',
      output: 'built-in-output',
      systemOutput: 'built-in-output'
    },
    controls: {
      output: {
        uid: 'built-in-output',
        volume: 0.72,
        muted: false,
        volumeSupported: true,
        muteSupported: true
      },
      input: {
        uid: 'studio-mic',
        volume: 0.35,
        muted: null,
        volumeSupported: true,
        muteSupported: false
      }
    }
  })
})

test('buildActionEnvelope returns a stable sound action payload', () => {
  assert.deepEqual(buildActionEnvelope('set-output', 'built-in-output'), {
    ok: true,
    action: 'set-output',
    uid: 'built-in-output'
  })
})

test('resolveActionInvocation prefers the bundled sound helper', () => {
  const bundledHelper = path.join(__dirname, 'bin', 'sound-helper')
  const invocation = resolveActionInvocation('list', '', candidate => candidate === bundledHelper)

  assert.deepEqual(invocation, {
    command: bundledHelper,
    args: ['list'],
    parser: 'json'
  })
})

test('resolveActionInvocation falls back to the Swift source helper in development', () => {
  const helperSource = path.join(__dirname, 'native', 'sound-helper.swift')
  const invocation = resolveActionInvocation(
    'set-input',
    ['studio-mic'],
    candidate => candidate === helperSource
  )

  assert.equal(invocation.command, '/usr/bin/swift')
  assert.deepEqual(invocation.args, [
    helperSource,
    'set-input',
    'studio-mic'
  ])
  assert.equal(invocation.parser, 'json')
})

test('resolveActionInvocation passes volume and mute action arguments through to the helper', () => {
  const bundledHelper = path.join(__dirname, 'bin', 'sound-helper')
  const invocation = resolveActionInvocation(
    'set-output-volume',
    ['0.42'],
    candidate => candidate === bundledHelper
  )

  assert.deepEqual(invocation, {
    command: bundledHelper,
    args: ['set-output-volume', '0.42'],
    parser: 'json'
  })
})

test('normalizeVolumeScalar accepts percentages and clamps to CoreAudio scalar range', () => {
  assert.equal(normalizeVolumeScalar(42), '0.42')
  assert.equal(normalizeVolumeScalar(0.42), '0.42')
  assert.equal(normalizeVolumeScalar(-20), '0')
  assert.equal(normalizeVolumeScalar(140), '1')
})

test('normalizeMuteState maps booleans to helper arguments', () => {
  assert.equal(normalizeMuteState(true), 'on')
  assert.equal(normalizeMuteState(false), 'off')
})

test('setOutputVolume invokes the helper with a normalized volume scalar', async () => {
  const bundledHelper = path.join(__dirname, 'bin', 'sound-helper')
  let captured = null

  const response = await setOutputVolume(42, {
    platform: 'darwin',
    exists: candidate => candidate === bundledHelper,
    runner: async (command, args) => {
      captured = { command, args }
      return {
        stdout: JSON.stringify({
          ok: true,
          action: 'set-output-volume',
          volume: 0.42
        })
      }
    }
  })

  assert.deepEqual(captured, {
    command: bundledHelper,
    args: ['set-output-volume', '0.42']
  })
  assert.deepEqual(response, {
    ok: true,
    action: 'set-output-volume',
    volume: 0.42
  })
})

test('setOutputMuted invokes the helper with a normalized mute state', async () => {
  const bundledHelper = path.join(__dirname, 'bin', 'sound-helper')
  let captured = null

  await setOutputMuted(true, {
    platform: 'darwin',
    exists: candidate => candidate === bundledHelper,
    runner: async (command, args) => {
      captured = { command, args }
      return {
        stdout: JSON.stringify({
          ok: true,
          action: 'set-output-muted',
          muted: true
        })
      }
    }
  })

  assert.deepEqual(captured, {
    command: bundledHelper,
    args: ['set-output-muted', 'on']
  })
})

test('getSoundSettingsInvocationCandidates keeps both modern and legacy settings URLs', () => {
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

test('toSoundActionError surfaces helper error messages', () => {
  const error = toSoundActionError(
    {
      stdout: JSON.stringify({
        ok: false,
        error: {
          message: 'Audio device not found'
        }
      })
    },
    'set-output',
    'missing-output'
  )

  assert.equal(error.message, 'Audio device not found')
})
