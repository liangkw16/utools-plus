const fs = require('node:fs')
const path = require('node:path')
const { execFile } = require('node:child_process')
const { promisify } = require('node:util')

const execFileAsync = promisify(execFile)

const NETWORKSETUP = '/usr/sbin/networksetup'
const OPEN = '/usr/bin/open'
const SYSTEM_PROFILER = '/usr/sbin/system_profiler'
const SWIFT = '/usr/bin/swift'
const DEFAULT_WIFI_INTERFACE = 'en0'
const AIRPORT_CANDIDATES = [
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport',
  '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/A/Resources/airport'
]
const WIFI_SETTINGS_URLS = [
  'x-apple.systempreferences:com.apple.Wi-Fi-Settings.extension',
  'x-apple.systempreferences:com.apple.wifi-settings-extension',
  'x-apple.systempreferences:com.apple.preference.network?Wi-Fi'
]
const WIFI_SNAPSHOT_CACHE_TTL_MS = 10000

let wifiSnapshotCache = null
let wifiSnapshotInFlight = null
let lastResolvedCurrentNetwork = null

async function getWifiSnapshot (options = {}) {
  const cacheTtlMs = options.cacheTtlMs ?? WIFI_SNAPSHOT_CACHE_TTL_MS
  const now = options.now ?? Date.now()
  const canUseCache = options.cache !== false && cacheTtlMs > 0

  if (!options.forceRefresh && canUseCache && wifiSnapshotCache && now - wifiSnapshotCache.createdAt <= cacheTtlMs) {
    return wifiSnapshotCache.snapshot
  }

  if (!options.forceRefresh && canUseCache && wifiSnapshotInFlight) {
    return wifiSnapshotInFlight
  }

  const snapshotPromise = readFreshWifiSnapshot(options)

  if (!canUseCache) {
    return snapshotPromise
  }

  wifiSnapshotInFlight = snapshotPromise

  try {
    const snapshot = await snapshotPromise
    wifiSnapshotCache = {
      createdAt: now,
      snapshot
    }
    return snapshot
  } finally {
    if (wifiSnapshotInFlight === snapshotPromise) {
      wifiSnapshotInFlight = null
    }
  }
}

async function readFreshWifiSnapshot (options = {}) {
  const runner = options.runner ?? execFileAsync
  const platform = options.platform ?? process.platform
  const scan = options.scan !== false

  assertMacOS(platform)

  const wifiInterface = await resolveWifiInterface({ runner, platform })
  const power = await readWifiPower(wifiInterface, runner)
  const wifiDetails = power === 'on'
    ? await readWifiDetails(wifiInterface, {
      exists: options.exists ?? fs.existsSync,
      runner,
      scan
    })
    : {
        current: null,
        networks: [],
        knownNetworks: [],
        otherNetworks: [],
        historyNetworks: []
      }

  return {
    ok: true,
    interface: wifiInterface,
    power,
    current: wifiDetails.current,
    networks: wifiDetails.networks ?? [],
    knownNetworks: wifiDetails.knownNetworks ?? [],
    otherNetworks: wifiDetails.otherNetworks ?? [],
    historyNetworks: wifiDetails.historyNetworks ?? [],
    scanning: power === 'on' && !scan
  }
}

async function setWifiPower (power, options = {}) {
  const runner = options.runner ?? execFileAsync
  const platform = options.platform ?? process.platform
  const normalizedPower = normalizeWifiPower(power)

  assertMacOS(platform)

  const wifiInterface = await resolveWifiInterface({ runner, platform })
  clearWifiSnapshotCache()
  await runner(NETWORKSETUP, ['-setairportpower', wifiInterface, normalizedPower])

  return {
    ok: true,
    action: `power-${normalizedPower}`,
    interface: wifiInterface
  }
}

