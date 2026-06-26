import { useEffect, useState } from 'react'
import {
  readWifiPreferences,
  rememberWifiCurrentNetwork,
  resolveRememberedCurrentNetwork,
  writeWifiPreferences
} from './lib/wifi-preferences.js'
import {
  getWifiConnectionErrorMessage,
  getWifiNetworkActionLabel,
  isConnectableWifiNetwork,
  requiresWifiPassword
} from './lib/wifi-network-actions.js'

const INITIAL_SNAPSHOT = {
  ok: false,
  interface: '',
  power: 'unknown',
  current: null,
  networks: [],
  knownNetworks: [],
  otherNetworks: [],
  historyNetworks: [],
  scanning: false
}

export default function WifiPage ({ activationId = 0 }) {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT)
  const [wifiPreferences, setWifiPreferences] = useState(() => readWifiPreferences())
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [connectingSsid, setConnectingSsid] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')

  async function refresh ({ silent = false, announce = false, forceRefresh = false, quick = false } = {}) {
    if (!window.services?.wifi?.getWifiSnapshot) {
      setLoading(false)
      setRefreshing(false)
      setError('请在 macOS 的 uTools 插件环境中使用。')
      return
    }

    if (silent) {
      setRefreshing(true)
    } else {
      setLoading(true)
    }

    setError('')

    try {
      const nextSnapshot = await window.services.wifi.getWifiSnapshot({
        forceRefresh,
        scan: !quick
      })
      const normalizedSnapshot = normalizeWifiSnapshot(nextSnapshot)
      setSnapshot(previousSnapshot => mergeCurrentNetworkName(
        previousSnapshot,
        normalizedSnapshot,
        wifiPreferences.currentNetwork
      ))
      setWifiPreferences(currentPreferences => rememberWifiCurrentNetwork(
        currentPreferences,
        normalizedSnapshot.current
      ))
      if (announce) {
        setStatusMessage('Wi-Fi 列表已更新')
      }
      if (quick && normalizedSnapshot.scanning) {
        refresh({ silent: true, forceRefresh: true })
      }
    } catch (err) {
      setStatusMessage('')
      setError(err?.message || '读取 Wi-Fi 状态失败。')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refresh({ quick: true })
  }, [])

  useEffect(() => {
    writeWifiPreferences(wifiPreferences)
  }, [wifiPreferences])

  useEffect(() => {
    if (activationId > 0) {
      refresh({ silent: true, quick: true })
    }
  }, [activationId])

  useEffect(() => {
    if (!statusMessage) {
      return
    }

    const timeoutId = window.setTimeout(() => {
      setStatusMessage('')
    }, 3200)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [statusMessage])

  async function handlePowerToggle () {
    if (!window.services?.wifi?.setWifiPower) {
      const message = '当前无法切换 Wi-Fi 开关。'
      setError(message)
      notify(message)
      return
    }

    const nextPower = snapshot.power === 'on' ? 'off' : 'on'
    setBusy(true)
    setError('')

    try {
      await window.services.wifi.setWifiPower(nextPower)
      const message = nextPower === 'on' ? 'Wi-Fi 已打开' : 'Wi-Fi 已关闭'
      setStatusMessage(message)
      notify(message)
      await refresh({ silent: true, forceRefresh: true })
    } catch (err) {
      const message = err?.message || '切换 Wi-Fi 开关失败。'
      setStatusMessage('')
      setError(message)
      notify(message)
    } finally {
      setBusy(false)
    }
  }

  async function handleConnectNetwork (network) {
    if (!window.services?.wifi?.connectWifiNetwork) {
      const message = '当前无法切换 Wi-Fi 网络。'
      setError(message)
      notify(message)
      return
    }

    let password = ''

    if (requiresWifiPassword(network)) {
      const nextPassword = window.prompt(`输入“${network.ssid}”的 Wi-Fi 密码`)

      if (nextPassword === null) {
        return
      }

      password = nextPassword
    }

    setConnectingSsid(network.ssid)
    setError('')
    setStatusMessage(`正在连接 ${network.ssid}`)

    try {
      await window.services.wifi.connectWifiNetwork(network.ssid, password)
      const message = `已切换到 ${network.ssid}`
      setStatusMessage(message)
      notify(message)
      await refresh({ silent: true, forceRefresh: true })
    } catch (err) {
      const message = getWifiConnectionErrorMessage(err)
      setStatusMessage('')
      setError(message)
      notify(message)
    } finally {
      setConnectingSsid('')
    }
  }

  async function handleOpenSettings () {
    if (!window.services?.wifi?.openWifiSettings) {
      const message = '当前无法打开系统 Wi-Fi 设置。'
      setError(message)
      notify(message)
      return
    }

    try {
      await window.services.wifi.openWifiSettings()
      const message = '已打开系统 Wi-Fi 设置'
      setStatusMessage(message)
      notify(message)
    } catch (err) {
      const message = err?.message || '打开系统 Wi-Fi 设置失败。'
      setError(message)
      notify(message)
    }
  }

  return (
    <main className='page-shell'>
      <div className='page-frame'>
        <section className='toolbar-shell wifi-toolbar'>
          <div className='wifi-heading'>
            <span className='feature-kicker'>WI-FI</span>
            <h1>无线网络</h1>
            <p>{getWifiSummary(snapshot)}</p>
          </div>

          <div className='toolbar-actions wifi-actions'>
            <button
              className='ghost-button toolbar-button'
              disabled={refreshing || busy || Boolean(connectingSsid)}
              onClick={() => refresh({ silent: true, announce: true, forceRefresh: true })}
              type='button'
            >
              {refreshing ? '刷新中' : '刷新'}
            </button>
            <button className='secondary-button toolbar-button' onClick={handleOpenSettings} type='button'>
              设置
            </button>
            <button
              className='primary-button toolbar-button'
              disabled={busy || Boolean(connectingSsid) || snapshot.power === 'unknown'}
              onClick={handlePowerToggle}
              type='button'
            >
              {busy ? '处理中' : snapshot.power === 'on' ? '关闭 Wi-Fi' : '打开 Wi-Fi'}
            </button>
          </div>
        </section>

        <section className='list-panel wifi-status-panel'>
          {statusMessage && <div className='info-banner'>{statusMessage}</div>}
          {error && <div className='error-banner'>{error}</div>}

          {loading
            ? (
              <div className='empty-panel'>正在读取 Wi-Fi 状态...</div>
              )
            : (
              <div className='wifi-content-grid'>
                <WifiCurrentCard snapshot={snapshot} />
                <WifiNetworkSections
                  connectingSsid={connectingSsid}
                  onConnectNetwork={handleConnectNetwork}
                  snapshot={snapshot}
                />
              </div>
              )}
        </section>
      </div>
    </main>
  )
}

