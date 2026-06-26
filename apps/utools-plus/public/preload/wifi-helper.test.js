const test = require('node:test')
const assert = require('node:assert/strict')
const path = require('node:path')

const {
  clearWifiSnapshotCache,
  connectWifiNetwork,
  getWifiSettingsInvocationCandidates,
  getWifiSnapshot,
  parseAirportCurrent,
  parseAirportScan,
  parseHardwarePorts,
  parseNativeWifiHelperResponse,
  parseNetworksetupCurrentSsid,
  parsePreferredWifiNetworks,
  parseSystemProfilerWifi,
  parseWifiPower,
  resolveAirportCommand,
  resolveNativeWifiInvocation,
  readNativeWifiDetails,
  readWifiDetails,
  buildWifiNetworkGroups,
  resolveWifiInterface
} = require('./wifi-helper')

const HARDWARE_PORTS = `Hardware Port: Ethernet
Device: en7
Ethernet Address: 00:11:22:33:44:55

Hardware Port: Wi-Fi
Device: en0
Ethernet Address: aa:bb:cc:dd:ee:ff
`

const AIRPORT_CURRENT = `     agrCtlRSSI: -54
     agrExtRSSI: 0
    agrCtlNoise: -92
          state: running
        op mode: station
     lastTxRate: 573
        maxRate: 866
lastAssocStatus: 0
          802.11 auth: open
            link auth: wpa2-psk
                BSSID: 00:11:22:33:44:55
                 SSID: Studio WiFi
                  MCS: 11
              channel: 149,80
`

const AIRPORT_SCAN = `                            SSID BSSID             RSSI CHANNEL HT CC SECURITY (auth/unicast/group)
                    Studio WiFi 00:11:22:33:44:55 -54  149     Y  -- WPA2(PSK/AES/AES)
                      Guest Net aa:bb:cc:dd:ee:ff -70  6       Y  -- WPA2(PSK/AES/AES)
`

const PREFERRED_WIFI_NETWORKS = `Preferred networks on en0:
\tStudio WiFi
\tGuest Net
\tOffice WiFi
`

const SYSTEM_PROFILER_WIFI = JSON.stringify({
  SPAirPortDataType: [
    {
      spairport_airport_interfaces: [
        {
          _name: 'en0',
          spairport_current_network_information: {
            _name: 'Studio WiFi',
            spairport_network_channel: '40 (5GHz, 160MHz)',
            spairport_network_rate: 1200,
            spairport_security_mode: 'spairport_security_mode_wpa2_personal',
            spairport_signal_noise: '-42 dBm / -92 dBm'
          },
          spairport_airport_other_local_wireless_networks: [
            {
              _name: 'Studio WiFi',
              spairport_network_channel: '40 (5GHz, 160MHz)',
              spairport_security_mode: 'spairport_security_mode_wpa2_personal',
              spairport_signal_noise: '-42 dBm / -92 dBm'
            },
            {
              _name: 'Guest Net',
              spairport_network_channel: '6 (2GHz, 20MHz)',
              spairport_security_mode: 'spairport_security_mode_wpa2_personal_mixed'
            }
          ]
        }
      ]
    }
  ]
})

const NATIVE_WIFI_HELPER = JSON.stringify({
  ok: true,
  current: {
    ssid: '',
    bssid: '',
    rssi: -54,
    noise: -92,
    channel: '37 (6GHz, 80MHz)',
    txRate: 864,
    maxRate: null,
    security: 'wpa2 enterprise'
  },
  networks: [
    {
      ssid: 'Studio WiFi',
      bssid: '00:11:22:33:44:55',
      rssi: -54,
      noise: -92,
      channel: '37 (6GHz, 80MHz)',
      txRate: null,
      maxRate: null,
      security: 'wpa2 enterprise'
    },
    {
      ssid: 'Guest Net',
      bssid: 'aa:bb:cc:dd:ee:ff',
      rssi: -70,
      noise: -90,
      channel: '6 (2GHz, 20MHz)',
      txRate: null,
      maxRate: null,
      security: 'wpa2 personal'
    },
    {
      ssid: 'Guest Net',
      bssid: 'aa:bb:cc:dd:ee:11',
      rssi: -61,
      noise: -88,
      channel: '11 (2GHz, 20MHz)',
      txRate: null,
      maxRate: null,
      security: 'wpa2 personal'
    },
    {
      ssid: 'Coffee WiFi',
      bssid: 'cc:dd:ee:ff:00:11',
      rssi: -64,
      noise: -91,
      channel: '44 (5GHz, 40MHz)',
      txRate: null,
      maxRate: null,
      security: ''
    }
  ]
})

