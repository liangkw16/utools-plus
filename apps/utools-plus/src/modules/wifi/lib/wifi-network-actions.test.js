import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getWifiConnectionErrorMessage,
  getWifiNetworkActionLabel,
  isConnectableWifiNetwork,
  requiresWifiPassword
} from './wifi-network-actions.js'

test('isConnectableWifiNetwork allows visible non-current networks', () => {
  assert.equal(isConnectableWifiNetwork({
    ssid: 'Guest Net',
    available: true,
    connected: false
  }), true)
  assert.equal(isConnectableWifiNetwork({
    ssid: 'Studio WiFi',
    available: true,
    connected: true
  }), false)
  assert.equal(isConnectableWifiNetwork({
    ssid: 'Office WiFi',
    available: false,
    connected: false
  }), false)
})

test('requiresWifiPassword skips known and open networks', () => {
  assert.equal(requiresWifiPassword({
    ssid: 'Known Net',
    known: true,
    security: 'wpa2 personal'
  }), false)
  assert.equal(requiresWifiPassword({
    ssid: 'Open Net',
    known: false,
    security: ''
  }), false)
  assert.equal(requiresWifiPassword({
    ssid: 'Enhanced Open',
    known: false,
    security: 'owe transition'
  }), false)
  assert.equal(requiresWifiPassword({
    ssid: 'Secure Net',
    known: false,
    security: 'wpa3 personal'
  }), true)
})

test('getWifiNetworkActionLabel reflects connection state', () => {
  assert.equal(getWifiNetworkActionLabel({
    ssid: 'Studio WiFi',
    connected: true
  }, ''), '已连接')
  assert.equal(getWifiNetworkActionLabel({
    ssid: 'Guest Net',
    connected: false
  }, 'Guest Net'), '连接中')
  assert.equal(getWifiNetworkActionLabel({
    ssid: 'Guest Net',
    connected: false
  }, ''), '连接')
})

test('getWifiConnectionErrorMessage translates common networksetup failures', () => {
  assert.equal(
    getWifiConnectionErrorMessage(new Error('The Wi-Fi network could not be joined.')),
    '无法加入该 Wi-Fi 网络。'
  )
  assert.equal(
    getWifiConnectionErrorMessage(new Error('Error: -3905')),
    'Wi-Fi 密码可能不正确。'
  )
  assert.equal(
    getWifiConnectionErrorMessage(new Error('unknown failure')),
    '切换 Wi-Fi 失败。'
  )
})