function WifiCurrentCard ({ snapshot }) {
  const current = snapshot.current
  const currentName = getCurrentNetworkName(snapshot)
  const hasCurrent = Boolean(currentName)

  return (
    <section className='wifi-current-card'>
      <div className='wifi-current-header'>
        <div className='wifi-current-title'>
          <h2>{currentName || '未连接网络'}</h2>
          <div className='wifi-current-subtitle'>
            <span>{snapshot.interface || 'Wi-Fi'}</span>
            {hasCurrent && <span>当前网络</span>}
          </div>
        </div>
        <div className='wifi-current-badges'>
          {current?.connected && <span className='connection-pill connected'>已连接</span>}
          {current?.known && <span className='favorite-pill'>已知</span>}
          <span className={`status-chip status-${snapshot.power}`}>{getPowerLabel(snapshot.power)}</span>
        </div>
      </div>

      <div className='wifi-metric-grid'>
        <WifiMetric label='信号' value={formatSignal(current?.rssi)} />
        <WifiMetric label='信道' value={current?.channel || '-'} />
        <WifiMetric label='速率' value={formatRate(current?.txRate)} />
        <WifiMetric label='安全' value={current?.security || '-'} />
      </div>
    </section>
  )
}

function WifiNetworkSections ({ connectingSsid, onConnectNetwork, snapshot }) {
  const sections = [
    {
      title: '已知网络',
      networks: snapshot.knownNetworks
    },
    {
      title: '其他网络',
      networks: snapshot.otherNetworks
    },
    {
      title: '历史记录',
      networks: snapshot.historyNetworks
    }
  ].filter(section => section.networks.length > 0)

  if (snapshot.power !== 'on') {
    return <div className='empty-panel wifi-empty-state'>Wi-Fi 关闭后无法扫描附近网络</div>
  }

  if (snapshot.scanning && sections.length === 0) {
    return <div className='empty-panel wifi-empty-state'>正在扫描附近网络...</div>
  }

  if (sections.length === 0) {
    return <div className='empty-panel wifi-empty-state'>没有扫描到附近网络</div>
  }

  return (
    <div className='section-stack wifi-network-groups'>
      {snapshot.scanning && <div className='wifi-section-note'>正在更新附近网络...</div>}
      {sections.map(section => (
        <WifiNetworkSection
          connectingSsid={connectingSsid}
          key={section.title}
          networks={section.networks}
          onConnectNetwork={onConnectNetwork}
          title={section.title}
        />
      ))}
    </div>
  )
}

