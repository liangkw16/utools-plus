export const WIFI_PREFERENCES_STORAGE_KEY = 'utools-plus/wifi-preferences'

const EMPTY_PREFERENCES = Object.freeze({
  currentNetwork: null
})

export function normalizeWifiPreferences (input) {
  return {
    currentNetwork: normalizeRememberedCurrentNetwork(input?.currentNetwork)
  }
}

export function readWifiPreferences (storage = globalThis.localStorage) {
  if (!storage?.getItem) {
    return EMPTY_PREFERENCES
  }

  try {
    const value = storage.getItem(WIFI_PREFERENCES_STORAGE_KEY)
    if (!value) {
      return EMPTY_PREFERENCES
    }

    return normalizeWifiPreferences(JSON.parse(value))
  } catch {
    return EMPTY_PREFERENCES
  }
}

export function writeWifiPreferences (preferences, storage = globalThis.localStorage) {
  if (!storage?.setItem) {
    return normalizeWifiPreferences(preferences)
  }

  const normalized = normalizeWifiPreferences(preferences)
  storage.setItem(WIFI_PREFERENCES_STORAGE_KEY, JSON.stringify(normalized))
  return normalized
}

export function rememberWifiCurrentNetwork (preferences, network, timestamp = Date.now()) {
  const normalized = normalizeWifiPreferences(preferences)

  if (!isNamedSsid(network?.ssid) || network?.ssidRemembered) {
    return normalized
  }

  return {
    currentNetwork: {
      ssid: network.ssid.trim(),
      security: String(network.security ?? '').trim(),
      updatedAt: Number.isFinite(timestamp) ? timestamp : Date.now()
    }
  }
}

export function resolveRememberedCurrentNetwork (current, rememberedCurrentNetwork) {
  const remembered = normalizeRememberedCurrentNetwork(rememberedCurrentNetwork)

  if (!remembered || !isPlaceholderSsid(current?.ssid) || !current?.connected) {
    return null
  }

  const currentSecurity = String(current.security ?? '').trim().toLowerCase()
  const rememberedSecurity = remembered.security.toLowerCase()

  if (currentSecurity && rememberedSecurity && currentSecurity !== rememberedSecurity) {
    return null
  }

  return remembered
}

function normalizeRememberedCurrentNetwork (input) {
  const ssid = String(input?.ssid ?? '').trim()

  if (!isNamedSsid(ssid)) {
    return null
  }

  return {
    ssid,
    security: String(input?.security ?? '').trim(),
    updatedAt: Number.isFinite(input?.updatedAt) ? input.updatedAt : null
  }
}

function isNamedSsid (ssid) {
  return Boolean(ssid && !isPlaceholderSsid(ssid))
}

function isPlaceholderSsid (ssid) {
  return ssid === '当前网络'
}
