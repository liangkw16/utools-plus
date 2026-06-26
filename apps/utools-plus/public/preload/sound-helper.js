const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)
const OPEN = '/usr/bin/open'
const SWIFT = '/usr/bin/swift'
const SOUND_SETTINGS_URLS = [
  'x-apple.systempreferences:com.apple.Sound-Settings.extension',
  'x-apple.systempreferences:com.apple.preference.sound'
]

function buildActionEnvelope (action, uid = null) {
  const payload = {
    ok: true,
    action
  }

  if (uid) {
    payload.uid = uid
  }

  return payload
}

function getSoundSettingsInvocationCandidates () {
  return SOUND_SETTINGS_URLS.map(url => ({
    command: OPEN,
    args: [url]
  }))
}

async function getSoundSnapshot (options = {}) {
  return runSoundAction('list', [], options)
}

async function setDefaultInputDevice (uid, options = {}) {
  assertDeviceUid(uid)
  return runSoundAction('set-input', [uid], options)
}

async function setDefaultOutputDevice (uid, options = {}) {
  assertDeviceUid(uid)
  return runSoundAction('set-output', [uid], options)
}

async function setOutputVolume (volume, options = {}) {
  return runSoundAction('set-output-volume', [normalizeVolumeScalar(volume)], options)
}

async function setInputVolume (volume, options = {}) {
  return runSoundAction('set-input-volume', [normalizeVolumeScalar(volume)], options)
}

async function setOutputMuted (muted, options = {}) {
  return runSoundAction('set-output-muted', [normalizeMuteState(muted)], options)
}

async function setInputMuted (muted, options = {}) {
  return runSoundAction('set-input-muted', [normalizeMuteState(muted)], options)
}

async function openSoundSettings (options = {}) {
  const runner = options.runner ?? execFileAsync
  const platform = options.platform ?? process.platform

  assertMacOS(platform)

  let lastError = null

  for (const invocation of getSoundSettingsInvocationCandidates()) {
    try {
      await runner(invocation.command, invocation.args)
      return buildActionEnvelope('open-sound-settings')
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('打开系统声音设置失败。')
}

async function runSoundAction (action, actionArgs = [], options = {}) {
  const runner = options.runner ?? execFileAsync
  const exists = options.exists ?? fs.existsSync
  const platform = options.platform ?? process.platform
  const helperArgs = normalizeActionArgs(actionArgs)

  assertMacOS(platform)

  const { command, args, parser } = resolveActionInvocation(action, helperArgs, exists)

  try {
    const { stdout } = await runner(command, args)
    return parseSoundHelperResponse(stdout, action, helperArgs[0], parser)
  } catch (error) {
    throw toSoundActionError(error, action, helperArgs[0])
  }
}

function resolveActionInvocation (action, actionArgs = [], exists = fs.existsSync) {
  return {
    ...resolveHelperInvocation(action, actionArgs, exists),
    parser: 'json'
  }
}

function resolveHelperInvocation (action, actionArgs = [], exists = fs.existsSync) {
  const binaryPath = path.join(__dirname, 'bin', 'sound-helper')
  const sourcePath = path.join(__dirname, 'native', 'sound-helper.swift')
  const args = [action, ...normalizeActionArgs(actionArgs)]

  if (exists(binaryPath)) {
    return { command: binaryPath, args }
  }

  if (exists(sourcePath)) {
    return { command: SWIFT, args: [sourcePath, ...args] }
  }

  throw new Error('Sound helper is not available. Run `npm run build:helper` on macOS first.')
}

function normalizeActionArgs (actionArgs = []) {
  if (Array.isArray(actionArgs)) {
    return actionArgs.map(String).filter(Boolean)
  }

  return actionArgs ? [String(actionArgs)] : []
}

function parseSoundHelperResponse (stdout, action, uid = '', parser = 'json') {
  if (parser !== 'json') {
    return buildActionEnvelope(action, uid || null)
  }

  const response = safeParseJson(stdout)

  if (!response) {
    return buildActionEnvelope(action, uid || null)
  }

  if (response.ok === false) {
    throw new Error(response.error?.message ?? `Sound ${action} failed`)
  }

  return response
}

function toSoundActionError (error, action, uid = '') {
  const response = safeParseJson(error.stdout)

  if (response?.error?.message) {
    return new Error(response.error.message)
  }

  if (error.stderr) {
    return new Error(error.stderr.trim())
  }

  return new Error(`Sound ${action} failed${uid ? ` for ${uid}` : ''}`)
}

function normalizeVolumeScalar (volume) {
  const numericVolume = Number(volume)

  if (!Number.isFinite(numericVolume)) {
    throw new Error('Invalid sound volume')
  }

  const scalarVolume = numericVolume > 1 ? numericVolume / 100 : numericVolume
  const clampedVolume = Math.min(1, Math.max(0, scalarVolume))

  return Number(clampedVolume.toFixed(4)).toString()
}

function normalizeMuteState (muted) {
  if (typeof muted === 'string') {
    const normalized = muted.trim().toLowerCase()

    if (['on', 'true', '1', 'muted'].includes(normalized)) return 'on'
    if (['off', 'false', '0', 'unmuted'].includes(normalized)) return 'off'
  }

  return muted ? 'on' : 'off'
}

function safeParseJson (text) {
  if (!text || !text.trim()) return null

  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function assertDeviceUid (uid) {
  if (typeof uid !== 'string' || !uid.trim()) {
    throw new Error('Missing sound device uid')
  }
}

function assertMacOS (platform = process.platform) {
  if (platform !== 'darwin') {
    throw new Error('uTools Plus only supports macOS')
  }
}

module.exports = {
  buildActionEnvelope,
  getSoundSettingsInvocationCandidates,
  getSoundSnapshot,
  normalizeActionArgs,
  normalizeMuteState,
  normalizeVolumeScalar,
  openSoundSettings,
  parseSoundHelperResponse,
  resolveActionInvocation,
  resolveHelperInvocation,
  runSoundAction,
  setDefaultInputDevice,
  setDefaultOutputDevice,
  setInputMuted,
  setInputVolume,
  setOutputMuted,
  setOutputVolume,
  toSoundActionError
}
