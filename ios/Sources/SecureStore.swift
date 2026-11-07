import Foundation
import Security

enum SecureStore {
    private static let service = "app.geometrypanel.mobile.native.v1"
    static func read(_ name: String) -> Data? {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service,
            kSecAttrAccount as String: name, kSecReturnData as String: true, kSecMatchLimit as String: kSecMatchLimitOne]
        var item: CFTypeRef?
        guard SecItemCopyMatching(query as CFDictionary, &item) == errSecSuccess else { return nil }
        return item as? Data
    }
    static func write(_ data: Data, name: String) throws {
        let query: [String: Any] = [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: name]
        let values: [String: Any] = [kSecValueData as String: data, kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        let status = SecItemUpdate(query as CFDictionary, values as CFDictionary)
        if status == errSecItemNotFound {
            var combined = query; values.forEach { combined[$0] = $1 }
            guard SecItemAdd(combined as CFDictionary, nil) == errSecSuccess else { throw PanelError.unavailable("无法在本机安全保存资料。") }
        } else if status != errSecSuccess { throw PanelError.unavailable("无法在本机安全保存资料。") }
    }
    static func delete(_ name: String) {
        SecItemDelete([kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: service, kSecAttrAccount as String: name] as CFDictionary)
    }
    static func identity() throws -> Data {
        if let data = read("identity"), data.count == 8 { return data }
        var data = Data(count: 8)
        let status = data.withUnsafeMutableBytes { SecRandomCopyBytes(kSecRandomDefault, 8, $0.baseAddress!) }
        guard status == errSecSuccess else { throw PanelError.unavailable("本机随机标识生成失败。") }
        try write(data, name: "identity"); return data
    }
}