const NATIVE_WIFI_CURRENT_HELPER = JSON.stringify({
  ok: true,
  current: {
    ssid: '',
    bssid: '',
    rssi: -54,
    noise: -92,
    channel: '37 (6GHz, 80MHz)',
    txRate: 864,
    maxRate: null,
    security: 'wpa2 enterprise'
  },
  networks: []
})

function createWifiSnapshotRunner () {
  const calls = []
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')

  return {
    bundledHelper,
    calls,
    exists: candidate => candidate === bundledHelper,
    runner: async (command, args) => {
      calls.push({ command, args })

      if (command === '/usr/sbin/networksetup' && args[0] === '-listallhardwareports') {
        return { stdout: HARDWARE_PORTS }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-getairportpower') {
        return { stdout: 'Wi-Fi Power (en0): On\n' }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-getairportnetwork') {
        return { stdout: 'Current Wi-Fi Network: Studio WiFi\n' }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-listpreferredwirelessnetworks') {
        return { stdout: PREFERRED_WIFI_NETWORKS }
      }

      if (command === bundledHelper && args[0] === 'snapshot') {
        return { stdout: NATIVE_WIFI_HELPER }
      }

      if (command === bundledHelper && args[0] === 'current') {
        return { stdout: NATIVE_WIFI_CURRENT_HELPER }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  }
}

test('parseHardwarePorts returns the Wi-Fi interface device', () => {
  assert.equal(parseHardwarePorts(HARDWARE_PORTS), 'en0')
})

test('getWifiSnapshot returns cached data inside the cache window', async () => {
  clearWifiSnapshotCache()
  const { calls, exists, runner } = createWifiSnapshotRunner()

  const first = await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    now: 1000,
    cacheTtlMs: 10000
  })
  const second = await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    now: 1500,
    cacheTtlMs: 10000
  })

  assert.deepEqual(second, first)
  assert.equal(calls.filter(call => call.command.endsWith('/wifi-helper')).length, 1)
})

test('getWifiSnapshot forceRefresh bypasses cached Wi-Fi data', async () => {
  clearWifiSnapshotCache()
  const { calls, exists, runner } = createWifiSnapshotRunner()

  await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    now: 1000,
    cacheTtlMs: 10000
  })
  await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    now: 1500,
    cacheTtlMs: 10000,
    forceRefresh: true
  })

  assert.equal(calls.filter(call => call.command.endsWith('/wifi-helper')).length, 2)
})

test('getWifiSnapshot can return a fast current snapshot without scanning networks', async () => {
  clearWifiSnapshotCache()
  const { calls, exists, runner } = createWifiSnapshotRunner()

  const snapshot = await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    scan: false,
    cache: false
  })

  assert.equal(snapshot.scanning, true)
  assert.equal(snapshot.current.ssid, 'Studio WiFi')
  assert.equal(snapshot.current.rssi, -54)
  assert.deepEqual(snapshot.networks, [])
  assert.deepEqual(snapshot.knownNetworks, [])
  assert.deepEqual(snapshot.otherNetworks, [])
  assert.deepEqual(snapshot.historyNetworks, [])
  assert.deepEqual(calls.find(call => call.command.endsWith('/wifi-helper')), {
    command: path.join(__dirname, 'bin', 'wifi-helper'),
    args: ['current', 'en0']
  })
})

test('getWifiSnapshot returns full cached data even for a fast snapshot request', async () => {
  clearWifiSnapshotCache()
  const { calls, exists, runner } = createWifiSnapshotRunner()

  const first = await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    now: 1000,
    cacheTtlMs: 10000
  })
  const second = await getWifiSnapshot({
    platform: 'darwin',
    exists,
    runner,
    now: 1500,
    cacheTtlMs: 10000,
    scan: false
  })

  assert.deepEqual(second, first)
  assert.equal(second.networks.length, 2)
  assert.equal(calls.filter(call => call.command.endsWith('/wifi-helper')).length, 1)
})

