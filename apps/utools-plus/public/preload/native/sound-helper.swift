import CoreAudio
import Foundation

enum ExitCode: Int32 {
    case ok = 0
    case invalidArguments = 2
    case actionFailed = 3
}

struct SoundDevice {
    let id: AudioObjectID
    let uid: String
    let name: String
    let manufacturer: String
    let input: Bool
    let output: Bool
}

func emit(_ payload: [String: Any], code: ExitCode = .ok) -> Never {
    let data = try! JSONSerialization.data(withJSONObject: payload, options: [])
    FileHandle.standardOutput.write(data)
    FileHandle.standardOutput.write(Data([0x0A]))
    Foundation.exit(code.rawValue)
}

func emitFailure(code: String, message: String, detail: OSStatus? = nil, exitCode: ExitCode = .actionFailed) -> Never {
    var error: [String: Any] = [
        "code": code,
        "message": message
    ]

    if let detail {
        error["detail"] = detail
    }

    emit([
        "ok": false,
        "error": error
    ], code: exitCode)
}

func propertyAddress(
    _ selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal,
    element: AudioObjectPropertyElement = kAudioObjectPropertyElementMain
) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(
        mSelector: selector,
        mScope: scope,
        mElement: element
    )
}

func readStringProperty(_ objectID: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String? {
    var address = propertyAddress(selector)
    var value: Unmanaged<CFString>?
    var dataSize = UInt32(MemoryLayout<Unmanaged<CFString>?>.size)
    let status = AudioObjectGetPropertyData(objectID, &address, 0, nil, &dataSize, &value)

    guard status == noErr, let value else {
        return nil
    }

    return value.takeUnretainedValue() as String
}

func readDeviceIDs() -> [AudioObjectID] {
    var address = propertyAddress(kAudioHardwarePropertyDevices)
    var dataSize: UInt32 = 0
    var status = AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &dataSize)

    if status != noErr || dataSize == 0 {
        return []
    }

    let count = Int(dataSize) / MemoryLayout<AudioObjectID>.size
    var deviceIDs = [AudioObjectID](repeating: 0, count: count)
    status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &dataSize, &deviceIDs)

    if status != noErr {
        return []
    }

    return deviceIDs
}

func streamCount(_ deviceID: AudioObjectID, scope: AudioObjectPropertyScope) -> Int {
    var address = propertyAddress(kAudioDevicePropertyStreams, scope: scope)
    var dataSize: UInt32 = 0
    let status = AudioObjectGetPropertyDataSize(deviceID, &address, 0, nil, &dataSize)

    if status != noErr {
        return 0
    }

    return Int(dataSize) / MemoryLayout<AudioStreamID>.size
}

func readDefaultDeviceID(_ selector: AudioObjectPropertySelector) -> AudioObjectID? {
    var address = propertyAddress(selector)
    var deviceID = AudioObjectID(kAudioObjectUnknown)
    var dataSize = UInt32(MemoryLayout<AudioObjectID>.size)
    let status = AudioObjectGetPropertyData(AudioObjectID(kAudioObjectSystemObject), &address, 0, nil, &dataSize, &deviceID)

    if status != noErr || deviceID == AudioObjectID(kAudioObjectUnknown) {
        return nil
    }

    return deviceID
}

func hasProperty(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement
) -> Bool {
    var address = propertyAddress(selector, scope: scope, element: element)
    return AudioObjectHasProperty(deviceID, &address)
}

func isPropertySettable(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement
) -> Bool {
    var address = propertyAddress(selector, scope: scope, element: element)
    var settable = DarwinBoolean(false)
    let status = AudioObjectIsPropertySettable(deviceID, &address, &settable)

    return status == noErr && settable.boolValue
}

func propertyElements(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope
) -> [AudioObjectPropertyElement] {
    let mainElement = kAudioObjectPropertyElementMain

    if hasProperty(deviceID, selector: selector, scope: scope, element: mainElement) {
        return [mainElement]
    }

    return (1...8)
        .map { AudioObjectPropertyElement($0) }
        .filter { hasProperty(deviceID, selector: selector, scope: scope, element: $0) }
}

