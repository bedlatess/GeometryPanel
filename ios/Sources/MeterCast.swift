import Foundation
import Network
import Security
import UIKit

@MainActor final class MeterCast {
    private var listeners: [NWListener] = [], sockets: [MeterSocket] = []
    private var tasks: [Task<Void, Never>] = []
    private var probe: MeterSocket?
    private var active = false
    private var acceptedPorts: Set<UInt16> = []
    private var encoder = VideoEncoder()
    private var configured = false, extended = false
    private var sequence: UInt32 = 0
    private var privateKey: SecKey?
    private let phoneUUID = UUID().uuidString
    private(set) var state = "idle"
    var changed: ((String) -> Void)?
    func start() async throws {
        stop(); active = true; state = "authorizing"; changed?(state)
        encoder.failed = { [weak self] in Task { @MainActor in self?.fail("视频编码中断，已停止投屏。") } }
        do {
            try await encoder.beginCapture()
            guard active else { throw PanelError.cancelled }
            state = "probing"; changed?(state)
            let socket = MeterSocket(port: 10930); probe = socket; try await socket.open()
            try await socket.send(MeterWire.control(0x70000010, MeterWire.json(["phoneType": "iOS", "packageName": Bundle.main.bundleIdentifier ?? "app.geometrypanel.mobile"])))
            let (command, data) = try await MeterWire.readControl(socket)
            guard command == 0x70000011, let reply = try JSONSerialization.jsonObject(with: data) as? [String: Any], reply["status"] as? Bool == true else { throw PanelError.unavailable("仪表没有接受 iOS 投屏连接；当前车型可能只开放 Android Wi-Fi Direct。") }
            socket.close(); probe = nil
            for port in [UInt16(10920),10921,10922] {
                let listener = try NWListener(using: MeterSocket.parameters(), on: NWEndpoint.Port(rawValue: port)!)
                listener.newConnectionHandler = { [weak self] connection in Task { @MainActor in self?.accept(connection, port: port) } }
                listener.stateUpdateHandler = { [weak self] value in if case .failed = value { Task { @MainActor in self?.fail("仪表监听失败，已停止投屏。") } } }
                listeners.append(listener); listener.start(queue: .main)
            }
            state = "handshaking"; changed?(state)
            tasks.append(Task { [weak self] in try? await Task.sleep(nanoseconds: 20_000_000_000); guard let self, self.active, self.state != "casting" else { return }; self.fail("仪表协商超时；请确认车辆热点和局域网权限。") })
        } catch { stop(); throw error }
    }
    func stop() {
        active = false; listeners.forEach { $0.cancel() }; listeners.removeAll(); sockets.forEach { $0.close() }; sockets.removeAll()
        probe?.close(); probe = nil; tasks.forEach { $0.cancel() }; tasks.removeAll(); acceptedPorts.removeAll()
        encoder.stop(); configured = false; privateKey = nil; state = "idle"; changed?(state)
    }
    private func fail(_ message: String) { guard active else { return }; stop(); state = "failed"; changed?(message) }
    private func accept(_ connection: NWConnection, port: UInt16) {
        guard active, !acceptedPorts.contains(port) else { connection.cancel(); return }
        do {
            let socket = try MeterSocket(accepted: connection); acceptedPorts.insert(port); sockets.append(socket)
            tasks.append(Task { [weak self] in
                guard let self else { return }
                do { try await socket.open(); switch port { case 10922: try await self.control(socket); case 10921: try await self.media(socket); default: try await self.frames(socket) } }
                catch { if self.active && !Task.isCancelled { self.fail("仪表连接已中断，投屏已停止。") } }
            })
        } catch { connection.cancel() }
    }
    private func control(_ socket: MeterSocket) async throws {
        while active && !Task.isCancelled {
            let (command, body) = try await MeterWire.readControl(socket)
            switch command {
            case 0x00010000, 0x000106d0, 0x00020000, 0x70000000, 0x00010780: try await socket.send(MeterWire.control(command + 1))
            case 0x00010010:
                guard let request = try JSONSerialization.jsonObject(with: body) as? [String: Any], let huid = (request["HUID"] ?? request["huid"]) as? String, !huid.isEmpty, huid.utf8.count <= 117 else { throw PanelError.invalid("仪表身份请求无效。") }
                try await socket.send(MeterWire.control(0x00010011, clientInformation(huid)))
            case 0x000103e0:
                let request = (try? JSONSerialization.jsonObject(with: body)) as? [String: Any] ?? [:]
                let serial = String((request["sn"] as? String ?? "").prefix(128)), client = String((request["client_set"] as? String ?? "vehicle_cast").prefix(128))
                try await socket.send(MeterWire.control(0x000103e1)); try await socket.send(MeterWire.control(0x000201c0, MeterWire.json(["isOk": true, "errCode": 0, "errMsg": "", "id": serial, "sn": serial, "client_set": client])))
            case 0x00030020, 0x80000010: break
            default: break
            }
        }
    }
    private func media(_ socket: MeterSocket) async throws {
        while active && !Task.isCancelled {
            let (command, seq, body) = try await MeterWire.readMedia(socket)
            switch command {
            case 0x10:
                guard body.count >= 30 else { throw PanelError.invalid("仪表视频配置过短。") }
                let width = Int(try body.unsigned(0, 2)), height = Int(try body.unsigned(2, 2)), fps = Int(try body.unsigned(4, 4)), codec = Int(try body.unsigned(8, 4)), bitrate = Int(try body.unsigned(20, 4))
                guard codec == 0 || codec == 2 else { throw PanelError.unavailable("仪表请求的视频编码不是恢复协议中的 H.264。") }
                try encoder.configure(width: width, height: height, fps: fps, bitrate: bitrate); extended = body[29] != 0; configured = true
                let dimensions = encoder.dimensions; var reply = Data(); reply.appendLE(UInt32(2)); reply.appendLE(UInt16(dimensions.0)); reply.appendLE(UInt16(dimensions.1)); reply.append(extended ? 1 : 0)
                try await socket.send(MeterWire.media(0x11, seq, reply))
            case 0x30: try await socket.send(MeterWire.media(0x31, seq, Data([0x8a,0x13,0,0,1,0,0,0])))
            case 0x40: try await socket.send(MeterWire.media(0x41, seq))
            case 0x60: try await socket.send(MeterWire.media(0x61, seq, Data("{\"viewAreaConfig\":{\"state\":0},\"supportFunction\":0}".utf8)))
            case 0x70:
                guard configured else { throw PanelError.invalid("仪表还没有协商视频参数。") }
                try await socket.send(MeterWire.media(0x71, seq)); state = "casting"; changed?(state)
            default: break
            }
        }
    }
    private func frames(_ socket: MeterSocket) async throws {
        while active && !Task.isCancelled {
            let (command, _, _) = try await MeterWire.readMedia(socket)
            guard command == 0x72 else { continue }
            guard state == "casting", let frame = encoder.pull() else { var empty = Data(); empty.appendLE(UInt32(0)); try await socket.send(empty); continue }
            sequence &+= 1; var packet = Data(); packet.appendLE(UInt32(frame.count + (extended ? 4 : 0))); if extended { packet.appendLE(sequence) }; packet += frame; try await socket.send(packet)
        }
    }
    private func clientInformation(_ huid: String) throws -> Data {
        if privateKey == nil {
            let attributes: [String: Any] = [kSecAttrKeyType as String: kSecAttrKeyTypeRSA, kSecAttrKeySizeInBits as String: 1024]
            privateKey = SecKeyCreateRandomKey(attributes as CFDictionary, nil)
        }
        guard let key = privateKey, let publicKey = SecKeyCopyPublicKey(key), let publicData = SecKeyCopyExternalRepresentation(publicKey, nil) as Data? else { throw PanelError.unavailable("仪表兼容握手密钥生成失败。") }
        // The legacy protocol uses RSA private PKCS#1 type-1 padding over raw HUID,
        // rather than a hash signature. Preserve that wire contract only here.
        var signed = Data(count: SecKeyGetBlockSize(key)), length = signed.count
        let data = Data(huid.utf8)
        let result = signed.withUnsafeMutableBytes { output in data.withUnsafeBytes { input in SecKeyRawSign(key, .PKCS1, input.bindMemory(to: UInt8.self).baseAddress!, data.count, output.bindMemory(to: UInt8.self).baseAddress!, &length) } }
        guard result == errSecSuccess else { throw PanelError.unavailable("仪表兼容握手没有完成。") }; signed.count = length
        func der(_ tag: UInt8, _ body: Data) -> Data { var output = Data([tag]); if body.count < 128 { output.append(UInt8(body.count)) } else { output.append(0x81); output.append(UInt8(body.count)) }; return output + body }
        let algorithm = Data(hex: "300d06092a864886f70d0101010500")!
        let spki = der(0x30, algorithm + der(0x03, Data([0]) + publicData))
        return try MeterWire.json(["pxcVersion": "1.0.2", "phoneUUID": phoneUUID, "phoneBrand": "Apple", "phoneModel": UIDevice.current.model,
            "phoneOsVersion": UIDevice.current.systemVersion, "phoneOs": "iOS", "package": Bundle.main.bundleIdentifier ?? "app.geometrypanel.mobile", "packageName": Bundle.main.bundleIdentifier ?? "app.geometrypanel.mobile", "versionCode": 400, "token": 0, "pubkey": spki.base64EncodedString(), "encryptedHUID": signed.base64EncodedString(), "bluetoothName": "GeometryPanel iOS", "supportH264IFrame": true, "supportScreenTouch": false, "supportHID": false, "supportFunction": 0, "appVersionFingerPrint": "GeometryPanel-iOS"])
    }
}