test('connectWifiNetwork switches to a Wi-Fi network without a password', async () => {
  clearWifiSnapshotCache()
  const calls = []

  const result = await connectWifiNetwork('Guest Net', {
    platform: 'darwin',
    runner: async (command, args) => {
      calls.push({ command, args })

      if (command === '/usr/sbin/networksetup' && args[0] === '-listallhardwareports') {
        return { stdout: HARDWARE_PORTS }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-setairportnetwork') {
        return { stdout: '' }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  })

  assert.deepEqual(result, {
    ok: true,
    action: 'connect-wifi-network',
    interface: 'en0',
    ssid: 'Guest Net'
  })
  assert.deepEqual(calls, [
    {
      command: '/usr/sbin/networksetup',
      args: ['-listallhardwareports']
    },
    {
      command: '/usr/sbin/networksetup',
      args: ['-setairportnetwork', 'en0', 'Guest Net']
    }
  ])
})

test('connectWifiNetwork passes a password when provided', async () => {
  const calls = []

  await connectWifiNetwork('Secure Net', {
    password: 'secret-passphrase',
    platform: 'darwin',
    runner: async (command, args) => {
      calls.push({ command, args })

      if (command === '/usr/sbin/networksetup' && args[0] === '-listallhardwareports') {
        return { stdout: HARDWARE_PORTS }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-setairportnetwork') {
        return { stdout: '' }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  })

  assert.deepEqual(calls[1], {
    command: '/usr/sbin/networksetup',
    args: ['-setairportnetwork', 'en0', 'Secure Net', 'secret-passphrase']
  })
})

test('connectWifiNetwork rejects empty network names', async () => {
  await assert.rejects(
    () => connectWifiNetwork(' ', { platform: 'darwin' }),
    /Wi-Fi network name is required/
  )
})

test('parseWifiPower maps networksetup output to stable states', () => {
  assert.equal(parseWifiPower('Wi-Fi Power (en0): On'), 'on')
  assert.equal(parseWifiPower('Wi-Fi Power (en0): Off'), 'off')
  assert.equal(parseWifiPower(''), 'unknown')
})

test('parseNetworksetupCurrentSsid reads the current associated network name', () => {
  assert.equal(
    parseNetworksetupCurrentSsid('Current Wi-Fi Network: Studio WiFi\n'),
    'Studio WiFi'
  )
  assert.equal(
    parseNetworksetupCurrentSsid('You are not associated with an AirPort network.\n'),
    ''
  )
})

test('parsePreferredWifiNetworks reads saved network history', () => {
  assert.deepEqual(parsePreferredWifiNetworks(PREFERRED_WIFI_NETWORKS), [
    'Studio WiFi',
    'Guest Net',
    'Office WiFi'
  ])
})

test('buildWifiNetworkGroups separates current, known, other, and history networks', () => {
  const groups = buildWifiNetworkGroups({
    current: {
      ssid: 'Studio WiFi',
      bssid: '',
      rssi: -54,
      noise: -92,
      channel: '37 (6GHz, 80MHz)',
      txRate: 864,
      maxRate: null,
      security: 'wpa2 enterprise'
    },
    networks: [
      {
        ssid: 'Studio WiFi',
        bssid: '00:11:22:33:44:55',
        rssi: -54,
        noise: -92,
        channel: '37 (6GHz, 80MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 enterprise'
      },
      {
        ssid: 'Guest Net',
        bssid: 'aa:bb:cc:dd:ee:ff',
        rssi: -70,
        noise: -90,
        channel: '6 (2GHz, 20MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 personal'
      },
      {
        ssid: 'Guest Net',
        bssid: 'aa:bb:cc:dd:ee:11',
        rssi: -61,
        noise: -88,
        channel: '11 (2GHz, 20MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 personal'
      },
      {
        ssid: 'Coffee WiFi',
        bssid: 'cc:dd:ee:ff:00:11',
        rssi: -64,
        noise: -91,
        channel: '44 (5GHz, 40MHz)',
        txRate: null,
        maxRate: null,
        security: ''
      }
    ],
    preferredSsids: ['Studio WiFi', 'Guest Net', 'Office WiFi']
  })

  assert.equal(groups.current.known, true)
  assert.equal(groups.current.connected, true)
  assert.deepEqual(groups.knownNetworks.map(network => network.ssid), ['Guest Net'])
  assert.equal(groups.knownNetworks[0].rssi, -61)
  assert.equal(groups.knownNetworks[0].accessPointCount, 2)
  assert.deepEqual(groups.otherNetworks.map(network => network.ssid), ['Coffee WiFi'])
  assert.deepEqual(groups.historyNetworks.map(network => network.ssid), ['Office WiFi'])
})

test('parseAirportCurrent reads current Wi-Fi association details', () => {
  assert.deepEqual(parseAirportCurrent(AIRPORT_CURRENT), {
    ssid: 'Studio WiFi',
    bssid: '00:11:22:33:44:55',
    rssi: -54,
    noise: -92,
    channel: '149,80',
    txRate: 573,
    maxRate: 866,
    security: 'wpa2-psk'
  })
})

test('parseAirportScan reads visible networks from airport table output', () => {
  assert.deepEqual(parseAirportScan(AIRPORT_SCAN), [
    {
      ssid: 'Studio WiFi',
      bssid: '00:11:22:33:44:55',
      rssi: -54,
      channel: '149',
      security: 'WPA2(PSK/AES/AES)'
    },
    {
      ssid: 'Guest Net',
      bssid: 'aa:bb:cc:dd:ee:ff',
      rssi: -70,
      channel: '6',
      security: 'WPA2(PSK/AES/AES)'
    }
  ])
})

test('parseSystemProfilerWifi reads current and nearby networks when airport is unavailable', () => {
  assert.deepEqual(parseSystemProfilerWifi(SYSTEM_PROFILER_WIFI, 'en0'), {
    current: {
      ssid: 'Studio WiFi',
      bssid: '',
      rssi: -42,
      noise: -92,
      channel: '40 (5GHz, 160MHz)',
      txRate: 1200,
      maxRate: null,
      security: 'wpa2 personal'
    },
    networks: [
      {
        ssid: 'Studio WiFi',
        bssid: '',
        rssi: -42,
        noise: -92,
        channel: '40 (5GHz, 160MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 personal'
      },
      {
        ssid: 'Guest Net',
        bssid: '',
        rssi: null,
        noise: null,
        channel: '6 (2GHz, 20MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 personal mixed'
      }
    ]
  })
})

test('parseNativeWifiHelperResponse reads CoreWLAN current metrics and nearby networks', () => {
  assert.deepEqual(parseNativeWifiHelperResponse(NATIVE_WIFI_HELPER), {
    current: {
      ssid: '',
      bssid: '',
      rssi: -54,
      noise: -92,
      channel: '37 (6GHz, 80MHz)',
      txRate: 864,
      maxRate: null,
      security: 'wpa2 enterprise'
    },
    networks: [
      {
        ssid: 'Studio WiFi',
        bssid: '00:11:22:33:44:55',
        rssi: -54,
        noise: -92,
        channel: '37 (6GHz, 80MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 enterprise'
      },
      {
        ssid: 'Guest Net',
        bssid: 'aa:bb:cc:dd:ee:11',
        rssi: -61,
        noise: -88,
        channel: '11 (2GHz, 20MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 personal'
      },
      {
        ssid: 'Coffee WiFi',
        bssid: 'cc:dd:ee:ff:00:11',
        rssi: -64,
        noise: -91,
        channel: '44 (5GHz, 40MHz)',
        txRate: null,
        maxRate: null,
        security: ''
      },
      {
        ssid: 'Guest Net',
        bssid: 'aa:bb:cc:dd:ee:ff',
        rssi: -70,
        noise: -90,
        channel: '6 (2GHz, 20MHz)',
        txRate: null,
        maxRate: null,
        security: 'wpa2 personal'
      }
    ]
  })
})

test('readWifiDetails prefers native CoreWLAN scan and keeps networksetup current SSID', async () => {
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')
  const calls = []

  const details = await readWifiDetails('en0', {
    exists: candidate => candidate === bundledHelper,
    runner: async (command, args) => {
      calls.push({ command, args })

      if (command === '/usr/sbin/networksetup' && args[0] === '-getairportnetwork') {
        return { stdout: 'Current Wi-Fi Network: Studio WiFi\n' }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-listpreferredwirelessnetworks') {
        return { stdout: PREFERRED_WIFI_NETWORKS }
      }

      if (command === bundledHelper) {
        return { stdout: NATIVE_WIFI_HELPER }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  })

  assert.equal(details.current.ssid, 'Studio WiFi')
  assert.equal(details.current.connected, true)
  assert.equal(details.current.known, true)
  assert.equal(details.current.rssi, -54)
  assert.equal(details.current.security, 'wpa2 enterprise')
  assert.deepEqual(details.knownNetworks.map(network => network.ssid), ['Guest Net'])
  assert.deepEqual(details.otherNetworks.map(network => network.ssid), ['Coffee WiFi'])
  assert.deepEqual(details.historyNetworks.map(network => network.ssid), ['Office WiFi'])
  assert.equal(details.networks.length, 2)
  assert.deepEqual(calls, [
    {
      command: '/usr/sbin/networksetup',
      args: ['-getairportnetwork', 'en0']
    },
    {
      command: '/usr/sbin/networksetup',
      args: ['-listpreferredwirelessnetworks', 'en0']
    },
    {
      command: bundledHelper,
      args: ['snapshot', 'en0']
    }
  ])
})

test('readWifiDetails infers the current network when macOS hides the current SSID', async () => {
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')

  const details = await readWifiDetails('en0', {
    exists: candidate => candidate === bundledHelper,
    runner: async (command, args) => {
      if (command === '/usr/sbin/networksetup' && args[0] === '-getairportnetwork') {
        return { stdout: 'You are not associated with an AirPort network.\n' }
      }

      if (command === '/usr/sbin/networksetup' && args[0] === '-listpreferredwirelessnetworks') {
        return { stdout: PREFERRED_WIFI_NETWORKS }
      }

      if (command === bundledHelper) {
        return { stdout: NATIVE_WIFI_HELPER }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  })

  assert.equal(details.current.ssid, 'Studio WiFi')
  assert.equal(details.current.ssidInferred, true)
  assert.equal(details.current.connected, true)
  assert.equal(details.current.known, true)
  assert.equal(details.current.rssi, -54)
  assert.equal(details.current.security, 'wpa2 enterprise')
  assert.deepEqual(details.knownNetworks.map(network => network.ssid), ['Guest Net'])
})

test('getWifiSnapshot reuses the last resolved current SSID while fast refresh is scanning', async () => {
  clearWifiSnapshotCache()
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')

  const runner = async (command, args) => {
    if (command === '/usr/sbin/networksetup' && args[0] === '-listallhardwareports') {
      return { stdout: HARDWARE_PORTS }
    }

    if (command === '/usr/sbin/networksetup' && args[0] === '-getairportpower') {
      return { stdout: 'Wi-Fi Power (en0): On\n' }
    }

    if (command === '/usr/sbin/networksetup' && args[0] === '-getairportnetwork') {
      return { stdout: 'You are not associated with an AirPort network.\n' }
    }

    if (command === '/usr/sbin/networksetup' && args[0] === '-listpreferredwirelessnetworks') {
      return { stdout: PREFERRED_WIFI_NETWORKS }
    }

    if (command === bundledHelper && args[0] === 'snapshot') {
      return { stdout: NATIVE_WIFI_HELPER }
    }

    if (command === bundledHelper && args[0] === 'current') {
      return { stdout: NATIVE_WIFI_CURRENT_HELPER }
    }

    throw new Error(`Unexpected command: ${command}`)
  }

  await getWifiSnapshot({
    platform: 'darwin',
    exists: candidate => candidate === bundledHelper,
    runner,
    cache: false
  })
  const snapshot = await getWifiSnapshot({
    platform: 'darwin',
    exists: candidate => candidate === bundledHelper,
    runner,
    scan: false,
    cache: false
  })

  assert.equal(snapshot.current.ssid, 'Studio WiFi')
  assert.equal(snapshot.current.ssidRemembered, true)
  assert.equal(snapshot.scanning, true)
})

test('resolveNativeWifiInvocation prefers the Swift source helper for Wi-Fi SSID access', () => {
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')
  const helperSource = path.join(__dirname, 'native', 'wifi-helper.swift')
  const invocation = resolveNativeWifiInvocation(
    'en0',
    candidate => candidate === bundledHelper || candidate === helperSource
  )

  assert.deepEqual(invocation, {
    command: '/usr/bin/swift',
    args: [
      helperSource,
      'snapshot',
      'en0'
    ]
  })
})

test('resolveNativeWifiInvocation prefers the compiled helper for current-only reads', () => {
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')
  const helperSource = path.join(__dirname, 'native', 'wifi-helper.swift')
  const invocation = resolveNativeWifiInvocation(
    'en0',
    candidate => candidate === bundledHelper || candidate === helperSource,
    'current'
  )

  assert.deepEqual(invocation, {
    command: bundledHelper,
    args: ['current', 'en0']
  })
})

test('readNativeWifiDetails falls back to the compiled helper when Swift is unavailable', async () => {
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')
  const helperSource = path.join(__dirname, 'native', 'wifi-helper.swift')
  const calls = []

  const details = await readNativeWifiDetails('en0', {
    exists: candidate => candidate === bundledHelper || candidate === helperSource,
    runner: async (command, args) => {
      calls.push({ command, args })

      if (command === '/usr/bin/swift') {
        throw new Error('Swift unavailable')
      }

      if (command === bundledHelper) {
        return { stdout: NATIVE_WIFI_HELPER }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  })

  assert.equal(details.networks.length, 4)
  assert.deepEqual(calls, [
    {
      command: '/usr/bin/swift',
      args: [
        helperSource,
        'snapshot',
        'en0'
      ]
    },
    {
      command: bundledHelper,
      args: ['snapshot', 'en0']
    }
  ])
})

test('readNativeWifiDetails falls back when the Swift helper returns no payload', async () => {
  const bundledHelper = path.join(__dirname, 'bin', 'wifi-helper')
  const helperSource = path.join(__dirname, 'native', 'wifi-helper.swift')

  const details = await readNativeWifiDetails('en0', {
    exists: candidate => candidate === bundledHelper || candidate === helperSource,
    runner: async (command) => {
      if (command === '/usr/bin/swift') {
        return {
          stdout: JSON.stringify({
            ok: false,
            error: {
              message: 'CoreWLAN scan failed'
            }
          })
        }
      }

      if (command === bundledHelper) {
        return { stdout: NATIVE_WIFI_HELPER }
      }

      throw new Error(`Unexpected command: ${command}`)
    }
  })

  assert.equal(details.networks.length, 4)
})

test('resolveWifiInterface prefers configured Wi-Fi hardware port', async () => {
  const calls = []
  const wifiInterface = await resolveWifiInterface({
    platform: 'darwin',
    runner: async (command, args) => {
      calls.push({ command, args })
      return { stdout: HARDWARE_PORTS }
    }
  })

  assert.equal(wifiInterface, 'en0')
  assert.deepEqual(calls[0], {
    command: '/usr/sbin/networksetup',
    args: ['-listallhardwareports']
  })
})

test('resolveAirportCommand prefers the bundled macOS airport utility', () => {
  assert.equal(
    resolveAirportCommand(candidate => candidate.endsWith('/airport')),
    '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport'
  )
})

test('getWifiSettingsInvocationCandidates keeps modern and legacy Wi-Fi settings URLs', () => {
  assert.deepEqual(getWifiSettingsInvocationCandidates(), [
    {
      command: '/usr/bin/open',
      args: ['x-apple.systempreferences:com.apple.Wi-Fi-Settings.extension']
    },
    {
      command: '/usr/bin/open',
      args: ['x-apple.systempreferences:com.apple.wifi-settings-extension']
    },
    {
      command: '/usr/bin/open',
      args: ['x-apple.systempreferences:com.apple.preference.network?Wi-Fi']
    }
  ])
})
