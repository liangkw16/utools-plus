const test = require('node:test')
const assert = require('node:assert/strict')

const plugin = require('../plugin.json')

test('plugin metadata exposes switchboard commands', () => {
  assert.equal(plugin.pluginName, 'uTools Plus')
  assert.equal(plugin.platform[0], 'darwin')
  assert.equal(plugin.features.length, 3)
  assert.equal(plugin.features[0].code, 'bluetooth')
  assert.deepEqual(plugin.features[0].cmds, [
    '蓝牙',
    'bluetooth',
    'Bluetooth'
  ])
  assert.equal(plugin.features[1].code, 'sound')
  assert.deepEqual(plugin.features[1].cmds, [
    '声音',
    'sound',
    '音频',
    '输入设备',
    '输出设备',
    '音量',
    '调节音量',
    '静音',
    '取消静音'
  ])
  assert.equal(plugin.features[2].code, 'wifi')
  assert.deepEqual(plugin.features[2].cmds, [
    'Wi-Fi',
    'wifi',
    '无线网络',
    '网络'
  ])
})