async function connectWifiNetwork (ssid, options = {}) {
  const runner = options.runner ?? execFileAsync
  const platform = options.platform ?? process.platform
  const password = options.password
  const normalizedSsid = normalizeWifiSsid(ssid)

  assertMacOS(platform)

  const wifiInterface = await resolveWifiInterface({ runner, platform })
  const args = ['-setairportnetwork', wifiInterface, normalizedSsid]

  if (password !== undefined && password !== null && password !== '') {
    args.push(String(password))
  }

  await runner(NETWORKSETUP, args)
  clearWifiSnapshotCache()

  return {
    ok: true,
    action: 'connect-wifi-network',
    interface: wifiInterface,
    ssid: normalizedSsid
  }
}

function clearWifiSnapshotCache () {
  wifiSnapshotCache = null
  wifiSnapshotInFlight = null
  lastResolvedCurrentNetwork = null
}

async function openWifiSettings (options = {}) {
  const runner = options.runner ?? execFileAsync
  const platform = options.platform ?? process.platform

  assertMacOS(platform)

  let lastError = null

  for (const invocation of getWifiSettingsInvocationCandidates()) {
    try {
      await runner(invocation.command, invocation.args)
      return {
        ok: true,
        action: 'open-wifi-settings'
      }
    } catch (error) {
      lastError = error
    }
  }

  throw lastError ?? new Error('打开系统 Wi-Fi 设置失败。')
}

async function resolveWifiInterface ({ runner = execFileAsync, platform = process.platform } = {}) {
  assertMacOS(platform)

  const { stdout } = await runner(NETWORKSETUP, ['-listallhardwareports'])
  return parseHardwarePorts(stdout) || DEFAULT_WIFI_INTERFACE
}

async function readWifiPower (wifiInterface, runner = execFileAsync) {
  const { stdout } = await runner(NETWORKSETUP, ['-getairportpower', wifiInterface])
  return parseWifiPower(stdout)
}

async function readWifiDetails (wifiInterface, { exists = fs.existsSync, runner = execFileAsync, scan = true } = {}) {
  const currentSsid = await readNetworksetupCurrentSsid(wifiInterface, runner)
  const preferredSsids = await readPreferredWifiNetworks(wifiInterface, runner)
  const airport = resolveAirportCommand(exists)

  if (airport) {
    return withWifiNetworkGroups({
      current: await readCurrentNetwork(airport, runner),
      networks: scan ? await scanWifiNetworks(airport, runner) : []
    }, preferredSsids, { includeHistory: scan })
  }

  const nativeDetails = await readNativeWifiDetails(wifiInterface, { exists, runner, scan })

  if (nativeDetails) {
    return withWifiNetworkGroups(mergeWifiDetails(nativeDetails, currentSsid), preferredSsids, { includeHistory: scan })
  }

  if (!scan) {
    return withWifiNetworkGroups(mergeWifiDetails({ current: null, networks: [] }, currentSsid), preferredSsids, { includeHistory: false })
  }

  return withWifiNetworkGroups(mergeWifiDetails(await readSystemProfilerWifi(wifiInterface, runner), currentSsid), preferredSsids)
}

async function readCurrentNetwork (airport, runner = execFileAsync) {
  try {
    const { stdout } = await runner(airport, ['-I'])
    return parseAirportCurrent(stdout)
  } catch {
    return null
  }
}

async function readSystemProfilerWifi (wifiInterface, runner = execFileAsync) {
  try {
    const { stdout } = await runner(SYSTEM_PROFILER, ['SPAirPortDataType', '-json'])
    return parseSystemProfilerWifi(stdout, wifiInterface)
  } catch {
    return {
      current: null,
      networks: []
    }
  }
}

async function readNetworksetupCurrentSsid (wifiInterface, runner = execFileAsync) {
  try {
    const { stdout } = await runner(NETWORKSETUP, ['-getairportnetwork', wifiInterface])
    return parseNetworksetupCurrentSsid(stdout)
  } catch {
    return ''
  }
}

async function readPreferredWifiNetworks (wifiInterface, runner = execFileAsync) {
  try {
    const { stdout } = await runner(NETWORKSETUP, ['-listpreferredwirelessnetworks', wifiInterface])
    return parsePreferredWifiNetworks(stdout)
  } catch {
    return []
  }
}

