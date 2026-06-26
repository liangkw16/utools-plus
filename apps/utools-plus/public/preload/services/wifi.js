const wifi = require('../wifi-helper')

module.exports = {
  getWifiSnapshot (options = {}) {
    return wifi.getWifiSnapshot(options)
  },
  connectWifiNetwork (ssid, password = '') {
    return wifi.connectWifiNetwork(ssid, { password })
  },
  setWifiPower (power) {
    return wifi.setWifiPower(power)
  },
  openWifiSettings () {
    return wifi.openWifiSettings()
  }
}
