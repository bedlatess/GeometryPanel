import Foundation

enum PanelError: Error, LocalizedError {
    case invalid(String), unavailable(String), cancelled, timeout, disconnected
    case coded(String, String)
    var errorDescription: String? {
        switch self {
        case .invalid(let text), .unavailable(let text): return text
        case .coded(_, let text): return text
        case .cancelled: return "已取消本轮操作。"
        case .timeout: return "连接或回复超时；车辆执行结果需要观察确认。"
        case .disconnected: return "连接已断开；请重新连接后再试。"
        }
    }
    var code: String {
        switch self {
        case .coded(let code, _): return code
        case .invalid: return "invalid"
        case .unavailable: return "unsupported"
        case .cancelled: return "cancelled"
        case .timeout: return "timeout"
        case .disconnected: return "disconnected"
        }
    }
}

enum TrustedPage {
    static let home = URL(string: "https://bedlatess.github.io/GeometryPanel/")!
    static func permits(_ url: URL?) -> Bool {
        guard let url, url.scheme == "https", url.host == "bedlatess.github.io",
              url.port == nil || url.port == 443, url.user == nil, url.password == nil else { return false }
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false), !components.percentEncodedPath.contains("%"), !url.path.contains("\\"), !url.path.split(separator: "/").contains(where: { $0 == "." || $0 == ".." }) else { return false }
        return url.path == "/GeometryPanel" || url.path.hasPrefix("/GeometryPanel/")
    }
}

extension Data {
    init?(hex: String) {
        guard hex.count % 2 == 0, hex.utf8.allSatisfy({ (48...57).contains($0) || (65...70).contains($0) || (97...102).contains($0) }) else { return nil }
        self.init(); var index = hex.startIndex
        while index < hex.endIndex {
            let end = hex.index(index, offsetBy: 2)
            guard let byte = UInt8(hex[index..<end], radix: 16) else { return nil }
            append(byte); index = end
        }
    }
    var hex: String { map { String(format: "%02x", $0) }.joined() }
    mutating func appendLE<T: FixedWidthInteger>(_ value: T) { var number = value.littleEndian; Swift.withUnsafeBytes(of: &number) { append(contentsOf: $0) } }
    mutating func appendBE<T: FixedWidthInteger>(_ value: T) { var number = value.bigEndian; Swift.withUnsafeBytes(of: &number) { append(contentsOf: $0) } }
    func unsigned(_ offset: Int, _ length: Int, little: Bool = true) throws -> UInt64 {
        guard offset >= 0, length > 0, length <= 8, offset <= count - length else { throw PanelError.invalid("帧长度无效。") }
        let bytes = Array(self[offset..<(offset + length)])
        var value: UInt64 = 0
        if little { for byte in bytes.reversed() { value = (value << 8) | UInt64(byte) } }
        else { for byte in bytes { value = (value << 8) | UInt64(byte) } }
        return value
    }
}

