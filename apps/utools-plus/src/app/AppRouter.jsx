import { useEffect, useState } from 'react'
import BluetoothPage from '../modules/bluetooth/BluetoothPage'
import SoundPage from '../modules/sound/SoundPage'
import WifiPage from '../modules/wifi/WifiPage'
import { DEFAULT_FEATURE, normalizeFeatureCode } from './feature-registry.js'

const FEATURE_COMPONENTS = {
  bluetooth: BluetoothPage,
  sound: SoundPage,
  wifi: WifiPage
}

export default function AppRouter () {
  const [activeFeature, setActiveFeature] = useState(DEFAULT_FEATURE)
  const [activationId, setActivationId] = useState(0)

  useEffect(() => {
    if (!window.utools?.onPluginEnter) {
      return
    }

    window.utools.onPluginEnter(({ code } = {}) => {
      setActiveFeature(normalizeFeatureCode(code))
      setActivationId(current => current + 1)
    })
  }, [])

  const ActivePage = FEATURE_COMPONENTS[activeFeature] ?? FEATURE_COMPONENTS[DEFAULT_FEATURE]

  return <ActivePage activationId={activationId} />
}