func readFloatProperty(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement
) -> Float32? {
    var address = propertyAddress(selector, scope: scope, element: element)
    var value = Float32(0)
    var dataSize = UInt32(MemoryLayout<Float32>.size)
    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &dataSize, &value)

    if status != noErr {
        return nil
    }

    return value
}

func readBoolProperty(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement
) -> Bool? {
    var address = propertyAddress(selector, scope: scope, element: element)
    var value = UInt32(0)
    var dataSize = UInt32(MemoryLayout<UInt32>.size)
    let status = AudioObjectGetPropertyData(deviceID, &address, 0, nil, &dataSize, &value)

    if status != noErr {
        return nil
    }

    return value != 0
}

func setFloatProperty(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement,
    value: Float32
) -> OSStatus {
    var address = propertyAddress(selector, scope: scope, element: element)
    var mutableValue = value
    let dataSize = UInt32(MemoryLayout<Float32>.size)

    return AudioObjectSetPropertyData(deviceID, &address, 0, nil, dataSize, &mutableValue)
}

func setBoolProperty(
    _ deviceID: AudioObjectID,
    selector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    element: AudioObjectPropertyElement,
    value: Bool
) -> OSStatus {
    var address = propertyAddress(selector, scope: scope, element: element)
    var mutableValue: UInt32 = value ? 1 : 0
    let dataSize = UInt32(MemoryLayout<UInt32>.size)

    return AudioObjectSetPropertyData(deviceID, &address, 0, nil, dataSize, &mutableValue)
}

func readVolumeControl(_ deviceID: AudioObjectID, scope: AudioObjectPropertyScope) -> (value: Float32?, supported: Bool) {
    let elements = propertyElements(deviceID, selector: kAudioDevicePropertyVolumeScalar, scope: scope)

    if elements.isEmpty {
        return (nil, false)
    }

    let values = elements.compactMap {
        readFloatProperty(deviceID, selector: kAudioDevicePropertyVolumeScalar, scope: scope, element: $0)
    }

    if values.isEmpty {
        return (nil, true)
    }

    let total = values.reduce(Float32(0), +)
    return (total / Float32(values.count), true)
}

func readMuteControl(_ deviceID: AudioObjectID, scope: AudioObjectPropertyScope) -> (value: Bool?, supported: Bool) {
    let elements = propertyElements(deviceID, selector: kAudioDevicePropertyMute, scope: scope)

    if elements.isEmpty {
        return (nil, false)
    }

    let values = elements.compactMap {
        readBoolProperty(deviceID, selector: kAudioDevicePropertyMute, scope: scope, element: $0)
    }

    if values.isEmpty {
        return (nil, true)
    }

    return (values.contains(true), true)
}

func controlPayload(_ device: SoundDevice?, scope: AudioObjectPropertyScope) -> [String: Any] {
    guard let device else {
        return [
            "uid": NSNull(),
            "volume": NSNull(),
            "muted": NSNull(),
            "volumeSupported": false,
            "muteSupported": false
        ]
    }

    let volume = readVolumeControl(device.id, scope: scope)
    let mute = readMuteControl(device.id, scope: scope)

    return [
        "uid": device.uid,
        "volume": volume.value.map { $0 as Any } ?? NSNull(),
        "muted": mute.value.map { $0 as Any } ?? NSNull(),
        "volumeSupported": volume.supported,
        "muteSupported": mute.supported
    ]
}

func readSoundDevices() -> [SoundDevice] {
    readDeviceIDs().compactMap { deviceID in
        let input = streamCount(deviceID, scope: kAudioDevicePropertyScopeInput) > 0
        let output = streamCount(deviceID, scope: kAudioDevicePropertyScopeOutput) > 0

        if !input && !output {
            return nil
        }

        let uid = readStringProperty(deviceID, kAudioDevicePropertyDeviceUID) ?? "audio-object-\(deviceID)"
        let name = readStringProperty(deviceID, kAudioObjectPropertyName) ?? uid
        let manufacturer = readStringProperty(deviceID, kAudioObjectPropertyManufacturer) ?? ""

        return SoundDevice(
            id: deviceID,
            uid: uid,
            name: name,
            manufacturer: manufacturer,
            input: input,
            output: output
        )
    }
}

