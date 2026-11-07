import Foundation
import CryptoKit

struct NativeVehicle: Codable, Equatable {
    let id: String, vin: String, label: String
    let epoch: Int, enabled: Bool
    init(_ raw: [String: Any]) throws {
        guard let id = raw["id"] as? String, let vin = raw["vin"] as? String, NativeAccount.safeIdentifier(id), NativeAccount.safeIdentifier(vin),
              let epochValue = NativeCloud.number(raw["epoch"], range: 0...9e15), epochValue.rounded() == epochValue, let enabled = raw["enabled"] as? Bool else { throw PanelError.invalid("车辆同步资料无效。") }
        let epoch = Int(epochValue)
        self.id = id; self.vin = vin; self.epoch = epoch; self.enabled = enabled; label = String((raw["label"] as? String ?? "我的极核").prefix(80))
    }
    func scope(accountId: String) -> String { SHA256.hash(data: Data((accountId + "|" + id + "|" + vin).utf8)).map { String(format: "%02x", $0) }.joined() }
}

struct NativeAccount: Codable, Equatable {
    let id: String
    let uid: String
    let token: String
    let epoch: Int, label: String, enabled: Bool
    let vehicles: [NativeVehicle]
    var expired = false
    init(_ raw: [String: Any]) throws {
        guard let id = raw["id"] as? String, let uid = raw["uid"] as? String, let token = raw["token"] as? String, Self.safeIdentifier(id), Self.safeIdentifier(uid),
              !token.isEmpty, token.utf8.count <= 4096, token.rangeOfCharacter(from: .whitespacesAndNewlines) == nil,
              let epochValue = NativeCloud.number(raw["epoch"], range: 0...9e15), epochValue.rounded() == epochValue, let enabled = raw["enabled"] as? Bool,
              let rows = raw["vehicles"] as? [[String: Any]], rows.count <= 16 else { throw PanelError.invalid("账号同步资料无效。") }
        self.id = id; self.uid = uid; self.token = token; self.epoch = Int(epochValue); self.enabled = enabled; label = String((raw["label"] as? String ?? "本机账号").prefix(80))
        vehicles = try rows.map { try NativeVehicle($0) }; guard Set(vehicles.map(\.id)).count == vehicles.count else { throw PanelError.invalid("车辆标识重复。") }
    }
    static func safeIdentifier(_ value: String) -> Bool { !value.isEmpty && value.utf8.count <= 64 && value.range(of: "^[A-Za-z0-9_-]+$", options: .regularExpression) != nil }
}

@MainActor final class NativeAccountStore {
    private struct Envelope: Codable { let version: Int; var selectedVehicleId: String?; var accounts: [NativeAccount] }
    private var envelope = Envelope(version: 1, accounts: [])
    init() {
        if let data = SecureStore.read("accounts.v1"), let saved = try? JSONDecoder().decode(Envelope.self, from: data), saved.version == 1, saved.accounts.count <= 8 { envelope = saved }
    }
    var accounts: [NativeAccount] { envelope.accounts }
    var selectedVehicleId: String? { envelope.selectedVehicleId }
    var active: (NativeAccount, NativeVehicle)? { vehicle(envelope.selectedVehicleId) }
    func vehicle(_ id: String?) -> (NativeAccount, NativeVehicle)? {
        guard let id else { return nil }; for account in accounts { if let vehicle = account.vehicles.first(where: { $0.id == id }) { return (account, vehicle) } }; return nil
    }
    func replace(_ accounts: [NativeAccount], selectedVehicleId: String?) throws {
        let vehicleIds = accounts.flatMap { $0.vehicles.map(\.id) }
        guard accounts.count <= 8, Set(accounts.map(\.id)).count == accounts.count, Set(vehicleIds).count == vehicleIds.count, selectedVehicleId == nil || vehicleIds.contains(selectedVehicleId!) else { throw PanelError.invalid("账号列表无效。") }
        let next = Envelope(version: 1, selectedVehicleId: selectedVehicleId, accounts: accounts)
        try save(next); envelope = next
    }
    func remove(_ id: String?) throws {
        var next = envelope
        if let id { next.accounts.removeAll { $0.id == id }; if !next.accounts.flatMap({ $0.vehicles.map(\.id) }).contains(next.selectedVehicleId ?? "") { next.selectedVehicleId = next.accounts.first?.vehicles.first?.id } }
        else { next.accounts.removeAll(); next.selectedVehicleId = nil }
        try save(next); envelope = next
    }
    func markExpired(_ account: NativeAccount) {
        guard let index = envelope.accounts.firstIndex(where: { $0.id == account.id && $0.token == account.token }) else { return }
        envelope.accounts[index].expired = true; try? save(envelope)
    }
    private func save(_ value: Envelope) throws {
        // Explicit monitor enrollment uses a device-only item readable after the
        // first unlock, so an OS-granted background refresh can read its token.
        try SecureStore.write(JSONEncoder().encode(value), name: "accounts.v1", background: true)
    }
    func summary() -> [String: Any] { ["count": accounts.count, "selectedVehicleId": selectedVehicleId as Any? ?? NSNull(), "expiredIds": accounts.filter(\.expired).map(\.id)] }
}

enum EncryptedLocalFile {
    private static func key() throws -> SymmetricKey {
        if let data = SecureStore.read("history-key.v1"), data.count == 32 { return SymmetricKey(data: data) }
        let value = SymmetricKey(size: .bits256), data = value.withUnsafeBytes { Data($0) }
        try SecureStore.write(data, name: "history-key.v1", background: true); return value
    }
    static func directory() throws -> URL {
        let directory = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("PrivateHistory", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true, attributes: [.protectionKey: FileProtectionType.completeUntilFirstUserAuthentication])
        var excluded = URLResourceValues(); excluded.isExcludedFromBackup = true; var location = directory; try location.setResourceValues(excluded)
        return location
    }
    static func write<T: Encodable>(_ value: T, name: String) throws {
        guard name.range(of: "^[A-Za-z0-9_.-]{1,100}$", options: .regularExpression) != nil else { throw PanelError.invalid("存储名称无效。") }
        let data = try JSONEncoder().encode(value); guard data.count <= 2 * 1024 * 1024 else { throw PanelError.invalid("本机历史超出限制。") }
        let sealed = try AES.GCM.seal(data, using: key(), authenticating: Data(name.utf8))
        guard let combined = sealed.combined else { throw PanelError.unavailable("历史加密失败。") }
        try combined.write(to: directory().appendingPathComponent(name), options: [.atomic, .completeFileProtectionUntilFirstUserAuthentication])
    }
    static func read<T: Decodable>(_ type: T.Type, name: String) throws -> T? {
        let file = try directory().appendingPathComponent(name)
        guard FileManager.default.fileExists(atPath: file.path) else { return nil }
        guard let size = try file.resourceValues(forKeys: [.fileSizeKey]).fileSize, size <= 2 * 1024 * 1024 + 64 else { throw PanelError.invalid("历史文件超限。") }
        let clear = try AES.GCM.open(AES.GCM.SealedBox(combined: Data(contentsOf: file)), using: key(), authenticating: Data(name.utf8))
        return try JSONDecoder().decode(type, from: clear)
    }
    static func remove(name: String) { if let directory = try? directory() { try? FileManager.default.removeItem(at: directory.appendingPathComponent(name)) } }
}