async function readNativeWifiDetails (wifiInterface, { exists = fs.existsSync, runner = execFileAsync, scan = true } = {}) {
  const action = scan ? 'snapshot' : 'current'
  const invocations = getNativeWifiInvocations(wifiInterface, exists, action)

  for (const invocation of invocations) {
    try {
      const { stdout } = await runner(invocation.command, invocation.args)
      const details = parseNativeWifiHelperResponse(stdout)

      if (details) {
        return details
      }
    } catch {
      continue
    }
  }

  return null
}

async function scanWifiNetworks (airport, runner = execFileAsync) {
  try {
    const { stdout } = await runner(airport, ['-s'])
    return parseAirportScan(stdout)
  } catch {
    return []
  }
}

function parseHardwarePorts (text) {
  const blocks = text.split(/\n\s*\n/)

  for (const block of blocks) {
    if (!/Hardware Port:\s*Wi-Fi/i.test(block) && !/Hardware Port:\s*AirPort/i.test(block)) {
      continue
    }

    const deviceMatch = block.match(/^\s*Device:\s*(\S+)\s*$/m)
    if (deviceMatch) return deviceMatch[1]
  }

  return ''
}

function parseWifiPower (text) {
  const powerMatch = text.match(/:\s*(On|Off)\s*$/i)

  if (!powerMatch) {
    return 'unknown'
  }

  return powerMatch[1].toLowerCase()
}

function parseNetworksetupCurrentSsid (text) {
  const match = String(text).match(/^Current Wi-Fi Network:\s*(.+)\s*$/m)
  return match?.[1]?.trim() ?? ''
}

function parsePreferredWifiNetworks (text) {
  const seen = new Set()
  const networks = []

  for (const line of String(text).split(/\r?\n/).slice(1)) {
    const ssid = line.trim()

    if (!ssid || seen.has(ssid)) {
      continue
    }

    seen.add(ssid)
    networks.push(ssid)
  }

  return networks
}

function parseAirportCurrent (text) {
  const fields = parseAirportKeyValueLines(text)
  const ssid = fields.SSID || ''

  if (!ssid) {
    return null
  }

  return {
    ssid,
    bssid: fields.BSSID || '',
    rssi: toNumber(fields.agrCtlRSSI),
    noise: toNumber(fields.agrCtlNoise),
    channel: fields.channel || '',
    txRate: toNumber(fields.lastTxRate),
    maxRate: toNumber(fields.maxRate),
    security: fields['link auth'] || fields['802.11 auth'] || ''
  }
}

function parseAirportKeyValueLines (text) {
  const fields = {}

  for (const line of text.split(/\r?\n/)) {
    const separatorIndex = line.indexOf(':')

    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const value = line.slice(separatorIndex + 1).trim()

    if (key) {
      fields[key] = value
    }
  }

  return fields
}

function parseAirportScan (text) {
  return text
    .split(/\r?\n/)
    .slice(1)
    .map(line => parseAirportScanLine(line))
    .filter(Boolean)
    .sort((left, right) => right.rssi - left.rssi)
}

function parseAirportScanLine (line) {
  const trimmed = line.trim()

  if (!trimmed) {
    return null
  }

  const match = trimmed.match(/^(.+?)\s+([0-9a-f]{2}(?::[0-9a-f]{2}){5})\s+(-?\d+)\s+(\S+)\s+\S+\s+\S+\s+(.+)$/i)

  if (!match) {
    return null
  }

  return {
    ssid: match[1].trim(),
    bssid: match[2],
    rssi: Number(match[3]),
    channel: match[4],
    security: match[5].trim()
  }
}

function resolveAirportCommand (exists = fs.existsSync) {
  return AIRPORT_CANDIDATES.find(candidate => exists(candidate)) || ''
}

