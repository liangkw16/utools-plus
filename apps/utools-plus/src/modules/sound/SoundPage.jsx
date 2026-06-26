import { useEffect, useState } from 'react'
import {
  VOLUME_STEP,
  clampPercent,
  clearVolumeDraft,
  getVisibleVolumePercent,
  updateVolumeDraft
} from './lib/volume-drafts.js'

const INITIAL_SNAPSHOT = {
  ok: false,
  devices: [],
  defaults: {
    input: null,
    output: null,
    systemOutput: null
  },
  controls: {
    output: {
      uid: null,
      volume: null,
      muted: null,
      volumeSupported: false,
      muteSupported: false
    },
    input: {
      uid: null,
      volume: null,
      muted: null,
      volumeSupported: false,
      muteSupported: false
    }
  }
}

export default function SoundPage ({ activationId = 0 }) {
  const [snapshot, setSnapshot] = useState(INITIAL_SNAPSHOT)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [busyKey, setBusyKey] = useState('')
  const [error, setError] = useState('')
  const [statusMessage, setStatusMessage] = useState('')
  const [volumeDrafts, setVolumeDrafts] = useState({})
  const outputDevices = snapshot.devices.filter(device => device.output)
  const inputDevices = snapshot.devices.filter(device => device.input)
  const defaultOutputDevice = findDefaultDevice(outputDevices, snapshot.controls.output.uid, device => (
    device.defaultOutput || device.defaultSystemOutput
  ))
  const defaultInputDevice = findDefaultDevice(inputDevices, snapshot.controls.input.uid, device => device.defaultInput)

  async function refresh ({ silent = false, announce = false } = {}) {
    if (!window.services?.sound?.getSoundSnapshot) {
      setLoading(false)
      setRefreshing(false)
      setStatusMessage('')
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
      const nextSnapshot = await window.services.sound.getSoundSnapshot()
      setSnapshot(normalizeSoundSnapshot(nextSnapshot))
      if (announce) {
        setStatusMessage('音频设备列表已更新')
      }
    } catch (err) {
      setStatusMessage('')
      setError(err?.message || '读取音频设备失败。')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  useEffect(() => {
    refresh()
  }, [])

  useEffect(() => {
    if (activationId > 0) {
      refresh({ silent: true })
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

  async function handleSetDefault (device, scope) {
    const service = scope === 'input'
      ? window.services?.sound?.setDefaultInputDevice
      : window.services?.sound?.setDefaultOutputDevice

    if (!service) {
      const message = `当前无法切换默认${scope === 'input' ? '输入' : '输出'}设备。`
      setError(message)
      notify(message)
      return
    }

    setBusyKey(`${scope}:${device.uid}`)
    setError('')

    try {
      await service(device.uid)
      const message = `已设为默认${scope === 'input' ? '输入' : '输出'}：${device.name}`
      setStatusMessage(message)
      notify(message)
      await refresh({ silent: true })
    } catch (err) {
      const message = err?.message || `切换默认${scope === 'input' ? '输入' : '输出'}设备失败。`
      setStatusMessage('')
      setError(message)
      notify(message)
    } finally {
      setBusyKey('')
    }
  }

  function handleVolumeDraftChange (scope, percent) {
    setVolumeDrafts(currentDrafts => updateVolumeDraft(currentDrafts, scope, percent))
  }

  async function handleVolumeCommit (scope, percent) {
    const service = scope === 'input'
      ? window.services?.sound?.setInputVolume
      : window.services?.sound?.setOutputVolume
    const label = scope === 'input' ? '输入' : '输出'
    const nextPercent = clampPercent(percent)

    if (!service) {
      const message = `当前无法调节${label}音量。`
      setError(message)
      notify(message)
      return
    }

    setVolumeDrafts(currentDrafts => updateVolumeDraft(currentDrafts, scope, nextPercent))
    setBusyKey(`${scope}:volume`)
    setError('')

    try {
      await service(nextPercent)
      const message = `${label}音量已调整为 ${nextPercent}%`
      setStatusMessage(message)
      notify(message)
      await refresh({ silent: true })
    } catch (err) {
      const message = err?.message || `调节${label}音量失败。`
      setStatusMessage('')
      setError(message)
      notify(message)
    } finally {
      setBusyKey('')
      setVolumeDrafts(currentDrafts => clearVolumeDraft(currentDrafts, scope))
    }
  }

  async function handleMuteToggle (scope, muted) {
    const service = scope === 'input'
      ? window.services?.sound?.setInputMuted
      : window.services?.sound?.setOutputMuted
    const label = scope === 'input' ? '输入' : '输出'

    if (!service) {
      const message = `当前无法切换${label}静音。`
      setError(message)
      notify(message)
      return
    }

    setBusyKey(`${scope}:mute`)
    setError('')

    try {
      await service(!muted)
      const message = !muted ? `${label}已静音` : `${label}已取消静音`
      setStatusMessage(message)
      notify(message)
      await refresh({ silent: true })
    } catch (err) {
      const message = err?.message || `切换${label}静音失败。`
      setStatusMessage('')
      setError(message)
      notify(message)
    } finally {
      setBusyKey('')
    }
  }

  async function handleOpenSettings () {
    if (!window.services?.sound?.openSoundSettings) {
      const message = '当前无法打开系统声音设置。'
      setError(message)
      notify(message)
      return
    }

    try {
      await window.services.sound.openSoundSettings()
      const message = '已打开系统声音设置'
      setStatusMessage(message)
      notify(message)
    } catch (err) {
      const message = err?.message || '打开系统声音设置失败。'
      setError(message)
      notify(message)
    }
  }

  return (
    <main className='page-shell'>
      <div className='page-frame'>
        <section className='toolbar-shell sound-toolbar'>
          <div className='sound-heading'>
            <span className='feature-kicker'>SOUND</span>
            <h1>音频设备</h1>
            <p>切换当前输入和输出设备，必要时跳转系统声音设置。</p>
          </div>

          <div className='toolbar-actions sound-actions'>
            <button
              className='secondary-button toolbar-button'
              disabled={refreshing}
              onClick={() => refresh({ silent: true, announce: true })}
              type='button'
            >
              {refreshing ? '刷新中...' : '刷新'}
            </button>
            <button className='primary-button toolbar-button' onClick={handleOpenSettings} type='button'>
              系统设置
            </button>
          </div>
        </section>

        <section className='list-panel sound-status-panel'>
          {statusMessage && <div className='info-banner'>{statusMessage}</div>}
          {error && <div className='error-banner'>{error}</div>}

          {loading
            ? (
              <div className='empty-panel'>正在读取音频设备...</div>
              )
            : (
              <div className='sound-device-grid'>
                <div className='sound-control-grid'>
                  <SoundLevelControl
                    busy={busyKey === 'output:volume' || busyKey === 'output:mute'}
                    control={snapshot.controls.output}
                    device={defaultOutputDevice}
                    onVolumeCommit={handleVolumeCommit}
                    onVolumeDraftChange={handleVolumeDraftChange}
                    onMuteToggle={handleMuteToggle}
                    scope='output'
                    title='输出音量'
                    volumeDrafts={volumeDrafts}
                  />
                  <SoundLevelControl
                    busy={busyKey === 'input:volume' || busyKey === 'input:mute'}
                    control={snapshot.controls.input}
                    device={defaultInputDevice}
                    onVolumeCommit={handleVolumeCommit}
                    onVolumeDraftChange={handleVolumeDraftChange}
                    onMuteToggle={handleMuteToggle}
                    scope='input'
                    title='输入音量'
                    volumeDrafts={volumeDrafts}
                  />
                </div>
                <SoundDeviceSection
                  busyKey={busyKey}
                  devices={outputDevices}
                  emptyLabel='没有找到可用的输出设备'
                  onSetDefault={handleSetDefault}
                  scope='output'
                  title='输出设备'
                />
                <SoundDeviceSection
                  busyKey={busyKey}
                  devices={inputDevices}
                  emptyLabel='没有找到可用的输入设备'
                  onSetDefault={handleSetDefault}
                  scope='input'
                  title='输入设备'
                />
              </div>
              )}
        </section>
      </div>
    </main>
  )
}

function SoundLevelControl ({
  busy,
  control,
  device,
  onMuteToggle,
  onVolumeCommit,
  onVolumeDraftChange,
  scope,
  title,
  volumeDrafts
}) {
  const volumePercent = getVisibleVolumePercent(control, volumeDrafts, scope)
  const muted = control.muted === true
  const volumeDisabled = busy || !control.volumeSupported
  const muteDisabled = busy || !control.muteSupported

  return (
    <section className='sound-control-card'>
      <div className='sound-control-header'>
        <div className='sound-control-title'>
          <h3>{title}</h3>
          <span>{device?.name || '未找到默认设备'}</span>
        </div>
        <span className={`connection-pill ${muted ? 'idle' : 'connected'}`}>
          {muted ? '静音' : `${volumePercent}%`}
        </span>
      </div>

      <div className='sound-volume-row'>
        <button
          className='secondary-button sound-step-button'
          disabled={volumeDisabled}
          onClick={() => onVolumeCommit(scope, volumePercent - VOLUME_STEP)}
          type='button'
        >
          -5
        </button>
        <input
          aria-label={title}
          className='sound-volume-slider'
          disabled={volumeDisabled}
          max='100'
          min='0'
          onChange={event => onVolumeDraftChange(scope, Number(event.target.value))}
          onKeyUp={event => onVolumeCommit(scope, Number(event.currentTarget.value))}
          onPointerUp={event => onVolumeCommit(scope, Number(event.currentTarget.value))}
          step={VOLUME_STEP}
          type='range'
          value={volumePercent}
        />
        <button
          className='secondary-button sound-step-button'
          disabled={volumeDisabled}
          onClick={() => onVolumeCommit(scope, volumePercent + VOLUME_STEP)}
          type='button'
        >
          +5
        </button>
        <button
          className='ghost-button sound-mute-button'
          disabled={muteDisabled}
          onClick={() => onMuteToggle(scope, muted)}
          type='button'
        >
          {muted ? '取消静音' : '静音'}
        </button>
      </div>

      {(!control.volumeSupported || !control.muteSupported) && (
        <p className='sound-control-note'>
          {!control.volumeSupported && !control.muteSupported
            ? '此设备不支持软件音量和静音控制'
            : !control.volumeSupported
                ? '此设备不支持软件音量控制'
                : '此设备不支持软件静音控制'}
        </p>
      )}
    </section>
  )
}

function SoundDeviceSection ({
  busyKey,
  devices,
  emptyLabel,
  onSetDefault,
  scope,
  title
}) {
  return (
    <section className='device-section sound-device-section'>
      <div className='device-section-header'>
        <h3>{title}</h3>
        <span className='section-count'>{devices.length}</span>
      </div>

      {devices.length === 0
        ? (
          <div className='empty-panel sound-empty-state'>{emptyLabel}</div>
          )
        : (
          <div className='device-list'>
            {devices.map(device => (
              <SoundDeviceRow
                busy={busyKey === `${scope}:${device.uid}`}
                device={device}
                key={`${scope}:${device.uid}`}
                onSetDefault={onSetDefault}
                scope={scope}
              />
            ))}
          </div>
          )}
    </section>
  )
}

function SoundDeviceRow ({ busy, device, onSetDefault, scope }) {
  const isDefault = scope === 'input'
    ? device.defaultInput
    : device.defaultOutput || device.defaultSystemOutput
  const actionLabel = scope === 'input' ? '输入' : '输出'

  return (
    <article className={`device-row ${isDefault ? 'device-row-connected' : ''}`}>
      <div className='device-leading'>
        <span className={`device-icon ${isDefault ? 'active' : ''}`}>
          {scope === 'input' ? 'IN' : 'OUT'}
        </span>

        <div className='device-main'>
          <div className='device-title-row'>
            <h2 className='device-name'>{device.name}</h2>
            <span className='device-type-inline'>{getDeviceCapabilityLabel(device)}</span>
          </div>

          <div className='device-meta-row'>
            <span>{device.manufacturer || '系统音频设备'}</span>
            <code className='device-address'>{device.uid}</code>
          </div>
        </div>
      </div>

      <div className='device-trailing'>
        {isDefault && <span className='connection-pill connected'>当前{actionLabel}</span>}
        <button
          className='primary-button row-action-button sound-row-action'
          disabled={busy || isDefault}
          onClick={() => onSetDefault(device, scope)}
          type='button'
        >
          {busy ? '切换中...' : `设为${actionLabel}`}
        </button>
      </div>
    </article>
  )
}

function normalizeSoundSnapshot (snapshot) {
  return {
    ok: snapshot?.ok === true,
    devices: Array.isArray(snapshot?.devices) ? snapshot.devices : [],
    defaults: {
      input: snapshot?.defaults?.input ?? null,
      output: snapshot?.defaults?.output ?? null,
      systemOutput: snapshot?.defaults?.systemOutput ?? null
    },
    controls: {
      output: normalizeSoundControl(snapshot?.controls?.output),
      input: normalizeSoundControl(snapshot?.controls?.input)
    }
  }
}

function normalizeSoundControl (control) {
  return {
    uid: control?.uid ?? null,
    volume: typeof control?.volume === 'number' ? control.volume : null,
    muted: typeof control?.muted === 'boolean' ? control.muted : null,
    volumeSupported: control?.volumeSupported === true,
    muteSupported: control?.muteSupported === true
  }
}

function findDefaultDevice (devices, uid, fallbackPredicate) {
  return devices.find(device => device.uid === uid) ?? devices.find(fallbackPredicate) ?? null
}

function getDeviceCapabilityLabel (device) {
  const capabilities = []

  if (device.output) capabilities.push('输出')
  if (device.input) capabilities.push('输入')

  return capabilities.join(' / ') || '音频设备'
}

function notify (message) {
  if (window.utools?.showNotification) {
    window.utools.showNotification(message)
  }
}