func payloadForDevice(
    _ device: SoundDevice,
    defaultInputID: AudioObjectID?,
    defaultOutputID: AudioObjectID?,
    defaultSystemOutputID: AudioObjectID?
) -> [String: Any] {
    [
        "uid": device.uid,
        "id": device.id,
        "name": device.name,
        "manufacturer": device.manufacturer,
        "input": device.input,
        "output": device.output,
        "defaultInput": defaultInputID == device.id,
        "defaultOutput": defaultOutputID == device.id,
        "defaultSystemOutput": defaultSystemOutputID == device.id
    ]
}

func defaultUID(_ devices: [SoundDevice], _ deviceID: AudioObjectID?) -> Any {
    guard let deviceID, let device = devices.first(where: { $0.id == deviceID }) else {
        return NSNull()
    }

    return device.uid
}

func defaultDevice(_ devices: [SoundDevice], _ deviceID: AudioObjectID?) -> SoundDevice? {
    guard let deviceID else {
        return nil
    }

    return devices.first { $0.id == deviceID }
}

func emitSnapshot() -> Never {
    let devices = readSoundDevices().sorted { left, right in
        if left.output != right.output {
            return left.output
        }

        if left.input != right.input {
            return left.input
        }

        return left.name.localizedCaseInsensitiveCompare(right.name) == .orderedAscending
    }
    let defaultInputID = readDefaultDeviceID(kAudioHardwarePropertyDefaultInputDevice)
    let defaultOutputID = readDefaultDeviceID(kAudioHardwarePropertyDefaultOutputDevice)
    let defaultSystemOutputID = readDefaultDeviceID(kAudioHardwarePropertyDefaultSystemOutputDevice)

    emit([
        "ok": true,
        "devices": devices.map {
            payloadForDevice(
                $0,
                defaultInputID: defaultInputID,
                defaultOutputID: defaultOutputID,
                defaultSystemOutputID: defaultSystemOutputID
            )
        },
        "defaults": [
            "input": defaultUID(devices, defaultInputID),
            "output": defaultUID(devices, defaultOutputID),
            "systemOutput": defaultUID(devices, defaultSystemOutputID)
        ],
        "controls": [
            "output": controlPayload(
                defaultDevice(devices, defaultOutputID),
                scope: kAudioDevicePropertyScopeOutput
            ),
            "input": controlPayload(
                defaultDevice(devices, defaultInputID),
                scope: kAudioDevicePropertyScopeInput
            )
        ]
    ])
}

func resolveDevice(uid: String) -> SoundDevice? {
    let devices = readSoundDevices()

    if let device = devices.first(where: { $0.uid == uid }) {
        return device
    }

    if uid.hasPrefix("audio-object-"),
       let rawID = UInt32(uid.replacingOccurrences(of: "audio-object-", with: "")),
       let device = devices.first(where: { $0.id == AudioObjectID(rawID) }) {
        return device
    }

    return nil
}

func setDefaultDevice(_ deviceID: AudioObjectID, selector: AudioObjectPropertySelector) -> OSStatus {
    var address = propertyAddress(selector)
    var mutableDeviceID = deviceID
    let dataSize = UInt32(MemoryLayout<AudioObjectID>.size)

    return AudioObjectSetPropertyData(
        AudioObjectID(kAudioObjectSystemObject),
        &address,
        0,
        nil,
        dataSize,
        &mutableDeviceID
    )
}

