import CoreWLAN
import Foundation

enum ExitCode: Int32 {
    case ok = 0
    case invalidArguments = 2
    case actionFailed = 3
}

let securityLabels: [(label: String, rawValue: Int)] = [
    ("wpa3 enterprise", 12),
    ("wpa3 personal", 11),
    ("wpa3 transition", 13),
    ("wpa2 enterprise", 9),
    ("wpa2 personal", 4),
    ("wpa enterprise mixed", 8),
    ("wpa personal mixed", 3),
    ("wpa enterprise", 7),
    ("wpa personal", 2),
    ("owe transition", 15),
    ("owe", 14),
    ("dynamic wep", 6),
    ("wep", 1),
    ("personal", 5),
    ("enterprise", 10),
    ("open", 0)
]

func emit(_ payload: [String: Any], exitCode: ExitCode = .ok) -> Never {
    do {
        let data = try JSONSerialization.data(withJSONObject: payload, options: [.sortedKeys])
        FileHandle.standardOutput.write(data)
        FileHandle.standardOutput.write(Data("\n".utf8))
        Foundation.exit(exitCode.rawValue)
    } catch {
        FileHandle.standardError.write(Data("Failed to encode Wi-Fi helper response\n".utf8))
        Foundation.exit(ExitCode.actionFailed.rawValue)
    }
}

func emitFailure(code: String, message: String, exitCode: ExitCode = .actionFailed) -> Never {
    emit([
        "ok": false,
        "error": [
            "code": code,
            "message": message
        ]
    ], exitCode: exitCode)
}

func channelLabel(_ channel: CWChannel?) -> String {
    guard let channel else {
        return ""
    }

    let details = [
        channelBandLabel(channel.channelBand.rawValue),
        channelWidthLabel(channel.channelWidth.rawValue)
    ].filter { !$0.isEmpty }

    if details.isEmpty {
        return "\(channel.channelNumber)"
    }

    return "\(channel.channelNumber) (\(details.joined(separator: ", ")))"
}

func channelBandLabel(_ rawValue: Int) -> String {
    switch rawValue {
    case 1:
        return "2GHz"
    case 2:
        return "5GHz"
    case 3:
        return "6GHz"
    default:
        return ""
    }
}

func channelWidthLabel(_ rawValue: Int) -> String {
    switch rawValue {
    case 1:
        return "20MHz"
    case 2:
        return "40MHz"
    case 3:
        return "80MHz"
    case 4:
        return "160MHz"
    default:
        return ""
    }
}

func securityLabel(_ security: CWSecurity) -> String {
    securityLabels.first { $0.rawValue == security.rawValue }?.label ?? ""
}

func networkSecurityLabel(_ network: CWNetwork) -> String {
    for item in securityLabels {
        guard let security = CWSecurity(rawValue: item.rawValue) else {
            continue
        }

        if network.supportsSecurity(security) {
            return item.label
        }
    }

    return ""
}

func currentPayload(_ interface: CWInterface) -> [String: Any] {
    [
        "ssid": interface.ssid() ?? "",
        "bssid": interface.bssid() ?? "",
        "rssi": interface.rssiValue(),
        "noise": interface.noiseMeasurement(),
        "channel": channelLabel(interface.wlanChannel()),
        "txRate": interface.transmitRate(),
        "maxRate": NSNull(),
        "security": securityLabel(interface.security())
    ]
}

func networkPayload(_ network: CWNetwork) -> [String: Any]? {
    guard let ssid = network.ssid?.trimmingCharacters(in: .whitespacesAndNewlines), !ssid.isEmpty else {
        return nil
    }

    return [
        "ssid": ssid,
        "bssid": network.bssid ?? "",
        "rssi": network.rssiValue,
        "noise": network.noiseMeasurement,
        "channel": channelLabel(network.wlanChannel),
        "txRate": NSNull(),
        "maxRate": NSNull(),
        "security": networkSecurityLabel(network)
    ]
}

func scanNetworks(_ interface: CWInterface) -> [[String: Any]] {
    do {
        return try interface.scanForNetworks(withSSID: nil)
            .sorted {
                if $0.rssiValue != $1.rssiValue {
                    return $0.rssiValue > $1.rssiValue
                }

                return ($0.ssid ?? "") < ($1.ssid ?? "")
            }
            .compactMap(networkPayload)
    } catch {
        return []
    }
}

let arguments = CommandLine.arguments

guard arguments.count >= 2 else {
    emitFailure(code: "INVALID_ARGUMENTS", message: "Missing Wi-Fi helper action", exitCode: .invalidArguments)
}

let action = arguments[1]

guard action == "snapshot" || action == "current" else {
    emitFailure(code: "INVALID_ACTION", message: "Unsupported Wi-Fi helper action: \(action)", exitCode: .invalidArguments)
}

let requestedInterface = arguments.count >= 3 ? arguments[2] : ""
let client = CWWiFiClient.shared()
let interface = requestedInterface.isEmpty
    ? client.interface()
    : (client.interface(withName: requestedInterface) ?? client.interface())

guard let interface else {
    emitFailure(code: "NO_WIFI_INTERFACE", message: "Wi-Fi interface is not available")
}

emit([
    "ok": true,
    "current": currentPayload(interface),
    "networks": action == "snapshot" ? scanNetworks(interface) : []
])