function resolveNativeWifiInvocation (wifiInterface, exists = fs.existsSync, action = 'snapshot') {
  return getNativeWifiInvocations(wifiInterface, exists, action)[0] ?? null
}

function getNativeWifiInvocations (wifiInterface, exists = fs.existsSync, action = 'snapshot') {
  const binaryPath = path.join(__dirname, 'bin', 'wifi-helper')
  const sourcePath = path.join(__dirname, 'native', 'wifi-helper.swift')
  const args = [action, wifiInterface]
  const invocations = []

  if (action === 'current' && exists(binaryPath)) {
    invocations.push({ command: binaryPath, args })
  }

  if (exists(sourcePath)) {
    invocations.push({ command: SWIFT, args: [sourcePath, ...args] })
  }

  if (action !== 'current' && exists(binaryPath)) {
    invocations.push({ command: binaryPath, args })
  }

  return invocations
}

function parseNativeWifiHelperResponse (text) {
  const response = safeParseJson(text)

  if (!response || response.ok === false) {
    return null
  }

  return {
    current: normalizeWifiNetwork(response.current, { allowEmptySsid: true }),
    networks: (Array.isArray(response.networks) ? response.networks : [])
      .map(network => normalizeWifiNetwork(network))
      .filter(Boolean)
      .sort(sortWifiNetworks)
  }
}

function parseSystemProfilerWifi (text, wifiInterface = '') {
  const payload = safeParseJson(text)
  const interfaces = payload?.SPAirPortDataType?.[0]?.spairport_airport_interfaces ?? []
  const airportInterface = interfaces.find(item => item._name === wifiInterface) ?? interfaces[0]

  if (!airportInterface) {
    return {
      current: null,
      networks: []
    }
  }

  const current = parseSystemProfilerNetwork(airportInterface.spairport_current_network_information)
  const networks = (airportInterface.spairport_airport_other_local_wireless_networks ?? [])
    .map(network => parseSystemProfilerNetwork(network))
    .filter(Boolean)

  return {
    current,
    networks
  }
}

function parseSystemProfilerNetwork (network) {
  if (!network?._name) {
    return null
  }

  const signal = parseSignalNoise(network.spairport_signal_noise)

  return {
    ssid: network._name,
    bssid: '',
    rssi: signal.rssi,
    noise: signal.noise,
    channel: network.spairport_network_channel ?? '',
    txRate: toNumber(network.spairport_network_rate),
    maxRate: null,
    security: formatSystemProfilerSecurity(network.spairport_security_mode)
  }
}

function mergeWifiDetails (details, currentSsid = '') {
  const networks = Array.isArray(details?.networks) ? details.networks : []
  const matchedNetwork = currentSsid
    ? networks.find(network => network.ssid === currentSsid)
    : null
  const source = details?.current ?? matchedNetwork
  const ssid = currentSsid || source?.ssid || matchedNetwork?.ssid || (hasWifiAssociation(source) ? '当前网络' : '')

  return {
    current: ssid
      ? {
          ssid,
          bssid: source?.bssid || matchedNetwork?.bssid || '',
          rssi: source?.rssi ?? matchedNetwork?.rssi ?? null,
          noise: source?.noise ?? matchedNetwork?.noise ?? null,
          channel: source?.channel || matchedNetwork?.channel || '',
          txRate: source?.txRate ?? matchedNetwork?.txRate ?? null,
          maxRate: source?.maxRate ?? matchedNetwork?.maxRate ?? null,
          security: source?.security || matchedNetwork?.security || ''
        }
      : null,
    networks
  }
}

function withWifiNetworkGroups (details, preferredSsids = [], { includeHistory = true } = {}) {
  const groups = buildWifiNetworkGroups({
    current: details.current,
    networks: details.networks,
    preferredSsids
  })
  const historyNetworks = includeHistory ? groups.historyNetworks : []

  return {
    current: groups.current,
    networks: [
      ...groups.knownNetworks,
      ...groups.otherNetworks
    ],
    knownNetworks: groups.knownNetworks,
    otherNetworks: groups.otherNetworks,
    historyNetworks
  }
}