func setVolumeControl(_ deviceID: AudioObjectID, scope: AudioObjectPropertyScope, value: Float32) -> OSStatus? {
    let writableElements = propertyElements(deviceID, selector: kAudioDevicePropertyVolumeScalar, scope: scope).filter {
        isPropertySettable(deviceID, selector: kAudioDevicePropertyVolumeScalar, scope: scope, element: $0)
    }

    if writableElements.isEmpty {
        return nil
    }

    for element in writableElements {
        let status = setFloatProperty(
            deviceID,
            selector: kAudioDevicePropertyVolumeScalar,
            scope: scope,
            element: element,
            value: value
        )

        if status != noErr {
            return status
        }
    }

    return noErr
}

func setMuteControl(_ deviceID: AudioObjectID, scope: AudioObjectPropertyScope, value: Bool) -> OSStatus? {
    let writableElements = propertyElements(deviceID, selector: kAudioDevicePropertyMute, scope: scope).filter {
        isPropertySettable(deviceID, selector: kAudioDevicePropertyMute, scope: scope, element: $0)
    }

    if writableElements.isEmpty {
        return nil
    }

    for element in writableElements {
        let status = setBoolProperty(
            deviceID,
            selector: kAudioDevicePropertyMute,
            scope: scope,
            element: element,
            value: value
        )

        if status != noErr {
            return status
        }
    }

    return noErr
}

func parseVolumeScalar(_ rawValue: String) -> Float32? {
    guard let volume = Float32(rawValue), volume >= 0, volume <= 1 else {
        return nil
    }

    return volume
}

func parseMuteState(_ rawValue: String) -> Bool? {
    switch rawValue.lowercased() {
    case "on", "true", "1", "muted":
        return true
    case "off", "false", "0", "unmuted":
        return false
    default:
        return nil
    }
}

func emitSetDefaultVolume(
    defaultSelector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    rawValue: String,
    action: String
) -> Never {
    guard let volume = parseVolumeScalar(rawValue) else {
        emitFailure(code: "INVALID_VOLUME", message: "Volume must be a scalar between 0 and 1", exitCode: .invalidArguments)
    }

    guard let deviceID = readDefaultDeviceID(defaultSelector) else {
        emitFailure(code: "DEFAULT_DEVICE_NOT_FOUND", message: "Default audio device not found")
    }

    let status = setVolumeControl(deviceID, scope: scope, value: volume)

    guard let status else {
        emitFailure(code: "VOLUME_UNSUPPORTED", message: "Audio device does not support software volume")
    }

    if status != noErr {
        emitFailure(code: "SET_VOLUME_FAILED", message: "Failed to set audio volume", detail: status)
    }

    emit([
        "ok": true,
        "action": action,
        "volume": volume
    ])
}

func emitSetDefaultMute(
    defaultSelector: AudioObjectPropertySelector,
    scope: AudioObjectPropertyScope,
    rawValue: String,
    action: String
) -> Never {
    guard let muted = parseMuteState(rawValue) else {
        emitFailure(code: "INVALID_MUTE_STATE", message: "Mute state must be on or off", exitCode: .invalidArguments)
    }

    guard let deviceID = readDefaultDeviceID(defaultSelector) else {
        emitFailure(code: "DEFAULT_DEVICE_NOT_FOUND", message: "Default audio device not found")
    }

    let status = setMuteControl(deviceID, scope: scope, value: muted)

    guard let status else {
        emitFailure(code: "MUTE_UNSUPPORTED", message: "Audio device does not support software mute")
    }

    if status != noErr {
        emitFailure(code: "SET_MUTE_FAILED", message: "Failed to update audio mute state", detail: status)
    }

    emit([
        "ok": true,
        "action": action,
        "muted": muted
    ])
}

func emitSetDefaultInput(uid: String) -> Never {
    guard let device = resolveDevice(uid: uid) else {
        emitFailure(code: "DEVICE_NOT_FOUND", message: "Audio input device not found")
    }

    if !device.input {
        emitFailure(code: "UNSUPPORTED_SCOPE", message: "Audio device does not support input")
    }

    let status = setDefaultDevice(device.id, selector: kAudioHardwarePropertyDefaultInputDevice)

    if status != noErr {
        emitFailure(code: "SET_INPUT_FAILED", message: "Failed to set default audio input device", detail: status)
    }

    emit([
        "ok": true,
        "action": "set-input",
        "uid": device.uid
    ])
}

