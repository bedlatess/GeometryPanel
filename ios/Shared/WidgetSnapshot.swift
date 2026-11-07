import Foundation

struct WidgetSnapshot: Codable {
    let vehicleLabel: String
    let soc: Double?
    let range: Double?
    let voltage: Double?
    let receivedAt: Double
    static let group = Bundle.main.object(forInfoDictionaryKey: "GeometryAppGroup") as? String ?? "group.app.geometrypanel.mobile"
    static var sharedDefaults: UserDefaults? {
        guard FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil else { return nil }
        return UserDefaults(suiteName: group)
    }
    static func read() -> WidgetSnapshot? {
        guard let data = sharedDefaults?.data(forKey: "vehicle-snapshot.v1") else { return nil }
        return try? JSONDecoder().decode(Self.self, from: data)
    }
}
