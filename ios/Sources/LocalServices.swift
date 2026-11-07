import Foundation
import UserNotifications
import WidgetKit

@MainActor final class LocalServices: NSObject, UNUserNotificationCenterDelegate {
    private let center = UNUserNotificationCenter.current()
    private var enabled = false
    private var proximityEnabled = false
    private var generation = 0
    private var lowBattery: Double = 20
    private var lastLowBattery: Date?
    var widgetAvailable: Bool { WidgetSnapshot.sharedDefaults != nil }
    override init() { super.init(); center.delegate = self }
    func configureProximity(_ requested: Bool) async throws {
        let epoch = generation
        if requested {
            guard try await center.requestAuthorization(options: [.alert, .sound]) else { throw PanelError.coded("permission_denied", "连接提醒需要通知权限，可在 iOS 设置中开启。") }
        }
        guard generation == epoch else { throw PanelError.cancelled }
        proximityEnabled = requested
        if !requested { center.removeDeliveredNotifications(withIdentifiers: ["ble-disconnected"]) }
    }
    func configure(_ params: [String: Any]) async throws -> [String: Any] {
        let epoch = generation
        guard let requested = params["enabled"] as? Bool else { throw PanelError.invalid("提醒设置无效。") }
        if requested {
            guard try await center.requestAuthorization(options: [.alert, .sound]) else { throw PanelError.coded("permission_denied", "通知权限未允许，可在 iOS 设置中开启。") }
        } else { center.removePendingNotificationRequests(withIdentifiers: ["low-battery"]); center.removeDeliveredNotifications(withIdentifiers: ["low-battery"]) }
        guard generation == epoch else { throw PanelError.cancelled }
        enabled = requested
        if let threshold = params["lowBattery"] as? Double, (5...80).contains(threshold) { lowBattery = threshold }
        return ["enabled": enabled, "lowBattery": lowBattery, "backgroundCloudPolling": false]
    }
    func update(_ params: [String: Any]) throws -> [String: Any] {
        guard let time = params["receivedAt"] as? Double, time > 0, time <= Date().timeIntervalSince1970 * 1000 + 5000 else { throw PanelError.invalid("车况时间无效。") }
        func number(_ name: String, max: Double) -> Double? {
            guard let value = params[name] as? Double, value.isFinite, (0...max).contains(value) else { return nil }; return value
        }
        let snapshot = WidgetSnapshot(vehicleLabel: String((params["vehicleLabel"] as? String ?? "我的极核").prefix(40)), soc: number("soc", max: 100), range: number("range", max: 1000), voltage: number("voltage", max: 300), receivedAt: time)
        // Only non-sensitive display values are shared. No token, VIN or position.
        var widgetUpdated = false
        if let shared = WidgetSnapshot.sharedDefaults, shared.string(forKey: "widget.vehicle") == nil || shared.string(forKey: "widget.vehicle") == params["vehicleId"] as? String {
            shared.set(try JSONEncoder().encode(snapshot), forKey: "vehicle-snapshot.v1"); WidgetCenter.shared.reloadAllTimelines(); widgetUpdated = true
        }
        if enabled, Date().timeIntervalSince1970 * 1000 - time < 300000,
           let soc = snapshot.soc, soc <= lowBattery, lastLowBattery == nil || Date().timeIntervalSince(lastLowBattery!) > 3600 {
            lastLowBattery = Date(); notify("low-battery", title: "车辆电量提醒", body: "最近一次读取的电量已低于你设置的提醒值，出发前请确认电量。")
        }
        return ["updated": widgetUpdated, "widgetAvailable": widgetAvailable]
    }
    func bluetoothDisconnected() { if proximityEnabled { notify("ble-disconnected", title: "车辆蓝牙连接已断开", body: "可能超出距离或车辆关闭了蓝牙；车辆锁定状态请现场确认。") } }
    func clear() {
        generation += 1
        if let shared = WidgetSnapshot.sharedDefaults {
            let configured = shared.string(forKey: "widget.vehicle")
            if configured == nil || NativeBackground.shared.accounts.vehicle(configured) == nil { shared.removeObject(forKey: "vehicle-snapshot.v1"); WidgetCenter.shared.reloadAllTimelines() }
        }
        enabled = false; proximityEnabled = false; lastLowBattery = nil
        center.removePendingNotificationRequests(withIdentifiers: ["low-battery", "ble-disconnected"])
        center.removeDeliveredNotifications(withIdentifiers: ["low-battery", "ble-disconnected"])
    }
    private func notify(_ id: String, title: String, body: String) {
        let content = UNMutableNotificationContent(); content.title = title; content.body = body; content.sound = .default
        center.add(UNNotificationRequest(identifier: id, content: content, trigger: nil))
    }
    func userNotificationCenter(_ center: UNUserNotificationCenter, willPresent notification: UNNotification, withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void) { completionHandler([.banner, .sound]) }
}