function WifiNetworkSection ({ connectingSsid, onConnectNetwork, title, networks }) {
  return (
    <section className='device-section wifi-network-section'>
      <div className='device-section-header'>
        <h3>{title}</h3>
        <span className='section-count'>{networks.length}</span>
      </div>
      <div className='device-list'>
        {networks.map(network => (
          <WifiNetworkRow
            connectingSsid={connectingSsid}
            key={`${title}:${getNetworkKey(network)}`}
            network={network}
            onConnectNetwork={onConnectNetwork}
          />
        ))}
      </div>
    </section>
  )
}

function WifiNetworkRow ({ connectingSsid, network, onConnectNetwork }) {
  const metaItems = getNetworkMetaItems(network)
  const canConnect = isConnectableWifiNetwork(network)

  return (
    <article className={`device-row wifi-network-row${network.connected ? ' device-row-connected' : ''}`}>
      <div className='device-leading'>
        <span className={`device-icon${network.connected ? ' active' : ''}`}>
          {network.available === false ? '历' : getSignalIcon(network.rssi)}
        </span>
        <div className='device-main'>
          <div className='device-title-row'>
            <h2 className='device-name'>{network.ssid}</h2>
            <div className='wifi-row-status'>
              {network.connected && <span className='connection-pill connected'>已连接</span>}
              {network.known && !network.connected && <span className='favorite-pill'>已知</span>}
              {network.available === false && <span className='connection-pill idle'>未在附近</span>}
            </div>
          </div>
          <div className='device-meta-row wifi-row-meta'>
            {metaItems.map(item => <span key={item}>{item}</span>)}
          </div>
        </div>
      </div>
      {canConnect && (
        <div className='device-trailing wifi-row-actions'>
          <button
            className='secondary-button row-action-button'
            disabled={Boolean(connectingSsid)}
            onClick={() => onConnectNetwork(network)}
            type='button'
          >
            {getWifiNetworkActionLabel(network, connectingSsid)}
          </button>
        </div>
      )}
    </article>
  )
}

function WifiMetric ({ label, value }) {
  return (
    <div className='wifi-metric'>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  )
}