function buildWifiNetworkGroups ({ current = null, networks = [], preferredSsids = [] } = {}) {
  const preferred = dedupeSsids(preferredSsids)
  const preferredSet = new Set(preferred)
  const groupedNetworks = groupNetworksBySsid(networks)
  const currentNetworkSource = current
    ? resolveCurrentNetwork(current, groupedNetworks, preferredSet)
    : null
  const currentSsid = isNamedSsid(currentNetworkSource?.ssid) ? currentNetworkSource.ssid : ''
  const currentGroup = currentSsid ? groupedNetworks.get(currentSsid) : null
  const currentNetwork = currentNetworkSource
    ? decorateCurrentNetwork(currentNetworkSource, currentGroup, preferredSet)
    : null

  rememberCurrentNetwork(currentNetwork)

  const knownNetworks = preferred
    .filter(ssid => ssid !== currentSsid)
    .map(ssid => groupedNetworks.get(ssid))
    .filter(Boolean)
    .map(network => ({
      ...network,
      known: true
    }))
    .sort(sortWifiNetworks)
  const otherNetworks = [...groupedNetworks.values()]
    .filter(network => network.ssid !== currentSsid && !preferredSet.has(network.ssid))
    .map(network => ({
      ...network,
      known: false
    }))
    .sort(sortWifiNetworks)
  const historyNetworks = preferred
    .filter(ssid => ssid !== currentSsid && !groupedNetworks.has(ssid))
    .map(ssid => createUnavailableKnownNetwork(ssid))

  return {
    current: currentNetwork,
    knownNetworks,
    otherNetworks,
    historyNetworks
  }
}

function resolveCurrentNetwork (current, groupedNetworks, preferredSet) {
  if (isNamedSsid(current?.ssid)) {
    return current
  }

  const inferredSsid = inferCurrentSsid(current, groupedNetworks, preferredSet)

  if (inferredSsid) {
    return {
      ...current,
      ssid: inferredSsid,
      ssidInferred: true
    }
  }

  return restoreLastResolvedCurrentNetwork(current) ?? current
}

function inferCurrentSsid (current, groupedNetworks, preferredSet) {
  if (!hasWifiAssociation(current)) {
    return ''
  }

  const allCandidates = [...groupedNetworks.values()]
  const preferredCandidates = allCandidates.filter(network => preferredSet.has(network.ssid))
  const candidates = preferredCandidates.length > 0 ? preferredCandidates : allCandidates
  const scoredCandidates = candidates
    .map(network => ({
      network,
      score: scoreCurrentCandidate(current, network, preferredSet)
    }))
    .filter(candidate => candidate.score >= 5)
    .sort((left, right) => right.score - left.score)

  if (scoredCandidates.length === 0) {
    return ''
  }

  const best = scoredCandidates[0]
  const secondBest = scoredCandidates[1]

  if (secondBest && best.score - secondBest.score < 2) {
    return ''
  }

  return best.network.ssid
}

function groupNetworksBySsid (networks = []) {
  const groups = new Map()

  for (const network of networks) {
    if (!network?.ssid) {
      continue
    }

    const existing = groups.get(network.ssid)

    if (!existing) {
      groups.set(network.ssid, createGroupedNetwork(network))
      continue
    }

    existing.accessPointCount += 1
    addUnique(existing.channels, network.channel)
    addUnique(existing.securities, network.security)

    if (isBetterWifiNetwork(network, existing)) {
      Object.assign(existing, {
        ...network,
        bssid: '',
        available: true,
        accessPointCount: existing.accessPointCount,
        channels: existing.channels,
        securities: existing.securities
      })
    }
  }

  return groups
}

function createGroupedNetwork (network) {
  return {
    ...network,
    bssid: '',
    available: true,
    connected: false,
    known: false,
    accessPointCount: 1,
    channels: [network.channel].filter(Boolean),
    securities: [network.security].filter(Boolean)
  }
}

