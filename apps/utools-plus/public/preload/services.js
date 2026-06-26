const bluetooth = require('./services/bluetooth')
const sound = require('./services/sound')
const wifi = require('./services/wifi')

const hostWindow = globalThis.window ?? globalThis

hostWindow.services = {
  bluetooth,
  sound,
  wifi
}

module.exports = hostWindow.services
