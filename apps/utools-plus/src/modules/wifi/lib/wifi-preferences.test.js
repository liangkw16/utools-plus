import assert from 'node:assert/strict'
import test from 'node:test'
import {
  WIFI_PREFERENCES_STORAGE_KEY,
  normalizeWifiPreferences,
  readWifiPreferences,
  rememberWifiCurrentNetwork,
  resolveRememberedCurrentNetwork,
  writeWifiPreferences
} from './wifi-preferences.js'

test('normalizeWifiPreferences keeps only a stable remembered current network', () => {
  assert.deepEqual(normalizeWifiPreferences({
    currentNetwork: {
      ssid: '  Studio WiFi  ',
      security: 'wpa2 enterprise',
      updatedAt: 1234
    }
  }), {
    currentNetwork: {
      ssid: 'Studio WiFi',
      security: 'wpa2 enterprise',
      updatedAt: 1234
    }
  })

  assert.deepEqual(normalizeWifiPreferences({
    currentNetwork: {
      ssid: '当前网络',
      security: 'wpa2 enterprise'
    }
  }), {
    currentNetwork: null
  })
})

test('readWifiPreferences falls back cleanly when storage is empty or broken', () => {
  const emptyStorage = {
    getItem: () => null
  }
  const brokenStorage = {
    getItem: () => '{'
  }

  assert.deepEqual(readWifiPreferences(emptyStorage), {
    currentNetwork: null
  })
  assert.deepEqual(readWifiPreferences(brokenStorage), {
    currentNetwork: null
  })
})

test('writeWifiPreferences saves normalized data under a stable key', () => {
  const values = new Map()
  const storage = {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value)
  }

  writeWifiPreferences({
    currentNetwork: {
      ssid: 'Studio WiFi',
      security: 'wpa2 enterprise',
      updatedAt: 1234
    }
  }, storage)

  assert.deepEqual(JSON.parse(values.get(WIFI_PREFERENCES_STORAGE_KEY)), {
    currentNetwork: {
      ssid: 'Studio WiFi',
      security: 'wpa2 enterprise',
      updatedAt: 1234
    }
  })
})

test('rememberWifiCurrentNetwork stores only confirmed current SSIDs', () => {
  const previous = {
    currentNetwork: null
  }

  assert.deepEqual(rememberWifiCurrentNetwork(previous, {
    ssid: '当前网络',
    connected: true,
    security: 'wpa2 enterprise'
  }, 1000), previous)

  assert.deepEqual(rememberWifiCurrentNetwork(previous, {
    ssid: 'Studio WiFi',
    connected: true,
    security: 'wpa2 enterprise'
  }, 1000), {
    currentNetwork: {
      ssid: 'Studio WiFi',
      security: 'wpa2 enterprise',
      updatedAt: 1000
    }
  })
})

test('resolveRememberedCurrentNetwork reuses cache only when the fast current snapshot matches', () => {
  const remembered = {
    ssid: 'Studio WiFi',
    security: 'wpa2 enterprise',
    updatedAt: 1000
  }

  assert.deepEqual(resolveRememberedCurrentNetwork({
    ssid: '当前网络',
    connected: true,
    security: 'wpa2 enterprise'
  }, remembered), remembered)

  assert.equal(resolveRememberedCurrentNetwork({
    ssid: '当前网络',
    connected: true,
    security: 'wpa2 personal'
  }, remembered), null)

  assert.equal(resolveRememberedCurrentNetwork({
    ssid: 'Other WiFi',
    connected: true,
    security: 'wpa2 enterprise'
  }, remembered), null)
})
