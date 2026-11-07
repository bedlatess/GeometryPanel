import Foundation
import AppIntents
import WidgetKit

@MainActor enum NativeShortcuts {
    struct Configuration: Codable {
        let vehicleId: String, accountId: String
        let accountEpoch: Int, vehicleEpoch: Int
        let credentialDigest: String
        let actions: [String]
    }
    static let received = Notification.Name("GeometryNativeShortcut")
    private static var pending: [String: String]?
    static let allowed: Set<String> = ["refresh", "unlock", "lock", "horn", "seat"]
    static func configure(_ params: [String: Any]) throws -> [String: Any] {
        guard let id = params["vehicleId"] as? String, let (account, vehicle) = NativeBackground.shared.accounts.vehicle(id), account.enabled, !account.expired, vehicle.enabled, let actions = params["actions"] as? [String], actions.count <= 5, Set(actions).count == actions.count, actions.allSatisfy({ allowed.contains($0) }) else { throw PanelError.invalid("快捷指令的车辆或动作无效。") }
        let configuration = Configuration(vehicleId: id, accountId: account.id, accountEpoch: account.epoch, vehicleEpoch: vehicle.epoch, credentialDigest: MeterWire.md5(Data((account.uid + "|" + account.token + "|" + vehicle.vin).utf8)), actions: actions)
        try EncryptedLocalFile.write(configuration, name: "shortcuts.v1")
        PanelAppShortcuts.updateAppShortcutParameters()
        return ["configured": true, "requiresForegroundConfirmation": true, "actions": actions, "instruction": "在系统快捷指令中搜索几何面板，选择车辆操作；也可从车况组件打开。"]
    }
    static func reconcile(_ accounts: NativeAccountStore) {
        guard let configuration = try? EncryptedLocalFile.read(Configuration.self, name: "shortcuts.v1") else { return }
        guard let (account, vehicle) = accounts.vehicle(configuration.vehicleId), account.id == configuration.accountId, account.epoch == configuration.accountEpoch, vehicle.epoch == configuration.vehicleEpoch, account.enabled, !account.expired, vehicle.enabled, MeterWire.md5(Data((account.uid + "|" + account.token + "|" + vehicle.vin).utf8)) == configuration.credentialDigest else {
            EncryptedLocalFile.remove(name: "shortcuts.v1"); pending = nil
            WidgetSnapshot.sharedDefaults?.removeObject(forKey: "vehicle-snapshot.v1"); WidgetCenter.shared.reloadAllTimelines(); return
        }
    }
    static func request(_ action: String, vehicleId: String? = nil) throws {
        reconcile(NativeBackground.shared.accounts)
        guard allowed.contains(action), let configuration = try EncryptedLocalFile.read(Configuration.self, name: "shortcuts.v1"), configuration.actions.contains(action), vehicleId == nil || vehicleId == configuration.vehicleId else { throw PanelError.invalid("请先在面板为这辆车配置系统快捷入口。") }
        pending = ["vehicleId": configuration.vehicleId, "action": action]; NotificationCenter.default.post(name: received, object: nil)
    }
    static func peek() -> [String: String]? { reconcile(NativeBackground.shared.accounts); return pending }
    static func acknowledge(_ value: [String: String]) { if pending == value { pending = nil } }
    static func handle(_ url: URL) -> Bool {
        guard url.scheme == "geometrypanel", url.host == "action", url.path.isEmpty || url.path == "/", url.user == nil, url.password == nil, url.fragment == nil, let components = URLComponents(url: url, resolvingAgainstBaseURL: false), let items = components.queryItems, items.count <= 2, Set(items.map(\.name)).count == items.count, items.allSatisfy({ ["action", "vehicleId"].contains($0.name) }), let action = items.first(where: { $0.name == "action" })?.value else { return false }
        do { try request(action, vehicleId: items.first(where: { $0.name == "vehicleId" })?.value); return true } catch { return false }
    }
    static func widget(_ params: [String: Any]) throws -> [String: Any] {
        guard let shared = WidgetSnapshot.sharedDefaults else { throw PanelError.unavailable("当前安装包未包含有效 App Groups 组件签名，请用组件版并配置自签资料。") }
        guard let id = params["vehicleId"] as? String, let (account, vehicle) = NativeBackground.shared.accounts.vehicle(id), account.enabled, vehicle.enabled, let style = params["style"] as? String, ["1x1", "2x2", "4x2", "4x4"].contains(style), let controls = params["controls"] as? Bool else { throw PanelError.invalid("组件设置无效。") }
        shared.set(id, forKey: "widget.vehicle"); shared.set(style, forKey: "widget.style"); shared.set(controls, forKey: "widget.controls")
        if let sample = NativeHistory.last(account: account, vehicle: vehicle) {
            let snapshot = WidgetSnapshot(vehicleLabel: vehicle.label, soc: sample.soc, range: sample.range, voltage: sample.voltage, receivedAt: sample.at)
            shared.set(try JSONEncoder().encode(snapshot), forKey: "vehicle-snapshot.v1")
        } else { shared.removeObject(forKey: "vehicle-snapshot.v1") }
        WidgetCenter.shared.reloadAllTimelines(); return ["configured": true, "systemControlsLayout": true, "sharedConfiguration": true]
    }
}

enum PanelShortcutAction: String, AppEnum {
    case refresh, unlock, lock, horn, seat
    static var typeDisplayRepresentation: TypeDisplayRepresentation = "车辆操作"
    static var caseDisplayRepresentations: [PanelShortcutAction: DisplayRepresentation] = [.refresh: "刷新车况", .unlock: "开锁上电", .lock: "锁车下电", .horn: "鸣笛寻车", .seat: "开启座桶"]
}

struct PanelVehicleIntent: AppIntent {
    static var title: LocalizedStringResource = "几何面板车辆操作"
    static var description = IntentDescription("打开几何面板中已配置的车辆；控制动作需要在前台确认。")
    static var openAppWhenRun: Bool = true
    @Parameter(title: "操作", default: .refresh) var action: PanelShortcutAction
    @MainActor func perform() async throws -> some IntentResult {
        try NativeShortcuts.request(action.rawValue); return .result()
    }
}
struct PanelAppShortcuts: AppShortcutsProvider {
    static var appShortcuts: [AppShortcut] {
        AppShortcut(intent: PanelVehicleIntent(), phrases: ["打开\(.applicationName)车况"], shortTitle: "车辆操作", systemImageName: "scooter")
    }
}