func emitSetDefaultOutput(uid: String) -> Never {
    guard let device = resolveDevice(uid: uid) else {
        emitFailure(code: "DEVICE_NOT_FOUND", message: "Audio output device not found")
    }

    if !device.output {
        emitFailure(code: "UNSUPPORTED_SCOPE", message: "Audio device does not support output")
    }

    let outputStatus = setDefaultDevice(device.id, selector: kAudioHardwarePropertyDefaultOutputDevice)

    if outputStatus != noErr {
        emitFailure(code: "SET_OUTPUT_FAILED", message: "Failed to set default audio output device", detail: outputStatus)
    }

    let systemOutputStatus = setDefaultDevice(device.id, selector: kAudioHardwarePropertyDefaultSystemOutputDevice)

    if systemOutputStatus != noErr {
        emitFailure(code: "SET_SYSTEM_OUTPUT_FAILED", message: "Failed to set system audio output device", detail: systemOutputStatus)
    }

    emit([
        "ok": true,
        "action": "set-output",
        "uid": device.uid
    ])
}

guard CommandLine.arguments.count >= 2 else {
    emitFailure(code: "INVALID_ARGUMENTS", message: "Missing sound helper action", exitCode: .invalidArguments)
}

let action = CommandLine.arguments[1]

switch action {
case "list":
    emitSnapshot()
case "set-input":
    guard CommandLine.arguments.count >= 3 else {
        emitFailure(code: "INVALID_ARGUMENTS", message: "Missing audio input device uid", exitCode: .invalidArguments)
    }
    emitSetDefaultInput(uid: CommandLine.arguments[2])
case "set-output":
    guard CommandLine.arguments.count >= 3 else {
        emitFailure(code: "INVALID_ARGUMENTS", message: "Missing audio output device uid", exitCode: .invalidArguments)
    }
    emitSetDefaultOutput(uid: CommandLine.arguments[2])
case "set-output-volume":
    guard CommandLine.arguments.count >= 3 else {
        emitFailure(code: "INVALID_ARGUMENTS", message: "Missing output volume", exitCode: .invalidArguments)
    }
    emitSetDefaultVolume(
        defaultSelector: kAudioHardwarePropertyDefaultOutputDevice,
        scope: kAudioDevicePropertyScopeOutput,
        rawValue: CommandLine.arguments[2],
        action: action
    )
case "set-input-volume":
    guard CommandLine.arguments.count >= 3 else {
        emitFailure(code: "INVALID_ARGUMENTS", message: "Missing input volume", exitCode: .invalidArguments)
    }
    emitSetDefaultVolume(
        defaultSelector: kAudioHardwarePropertyDefaultInputDevice,
        scope: kAudioDevicePropertyScopeInput,
        rawValue: CommandLine.arguments[2],
        action: action
    )
case "set-output-muted":
    guard CommandLine.arguments.count >= 3 else {
        emitFailure(code: "INVALID_ARGUMENTS", message: "Missing output mute state", exitCode: .invalidArguments)
    }
    emitSetDefaultMute(
        defaultSelector: kAudioHardwarePropertyDefaultOutputDevice,
        scope: kAudioDevicePropertyScopeOutput,
        rawValue: CommandLine.arguments[2],
        action: action
    )
case "set-input-muted":
    guard CommandLine.arguments.count >= 3 else {
        emitFailure(code: "INVALID_ARGUMENTS", message: "Missing input mute state", exitCode: .invalidArguments)
    }
    emitSetDefaultMute(
        defaultSelector: kAudioHardwarePropertyDefaultInputDevice,
        scope: kAudioDevicePropertyScopeInput,
        rawValue: CommandLine.arguments[2],
        action: action
    )
default:
    emitFailure(code: "INVALID_ACTION", message: "Unsupported sound helper action: \(action)", exitCode: .invalidArguments)
}