function decorateCurrentNetwork (current, currentGroup, preferredSet) {
  const currentSsid = isNamedSsid(current?.ssid) ? current.ssid : ''

  return {
    ...current,
    bssid: '',
    rssi: current.rssi ?? currentGroup?.rssi ?? null,
    noise: current.noise ?? currentGroup?.noise ?? null,
    channel: current.channel || currentGroup?.channel || '',
    txRate: current.txRate ?? currentGroup?.txRate ?? null,
    maxRate: current.maxRate ?? currentGroup?.maxRate ?? null,
    security: current.security || currentGroup?.security || '',
    available: true,
    connected: true,
    known: currentSsid ? preferredSet.has(currentSsid) : false,
    accessPointCount: currentGroup?.accessPointCount ?? 1,
    channels: currentGroup?.channels ?? [current.channel].filter(Boolean),
    securities: currentGroup?.securities ?? [current.security].filter(Boolean)
  }
}

function createUnavailableKnownNetwork (ssid) {
  return {
    ssid,
    bssid: '',
    rssi: null,
    noise: null,
    channel: '',
    txRate: null,
    maxRate: null,
    security: '',
    available: false,
    connected: false,
    known: true,
    accessPointCount: 0,
    channels: [],
    securities: []
  }
}

function rememberCurrentNetwork (network) {
  if (!isNamedSsid(network?.ssid)) {
    return
  }

  lastResolvedCurrentNetwork = {
    ssid: network.ssid,
    channel: network.channel || '',
    security: network.security || ''
  }
}

function restoreLastResolvedCurrentNetwork (current) {
  if (!lastResolvedCurrentNetwork || !hasWifiAssociation(current)) {
    return null
  }

  if (
    current.security &&
    lastResolvedCurrentNetwork.security &&
    !securityMatches(current.security, lastResolvedCurrentNetwork.security)
  ) {
    return null
  }

  return {
    ...current,
    ssid: lastResolvedCurrentNetwork.ssid,
    ssidRemembered: true
  }
}

function dedupeSsids (ssids = []) {
  const seen = new Set()
  const uniqueSsids = []

  for (const ssid of ssids) {
    const normalizedSsid = String(ssid ?? '').trim()

    if (!normalizedSsid || seen.has(normalizedSsid)) {
      continue
    }

    seen.add(normalizedSsid)
    uniqueSsids.push(normalizedSsid)
  }

  return uniqueSsids
}

function addUnique (items, value) {
  if (value && !items.includes(value)) {
    items.push(value)
  }
}

function isNamedSsid (ssid) {
  return Boolean(ssid && ssid !== '当前网络')
}

function isBetterWifiNetwork (candidate, current) {
  if (typeof candidate.rssi === 'number' && typeof current.rssi === 'number') {
    return candidate.rssi > current.rssi
  }

  if (typeof candidate.rssi === 'number') return true
  if (typeof current.rssi === 'number') return false

  return candidate.ssid.localeCompare(current.ssid) < 0
}

function scoreCurrentCandidate (current, network, preferredSet) {
  let score = preferredSet.has(network.ssid) ? 2 : 0

  if (securityMatches(current.security, network.security)) {
    score += 4
  }

  if (current.channel && network.channel) {
    if (current.channel === network.channel) {
      score += 4
    } else if (getChannelBand(current.channel) && getChannelBand(current.channel) === getChannelBand(network.channel)) {
      score += 1
    }
  }

  if (typeof current.rssi === 'number' && typeof network.rssi === 'number') {
    const diff = Math.abs(current.rssi - network.rssi)

    if (diff <= 6) {
      score += 3
    } else if (diff <= 12) {
      score += 2
    } else if (diff <= 20) {
      score += 1
    }
  }

  return score
}

function securityMatches (left, right) {
  const leftSecurity = String(left ?? '').trim().toLowerCase()
  const rightSecurity = String(right ?? '').trim().toLowerCase()

  if (!leftSecurity || !rightSecurity) {
    return false
  }

  return leftSecurity === rightSecurity || getSecurityFamily(leftSecurity) === getSecurityFamily(rightSecurity)
}