enum ProtoValue: Equatable { case number(UInt64), bytes(Data), fixed32(UInt32), fixed64(UInt64) }
enum KeyProtocol {
    static let service = "0000B354-D6D8-C7EC-BDF0-EAB1BFC6BCBC"
    static let write = "0000B356-D6D8-C7EC-BDF0-EAB1BFC6BCBC"
    static let notify = "0000B357-D6D8-C7EC-BDF0-EAB1BFC6BCBC"
    static func varint(_ value: UInt64) -> Data {
        var remaining = value, result = Data()
        repeat { var byte = UInt8(remaining & 127); remaining >>= 7; if remaining > 0 { byte |= 128 }; result.append(byte) } while remaining > 0
        return result
    }
    static func number(_ field: UInt64, _ value: UInt64) -> Data { varint(field << 3) + varint(value) }
    static func bytes(_ field: UInt64, _ value: Data) -> Data { varint((field << 3) | 2) + varint(UInt64(value.count)) + value }
    static func decode(_ data: Data) throws -> [Int: ProtoValue] {
        guard data.count <= 240 else { throw PanelError.invalid("蓝牙内容过长。") }
        var index = 0, result: [Int: ProtoValue] = [:]
        func read() throws -> UInt64 {
            var value: UInt64 = 0
            for shift in stride(from: 0, through: 63, by: 7) {
                guard index < data.count else { throw PanelError.invalid("蓝牙内容不完整。") }
                let byte = data[index]; index += 1
                guard shift < 63 || byte <= 1 else { throw PanelError.invalid("蓝牙数字溢出。") }
                value |= UInt64(byte & 127) << shift
                if byte & 128 == 0 { return value }
            }
            throw PanelError.invalid("蓝牙数字无效。")
        }
        while index < data.count {
            let tag = try read(), field = Int(tag >> 3), wire = tag & 7
            guard field > 0, field <= 0x1fffffff, result[field] == nil, result.count < 64 else { throw PanelError.invalid("蓝牙字段无效或重复。") }
            switch wire {
            case 0: result[field] = .number(try read())
            case 1: result[field] = .fixed64(try data.unsigned(index, 8)); index += 8
            case 2:
                let length = try read(); guard length <= UInt64(data.count - index) else { throw PanelError.invalid("蓝牙字段长度无效。") }
                result[field] = .bytes(data.subdata(in: index..<(index + Int(length)))); index += Int(length)
            case 5: result[field] = .fixed32(UInt32(try data.unsigned(index, 4))); index += 4
            default: throw PanelError.invalid("未知的蓝牙字段格式。")
            }
        }
        return result
    }
    static func frame(_ command: UInt8, _ payload: Data) throws -> Data {
        guard [0x5a, 0x5c, 0x77, 0x78, 0x7f, 0x7c, 0x72].contains(command), payload.count <= 240 else { throw PanelError.invalid("不支持的蓝牙命令。") }
        var result = Data([0xab, 0xcd, command]); result.appendLE(UInt16(payload.count)); result += payload
        result.append(UInt8((Int(command) + payload.count + payload.reduce(0) { $0 + Int($1) }) & 255)); result.append(0xcf)
        return result
    }
    static func takeFrame(_ buffer: inout Data) throws -> (UInt8, Data)? {
        guard buffer.count <= 2048 else { buffer.removeAll(); throw PanelError.invalid("蓝牙接收超限。") }
        while buffer.count >= 2 && !(buffer[0] == 0xab && buffer[1] == 0xcd) { buffer.removeFirst(); buffer = Data(buffer) }
        guard buffer.count >= 7 else { return nil }
        let length = Int(try buffer.unsigned(3, 2)); guard length <= 240 else { buffer.removeAll(); throw PanelError.invalid("蓝牙帧过长。") }
        guard buffer.count >= length + 7 else { return nil }
        let command = buffer[2], payload = buffer.subdata(in: 5..<(length + 5))
        let check = UInt8((Int(command) + length + payload.reduce(0) { $0 + Int($1) }) & 255)
        guard buffer[length + 5] == check, buffer[length + 6] == 0xcf else { buffer.removeAll(); throw PanelError.invalid("蓝牙校验失败。") }
        buffer = Data(buffer.dropFirst(length + 7)); return (command, payload)
    }
    static func decryptChallenge(_ text: Data, key: Data) throws -> Data {
        guard let encoded = String(data: text, encoding: .utf8), let encrypted = Data(hex: encoded), !encrypted.isEmpty,
              encrypted.count % 16 == 0, [16,24,32].contains(key.count) else { throw PanelError.invalid("蓝牙认证材料无效。") }
        var output = Data(count: encrypted.count + 16), written = 0
        let capacity = output.count
        let status = output.withUnsafeMutableBytes { out in encrypted.withUnsafeBytes { input in key.withUnsafeBytes { secret in
            CCCrypt(CCOperation(kCCDecrypt), CCAlgorithm(kCCAlgorithmAES), CCOptions(kCCOptionECBMode | kCCOptionPKCS7Padding), secret.baseAddress, key.count, nil, input.baseAddress, encrypted.count, out.baseAddress, capacity, &written)
        } } }
        guard status == kCCSuccess, written > 0, written <= 220 else { throw PanelError.invalid("蓝牙认证未成功。") }
        output.count = written; return output
    }
}

struct VehicleBinding: Codable {
    let vin: String; let uid: String; let credentialDigest: String; let fetchedAt: Double
    let inductiveGeneration: String; let broadcastType: String; let encryptValue: String?; let key: String?; let cloudEnabled: Bool?
    init(_ params: [String: Any], now: Double = Date().timeIntervalSince1970 * 1000) throws {
        guard let vin = params["vin"] as? String, !vin.isEmpty, vin.count <= 64, vin.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil,
              let uid = params["uid"] as? String, !uid.isEmpty, uid.count <= 128,
              params["ownerId"] as? String == uid, String(describing: params["bindingUserId"] ?? "") == uid,
              String(describing: params["sharedFlag"] ?? "") == "0",
              let digest = params["credentialDigest"] as? String, digest.count == 64, Data(hex: digest) != nil,
              let fetched = params["fetchedAt"] as? Double, fetched <= now + 5000, now - fetched < 300000 else { throw PanelError.coded("owner_not_verified", "请先刷新当前车主账号的车辆资料，再操作。") }
        self.vin = vin; self.uid = uid; self.credentialDigest = digest; self.fetchedAt = fetched
        self.inductiveGeneration = String(describing: params["inductiveGeneration"] ?? "")
        self.broadcastType = String(describing: params["broadcastType"] ?? "")
        let info = params["encryptInfo"] as? [String: Any]
        self.encryptValue = info?["encryptValue"] as? String; self.key = info?["key"] as? String
        self.cloudEnabled = params["cloudEnabled"] as? Bool
    }
    func requireFresh(now: Double = Date().timeIntervalSince1970 * 1000) throws {
        guard now.isFinite, fetchedAt.isFinite, fetchedAt > 0, fetchedAt <= now + 5000, now - fetchedAt < 300000 else { throw PanelError.coded("stale_material", "蓝牙资料已过期或手机时间已改变，请重新刷新。") }
    }
    func requireKey() throws -> (Data, Data) {
        try requireFresh()
        guard let encryptValue, encryptValue.count == 128, let encrypted = Data(hex: encryptValue), encrypted.count == 64, let key, [16,24,32].contains(key.utf8.count) else { throw PanelError.coded("ble_material_missing", "该车辆没有返回可用的蓝牙认证材料。壁纸和组件仍可单独使用。") }
        guard !inductiveGeneration.hasPrefix("3") else { throw PanelError.unavailable("旧版没有恢复 3.0 钥匙协议，当前不能登记或认证 3.0。") }
        return (encrypted, Data(key.utf8))
    }
}