function normalizeWifiSnapshot (snapshot) {
  const networks = Array.isArray(snapshot?.networks) ? snapshot.networks : []
  const knownNetworks = Array.isArray(snapshot?.knownNetworks) ? snapshot.knownNetworks : []
  const historyNetworks = Array.isArray(snapshot?.historyNetworks) ? snapshot.historyNetworks : []
  const otherNetworks = Array.isArray(snapshot?.otherNetworks)
    ? snapshot.otherNetworks
    : networks

  return {
    ok: snapshot?.ok === true,
    interface: snapshot?.interface ?? '',
    power: ['on', 'off', 'unknown'].includes(snapshot?.power) ? snapshot.power : 'unknown',
    current: snapshot?.current ?? null,
    networks,
    knownNetworks,
    otherNetworks,
    historyNetworks,
    scanning: snapshot?.scanning === true
  }
}

function getWifiSummary (snapshot) {
  if (snapshot.power === 'off') return 'Wi-Fi 已关闭'
  if (snapshot.power === 'unknown') return 'Wi-Fi 状态未就绪'
  const currentName = getCurrentNetworkName(snapshot)
  return currentName ? `已连接 ${currentName}` : 'Wi-Fi 已开启，未连接网络'
}

function getPowerLabel (power) {
  if (power === 'on') return '已开启'
  if (power === 'off') return '已关闭'
  return '未就绪'
}

function formatSignal (rssi) {
  if (typeof rssi !== 'number') return '-'
  return `${rssi} dBm`
}

function formatRate (rate) {
  if (typeof rate !== 'number') return '-'
  return `${rate} Mbps`
}

function getNetworkMetaItems (network) {
  if (network.available === false) {
    return ['已保存', '未在附近']
  }

  return [
    formatSignal(network.rssi),
    formatChannels(network),
    formatSecurity(network),
    formatAccessPointCount(network)
  ].filter(item => item && item !== '-')
}

function formatChannels (network) {
  if (Array.isArray(network.channels) && network.channels.length > 1) {
    return `${network.channels.length} 个信道`
  }

  return network.channel || ''
}

function formatSecurity (network) {
  if (Array.isArray(network.securities) && network.securities.length > 1) {
    return `${network.securities.length} 种安全模式`
  }

  return network.security || '开放网络'
}

function formatAccessPointCount (network) {
  return network.accessPointCount > 1 ? `${network.accessPointCount} 个接入点` : ''
}

function mergeCurrentNetworkName (previousSnapshot, nextSnapshot, rememberedCurrentNetwork = null) {
  const remembered = resolveRememberedCurrentNetwork(nextSnapshot.current, previousSnapshot.current) ??
    resolveRememberedCurrentNetwork(nextSnapshot.current, rememberedCurrentNetwork)

  if (nextSnapshot.scanning && remembered) {
    return {
      ...nextSnapshot,
      current: {
        ...nextSnapshot.current,
        ssid: remembered.ssid,
        ssidRemembered: true,
        known: previousSnapshot.current?.ssid === remembered.ssid
          ? previousSnapshot.current.known
          : nextSnapshot.current?.known
      }
    }
  }

  return nextSnapshot
}

function getCurrentNetworkName (snapshot) {
  const ssid = snapshot.current?.ssid

  if (!ssid || isPlaceholderSsid(ssid)) {
    return snapshot.scanning && snapshot.current?.connected ? '已连接网络' : ''
  }

  return ssid
}

function isPlaceholderSsid (ssid) {
  return ssid === '当前网络'
}

function getSignalIcon (rssi) {
  if (typeof rssi !== 'number') return '-'
  if (rssi >= -55) return '强'
  if (rssi >= -70) return '中'
  return '弱'
}

function getNetworkKey (network) {
  return [
    network.available === false ? 'history' : 'nearby',
    network.connected ? 'current' : '',
    network.bssid,
    network.ssid,
    network.channel,
    network.security,
    network.accessPointCount
  ].filter(Boolean).join(':')
}

function notify (message) {
  if (window.utools?.showNotification) {
    window.utools.showNotification(message)
  }
}
