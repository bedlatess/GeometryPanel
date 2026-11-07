import UIKit
import BackgroundTasks
import UserNotifications
import WidgetKit

@MainActor final class NativeBackground {
    static let shared = NativeBackground()
    static let identifier = "app.geometrypanel.mobile.cloud-refresh"
    let accounts = NativeAccountStore()
    private struct Configuration: Codable {
        var enabled = false
        var notifications: [String: Bool] = [:]
        var lowBatteryThreshold: Double = 20
    }
    private var configuration = Configuration()
    private var task: Task<Void, Never>?
    private var timer: Timer?
    private var generation = 0, cursor = 0
    private var snapshots: [String: NativeHistorySample] = [:]
    private var failures: [String: String] = [:]
    private var messages: [String: Set<String>] = [:]
    private var notified: [String: Double] = [:]
    private(set) var jobScheduled = false
    private(set) var lastRun: Double?
    private let cloud = NativeCloud()
    var enabled: Bool { configuration.enabled }
    var backgroundMode: String { UIApplication.shared.backgroundRefreshStatus == .available ? "opportunistic" : "foreground-only" }
    private init() { if let saved = try? EncryptedLocalFile.read(Configuration.self, name: "monitor.v1") { configuration = saved } }
    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.identifier, using: .main) { granted in
            Task { @MainActor in
                guard let refresh = granted as? BGAppRefreshTask else { granted.setTaskCompleted(success: false); return }
                self.jobScheduled = false; self.schedule()
                guard self.enabled, self.task == nil else { refresh.setTaskCompleted(success: false); return }
                refresh.expirationHandler = { Task { @MainActor in self.cancel() } }
                do { try self.run(vehicleId: nil, background: true, completion: { refresh.setTaskCompleted(success: $0) }) }
                catch { refresh.setTaskCompleted(success: false) }
            }
        }
        schedule()
    }
    func foreground(_ active: Bool) {
        timer?.invalidate(); timer = nil
        if active, enabled {
            timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in Task { @MainActor in try? self.run(vehicleId: nil) } }
        }
        schedule()
    }
    func sync(_ params: [String: Any]) throws -> [String: Any] {
        guard let raw = params["accounts"] as? [[String: Any]], raw.count <= 8 else { throw PanelError.invalid("账号列表无效。") }
        let next = try raw.map { try NativeAccount($0) }, previous = accounts.accounts
        let selected = params["selectedVehicleId"] as? String
        try accounts.replace(next, selectedVehicleId: selected)
        if previous != accounts.accounts { reconcile(previous) }
        return accounts.summary()
    }
    func remove(_ id: String) throws -> [String: Any] {
        guard NativeAccount.safeIdentifier(id) else { throw PanelError.invalid("账号标识无效。") }
        let previous = accounts.accounts; try accounts.remove(id); reconcile(previous); return accounts.summary()
    }
    private func reconcile(_ previous: [NativeAccount]) {
        cancel(); NativeTasks.shared.cancel(); NativeShortcuts.reconcile(accounts)
        for old in previous {
            let current = accounts.accounts.first { $0.id == old.id && $0.uid == old.uid }
            for vehicle in old.vehicles {
                if current?.vehicles.contains(where: { $0.id == vehicle.id && $0.vin == vehicle.vin }) != true { try? NativeHistory.clear(account: old, vehicle: vehicle) }
                if current?.token != old.token || current?.epoch != old.epoch || current?.vehicles.contains(where: { $0 == vehicle }) != true { SecureStore.delete(NativeAccountStore.materialName(uid: old.uid, vin: vehicle.vin)) }
            }
        }
        let ids = Set(accounts.accounts.flatMap { $0.vehicles.map(\.id) })
        snapshots = snapshots.filter { ids.contains($0.key) }; failures = failures.filter { ids.contains($0.key) }; messages.removeAll()
        if let shared = WidgetSnapshot.sharedDefaults, let widgetId = shared.string(forKey: "widget.vehicle"), !ids.contains(widgetId) { shared.removeObject(forKey: "vehicle-snapshot.v1"); shared.removeObject(forKey: "widget.vehicle"); shared.set(false, forKey: "widget.controls"); WidgetCenter.shared.reloadAllTimelines() }
        if ids.isEmpty { configuration.enabled = false; try? EncryptedLocalFile.write(configuration, name: "monitor.v1"); foreground(false) }
        schedule()
    }
    func configure(_ params: [String: Any], validate: () -> Bool = { true }) async throws -> [String: Any] {
        guard let enabled = params["enabled"] as? Bool else { throw PanelError.invalid("监控设置无效。") }
        _ = try sync(params); cancel()
        let epoch = generation
        var next = Configuration(); next.enabled = enabled
        if let threshold = NativeCloud.number(params["lowBatteryThreshold"], range: 5...80) { next.lowBatteryThreshold = threshold }
        let raw = params["notifications"] as? [String: Any] ?? [:]
        for key in ["chargeStart", "chargeProgress", "chargeFull", "chargeStop", "message", "lowBattery", "offline", "tire"] { next.notifications[key] = raw[key] as? Bool ?? false }
        if enabled, next.notifications.values.contains(true) {
            guard try await UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound]) else { throw PanelError.coded("permission_denied", "请在系统设置允许通知，或关闭消息提醒后保存。") }
        }
        guard epoch == generation, validate() else { throw PanelError.cancelled }
        try EncryptedLocalFile.write(next, name: "monitor.v1"); configuration = next
        foreground(UIApplication.shared.applicationState == .active)
        return status()
    }
    func valid(_ account: NativeAccount, _ vehicle: NativeVehicle? = nil) -> Bool {
        guard let current = accounts.accounts.first(where: { $0.id == account.id }), current.uid == account.uid, current.token == account.token, current.epoch == account.epoch, current.enabled, !current.expired else { return false }
        if let vehicle { return current.vehicles.contains { $0 == vehicle && $0.enabled } }; return true
    }
    func run(vehicleId: String?, background: Bool = false, completion: ((Bool) -> Void)? = nil) throws {
        guard task == nil else { throw PanelError.coded("busy", "监控正在读取，请稍后刷新状态。") }
        var selected = accounts.accounts.filter { $0.enabled && !$0.expired }.flatMap { a in a.vehicles.filter { $0.enabled && (vehicleId == nil || $0.id == vehicleId) }.map { (a, $0) } }
        guard !selected.isEmpty else { throw PanelError.invalid("请先同步已启用的账号和车辆。") }
        if background { selected = [selected[cursor % selected.count]]; cursor += 1 }
        let epoch = generation
        task = Task { [weak self] in
            guard let self else { completion?(false); return }; var success = false
            defer { if self.generation == epoch { self.task = nil; self.lastRun = Date().timeIntervalSince1970 * 1000 }; completion?(success) }
            for (account, vehicle) in selected {
                guard self.generation == epoch, !Task.isCancelled, self.valid(account, vehicle) else { return }
                do {
                    let result = try await self.cloud.snapshot(account: account, vehicle: vehicle, tire: self.configuration.notifications["tire"] == true, messages: self.configuration.notifications["message"] == true)
                    guard self.generation == epoch, !Task.isCancelled, self.valid(account, vehicle) else { return }
                    let previous = self.snapshots[vehicle.id] ?? NativeHistory.last(account: account, vehicle: vehicle)
                    try NativeHistory.append(result.sample, account: account, vehicle: vehicle)
                    self.snapshots[vehicle.id] = result.sample; self.failures[vehicle.id] = result.partial ? "partial" : nil
                    self.evaluate(account, vehicle, prior: previous, result: result); self.updateWidget(vehicle, result.sample); success = true
                } catch {
                    guard self.generation == epoch, !Task.isCancelled, self.valid(account, vehicle) else { return }
                    if case NativeCloudError.expired = error { self.accounts.markExpired(account); self.failures[vehicle.id] = "expired" }
                    else { self.failures[vehicle.id] = "network" }
                }
            }
        }
    }
    func cancel() { generation += 1; task?.cancel(); task = nil }
    private func schedule() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.identifier); jobScheduled = false
        guard enabled, !accounts.accounts.isEmpty, backgroundMode == "opportunistic" else { return }
        let request = BGAppRefreshTaskRequest(identifier: Self.identifier); request.earliestBeginDate = Date().addingTimeInterval(900)
        do { try BGTaskScheduler.shared.submit(request); jobScheduled = true } catch { jobScheduled = false }
    }
    func status() -> [String: Any] {
        let rows: [[String: Any]] = accounts.accounts.flatMap { account in account.vehicles.map { vehicle in
            let sample = snapshots[vehicle.id] ?? NativeHistory.last(account: account, vehicle: vehicle)
            return ["id": vehicle.id, "label": vehicle.label, "epoch": vehicle.epoch, "lastPoll": sample?.at as Any? ?? NSNull(), "error": account.expired ? "expired" as Any : failures[vehicle.id] as Any? ?? NSNull(), "snapshot": sample?.dictionary() as Any? ?? NSNull()]
        } }
        return ["enabled": enabled, "running": task != nil, "backgroundMode": backgroundMode, "jobScheduled": jobScheduled, "lastRun": lastRun as Any? ?? NSNull(), "vehicles": rows]
    }
    func history(_ params: [String: Any], clear: Bool = false) throws -> [String: Any] {
        guard let id = params["vehicleId"] as? String, let (account, vehicle) = accounts.vehicle(id), let kind = params["kind"] as? String, ["battery", "charge", "events"].contains(kind) || clear && kind == "all" else { throw PanelError.invalid("历史类别或车辆无效。") }
        if clear { guard params["confirmed"] as? Bool == true else { throw PanelError.invalid("请确认清除本机历史。"); }; try NativeHistory.clear(account: account, vehicle: vehicle, kind: kind); snapshots[id] = nil; return ["cleared": true] }
        let limit = min(max(params["limit"] as? Int ?? 100, 1), 500), before = NativeCloud.number(params["before"], range: 1...9e15)
        return try NativeHistory.read(account: account, vehicle: vehicle, kind: kind, before: before, limit: limit)
    }
    private func evaluate(_ account: NativeAccount, _ vehicle: NativeVehicle, prior: NativeHistorySample?, result: NativeCloudSnapshot) {
        let sample = result.sample
        func emit(_ kind: String, _ title: String, _ body: String) {
            guard configuration.notifications[kind] == true else { return }
            let key = vehicle.id + "." + kind, now = Date().timeIntervalSince1970
            guard now - (notified[key] ?? 0) > 900 else { return }; notified[key] = now
            try? NativeHistory.event(account: account, vehicle: vehicle, kind: kind, title: title, body: body)
            let content = UNMutableNotificationContent(); content.title = title; content.body = body; content.sound = .default
            UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: "monitor." + key, content: content, trigger: nil))
        }
        if sample.charging == true, prior?.charging == false { emit("chargeStart", "充电开始提醒", "本机最近读取到车辆进入充电状态。") }
        if sample.charging == true, let old = prior?.soc, let soc = sample.soc, Int(soc / 10) > Int(old / 10) { emit("chargeProgress", "充电进度提醒", "本机最近读取到电量跨过新的十个百分点。") }
        if sample.chargeFull == true, prior?.chargeFull != true { emit("chargeFull", "充电完成提醒", "云端最近返回了明确的充满状态，请查看车辆确认。") }
        if sample.charging == false, prior?.charging == true, sample.chargeFull != true { emit("chargeStop", "充电停止提醒", "最近读取到充电停止；没有明确的充满确认。") }
        if let soc = sample.soc, soc <= configuration.lowBatteryThreshold, prior?.soc == nil || prior!.soc! > configuration.lowBatteryThreshold { emit("lowBattery", "车辆电量提醒", "最近读取的电量已低于设置值，出发前请确认电量。") }
        if sample.online == false, prior?.online == true { emit("offline", "车辆离线提醒", "云端最近报告车辆离线；这与手机网络请求失败不同。") }
        if sample.tireWarning == true, prior?.tireWarning != true { emit("tire", "胎压状态提醒", "最近读取到胎压告警，请在骑行前检查轮胎。") }
        if let old = messages[vehicle.id], !result.messageIds.subtracting(old).isEmpty { emit("message", "车辆有新消息", "官方服务返回了新的未读消息，请打开消息中心查看。") }
        messages[vehicle.id] = result.messageIds
    }
    private func updateWidget(_ vehicle: NativeVehicle, _ sample: NativeHistorySample) {
        guard let shared = WidgetSnapshot.sharedDefaults, shared.string(forKey: "widget.vehicle") == vehicle.id else { return }
        let value = WidgetSnapshot(vehicleLabel: vehicle.label, soc: sample.soc, range: sample.range, voltage: sample.voltage, receivedAt: sample.at)
        if let data = try? JSONEncoder().encode(value) { shared.set(data, forKey: "vehicle-snapshot.v1"); WidgetCenter.shared.reloadAllTimelines() }
    }
}
