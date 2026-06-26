export const FEATURE_REGISTRY = Object.freeze({
  bluetooth: {
    code: 'bluetooth',
    label: 'Bluetooth'
  },
  sound: {
    code: 'sound',
    label: 'Sound'
  },
  wifi: {
    code: 'wifi',
    label: 'Wi-Fi'
  }
})

export const DEFAULT_FEATURE = FEATURE_REGISTRY.bluetooth.code

export function normalizeFeatureCode (code) {
  return FEATURE_REGISTRY[code]?.code ?? DEFAULT_FEATURE
}