function getSecurityFamily (security) {
  if (/enterprise|802\.?1x/.test(security)) return 'enterprise'
  if (/personal|psk|wpa/.test(security)) return 'personal'
  if (/owe/.test(security)) return 'enhanced-open'
  return security
}

function getChannelBand (channel) {
  return String(channel).match(/\((2|5|6)GHz/)?.[1] ?? ''
}

function hasWifiAssociation (network) {
  return Boolean(
    network &&
    (
      (typeof network.rssi === 'number' && network.rssi !== 0) ||
      (typeof network.txRate === 'number' && network.txRate > 0) ||
      network.channel ||
      network.security
    )
  )
}

function normalizeWifiNetwork (network, { allowEmptySsid = false } = {}) {
  const ssid = String(network?.ssid ?? '').trim()

  if (!allowEmptySsid && !ssid) {
    return null
  }

  if (allowEmptySsid && !network) {
    return null
  }

  return {
    ssid,
    bssid: String(network?.bssid ?? '').trim(),
    rssi: toNumber(network?.rssi),
    noise: toNumber(network?.noise),
    channel: String(network?.channel ?? '').trim(),
    txRate: toNumber(network?.txRate),
    maxRate: toNumber(network?.maxRate),
    security: String(network?.security ?? '').trim()
  }
}

function sortWifiNetworks (left, right) {
  if (typeof left.rssi === 'number' && typeof right.rssi === 'number' && left.rssi !== right.rssi) {
    return right.rssi - left.rssi
  }

  if (typeof left.rssi === 'number') return -1
  if (typeof right.rssi === 'number') return 1

  return left.ssid.localeCompare(right.ssid)
}

function parseSignalNoise (value = '') {
  const match = String(value).match(/(-?\d+)\s*dBm\s*\/\s*(-?\d+)\s*dBm/)

  return {
    rssi: match ? Number(match[1]) : null,
    noise: match ? Number(match[2]) : null
  }
}

function formatSystemProfilerSecurity (value = '') {
  return String(value)
    .replace(/^spairport_security_mode_/, '')
    .replaceAll('_', ' ')
}

function safeParseJson (text) {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function getWifiSettingsInvocationCandidates () {
  return WIFI_SETTINGS_URLS.map(url => ({
    command: OPEN,
    args: [url]
  }))
}

function normalizeWifiPower (power) {
  if (power === 'on' || power === true) return 'on'
  if (power === 'off' || power === false) return 'off'
  throw new Error(`Unsupported Wi-Fi power state: ${power}`)
}

function normalizeWifiSsid (ssid) {
  const normalizedSsid = String(ssid ?? '').trim()

  if (!normalizedSsid) {
    throw new Error('Wi-Fi network name is required')
  }

  return normalizedSsid
}

function toNumber (value) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function assertMacOS (platform = process.platform) {
  if (platform !== 'darwin') {
    throw new Error('uTools Plus only supports macOS')
  }
}

module.exports = {
  clearWifiSnapshotCache,
  buildWifiNetworkGroups,
  connectWifiNetwork,
  getWifiSettingsInvocationCandidates,
  getWifiSnapshot,
  normalizeWifiPower,
  openWifiSettings,
  parseAirportCurrent,
  parseAirportScan,
  parseHardwarePorts,
  parseNativeWifiHelperResponse,
  parseNetworksetupCurrentSsid,
  parsePreferredWifiNetworks,
  parseSystemProfilerWifi,
  parseWifiPower,
  readNativeWifiDetails,
  readNetworksetupCurrentSsid,
  readPreferredWifiNetworks,
  readSystemProfilerWifi,
  readCurrentNetwork,
  readWifiDetails,
  readWifiPower,
  resolveAirportCommand,
  resolveNativeWifiInvocation,
  resolveWifiInterface,
  scanWifiNetworks,
  setWifiPower
}
