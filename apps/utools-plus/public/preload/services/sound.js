const sound = require('../sound-helper')

module.exports = {
  getSoundSnapshot () {
    return sound.getSoundSnapshot()
  },
  setDefaultInputDevice (uid) {
    return sound.setDefaultInputDevice(uid)
  },
  setDefaultOutputDevice (uid) {
    return sound.setDefaultOutputDevice(uid)
  },
  setOutputVolume (volume) {
    return sound.setOutputVolume(volume)
  },
  setInputVolume (volume) {
    return sound.setInputVolume(volume)
  },
  setOutputMuted (muted) {
    return sound.setOutputMuted(muted)
  },
  setInputMuted (muted) {
    return sound.setInputMuted(muted)
  },
  openSoundSettings () {
    return sound.openSoundSettings()
  },
  getSoundSettingsInvocationCandidates () {
    return sound.getSoundSettingsInvocationCandidates()
  }
}
