import Foundation
import CoreBluetooth

@MainActor final class BluetoothKey: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private lazy var central = CBCentralManager(delegate: self, queue: .main)
    private var devices: [UUID: CBPeripheral] = [:]
    private var discovered: [UUID: [String: Any]] = [:]
    private var peer: CBPeripheral?
    private var writable: CBCharacteristic?
    private var input = Data()
    private var output: [Data] = []
    private var awaiting: (UInt8, (Result<Data, Error>) -> Void)?
    private var connecting: ((Result<Void, Error>) -> Void)?
    private var timer: DispatchWorkItem?
    private var scanning = false
    private var scanGeneration = 0
    private var authenticated = false, telemetry = false, dashboard = false
    private(set) var proximity = false
    private var lastRSSI: Int?
    private var telemetryValues: [String: Any] = [:]
    var binding: VehicleBinding?
    var disconnected: (() -> Void)?
    var event: (() -> Void)?

    var status: [String: Any] {
        ["state": peer == nil ? "disconnected" : writable == nil ? "connecting" : authenticated ? "authenticated" : "connected_unverified",
         "authenticated": authenticated, "automaticUnlockVerified": false, "systemBondVerified": false,
         "proximity": proximity, "rssi": lastRSSI as Any? ?? NSNull(), "telemetry": telemetryValues,
         "telemetrySubscribed": telemetry, "dashboardSubscribed": dashboard]
    }
    func scan() async throws -> [[String: Any]] {
        _ = central
        for _ in 0..<50 where central.state == .unknown || central.state == .resetting { try? await Task.sleep(nanoseconds: 100_000_000) }
        guard central.state == .poweredOn else { throw PanelError.unavailable("请允许蓝牙权限并打开蓝牙，然后再扫描。") }
        guard !scanning, connecting == nil, awaiting == nil else { throw PanelError.invalid("已有蓝牙操作在进行。") }
        guard let binding else { throw PanelError.invalid("请先刷新当前车辆的蓝牙资料。") }; _ = try binding.requireKey()
        scanGeneration += 1; let scanEpoch = scanGeneration
        scanning = true; discovered.removeAll(); devices.removeAll()
        central.scanForPeripherals(withServices: [CBUUID(string: KeyProtocol.service)], options: [CBCentralManagerScanOptionAllowDuplicatesKey: false])
        try? await Task.sleep(nanoseconds: 8_000_000_000)
        guard scanGeneration == scanEpoch else { throw PanelError.cancelled }
        central.stopScan(); scanning = false
        return discovered.values.sorted { ($0["rssi"] as? Int ?? -127) > ($1["rssi"] as? Int ?? -127) }
    }
    func connect(_ id: String) async throws {
        guard central.state == .poweredOn else { throw PanelError.unavailable("请打开蓝牙。") }
        guard let binding else { throw PanelError.invalid("请先刷新蓝牙资料。") }; _ = try binding.requireKey()
        guard let uuid = UUID(uuidString: id), let device = devices[uuid] else { throw PanelError.invalid("请选择本轮扫描到的车辆。") }
        guard device.state == .disconnected else { throw PanelError.invalid("该设备仍有连接或正在断开，请稍后再连接。") }
        disconnect(); peer = device; device.delegate = self
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            connecting = { continuation.resume(with: $0) }
            armTimeout(20); central.connect(device, options: [CBConnectPeripheralOptionNotifyOnDisconnectionKey: true])
        }
    }
    func disconnect() {
        scanGeneration += 1; if scanning { central.stopScan() }; scanning = false; devices.removeAll(); discovered.removeAll()
        timer?.cancel(); timer = nil
        if let peer { central.cancelPeripheralConnection(peer) }
        peer = nil; writable = nil; authenticated = false; telemetry = false; dashboard = false
        input.removeAll(); output.removeAll(); telemetryValues.removeAll()
        let old = awaiting; awaiting = nil; old?.1(.failure(PanelError.cancelled))
        let pending = connecting; connecting = nil; pending?(.failure(PanelError.cancelled))
    }
    func setProximity(_ enabled: Bool) throws {
        if enabled { guard authenticated else { throw PanelError.invalid("先完成蓝牙认证，再开启连接提醒。") } }
        proximity = enabled
        if enabled { peer?.readRSSI() }
    }
    func command(_ action: String) async throws -> [String: Any] {
        guard let binding else { throw PanelError.invalid("请先刷新蓝牙资料。") }; let material = try binding.requireKey()
        if action == "bond" { throw PanelError.unavailable("iOS 由系统在特征要求加密时提示配对，不能由网页强制系统配对；请按系统提示操作。") }
        if action == "authenticate" {
            authenticated = false
            let first = try KeyProtocol.decode(await transact(0x5a, expected: 0x5b, payload: KeyProtocol.bytes(1, material.0)))
            guard case .bytes(let challenge)? = first[1] else { throw PanelError.invalid("未收到有效蓝牙认证挑战。") }
            let clear = try KeyProtocol.decryptChallenge(challenge, key: material.1)
            let second = try KeyProtocol.decode(await transact(0x5c, expected: 0x5d, payload: KeyProtocol.bytes(1, clear)))
            guard second[1] == .number(0) else { throw PanelError.invalid("车辆未通过蓝牙认证。") }
            authenticated = true; return ["authenticated": true, "automaticUnlockVerified": false]
        }
        guard authenticated else { throw PanelError.invalid("请先完成蓝牙认证。") }
        switch action {
        case "register":
            guard binding.cloudEnabled == true else { throw PanelError.invalid("请先在官方车辆设置中开启感应功能并刷新，不能在未知开关状态下登记。") }
            guard binding.inductiveGeneration == "2.0" || binding.inductiveGeneration == "2" else { throw PanelError.unavailable("当前只恢复了 2.0 的本机登记协议。") }
            let identity = try SecureStore.identity()
            let result = try await transact(0x77, expected: 0xf7, payload: KeyProtocol.bytes(1, identity), timeout: 8)
            guard result.isEmpty else { throw PanelError.invalid("登记回复格式与旧版协议不符。") }
            if binding.broadcastType != "1" {
                let response = try KeyProtocol.decode(await transact(0x78, expected: 0xf8, payload: KeyProtocol.number(1, 2), timeout: 6))
                guard response[1] == .number(1) else { throw PanelError.invalid("车辆没有确认配对广播设置。") }
            }
            return ["bindAcknowledged": true, "uniqueIdentify": identity.hex, "systemBondVerified": false, "automaticUnlockVerified": false]
        case "query":
            let request = KeyProtocol.number(1, 1) + KeyProtocol.bytes(2, try SecureStore.identity())
            let response = try KeyProtocol.decode(await transact(0x7f, expected: 0xff, payload: request, timeout: 6))
            guard response[1] == .number(1) else { throw PanelError.invalid("车辆钥匙角色不匹配。") }
            return ["vehicleRegistered": response[2] == nil || response[2] == .number(0), "automaticUnlockVerified": false]
        case "telemetryOn", "telemetryOff":
            let enabled = action == "telemetryOn"
            _ = try await transact(0x7c, expected: 0xfc, payload: enabled ? KeyProtocol.number(1, 1) : Data(), timeout: 6)
            telemetry = enabled; return ["subscribed": enabled]
        case "dashboardOn", "dashboardOff":
            let enabled = action == "dashboardOn"
            _ = try await transact(0x72, expected: 0xf2, payload: KeyProtocol.number(1, enabled ? 1 : 0), timeout: 6)
            dashboard = enabled; return ["subscribed": enabled, "schemaVerified": false]
        default: throw PanelError.invalid("不支持的蓝牙操作。")
        }
    }
    private func transact(_ command: UInt8, expected: UInt8, payload: Data, timeout: Double = 10) async throws -> Data {
        guard let peer, let writable, peer.state == .connected, awaiting == nil else { throw PanelError.disconnected }
        let frame = try KeyProtocol.frame(command, payload)
        let size = max(1, min(peer.maximumWriteValueLength(for: .withResponse), 244))
        return try await withCheckedThrowingContinuation { continuation in
            awaiting = (expected, { continuation.resume(with: $0) }); output = stride(from: 0, to: frame.count, by: size).map { frame.subdata(in: $0..<min($0 + size, frame.count)) }
            armTimeout(timeout); peer.writeValue(output.removeFirst(), for: writable, type: .withResponse)
        }
    }
    private func armTimeout(_ seconds: Double) {
        timer?.cancel(); let task = DispatchWorkItem { [weak self] in self?.fail(PanelError.timeout) }; timer = task
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: task)
    }
    private func fail(_ error: Error) {
        timer?.cancel(); timer = nil
        let old = awaiting; awaiting = nil; old?.1(.failure(error))
        let pending = connecting; connecting = nil; pending?(.failure(error))
        if let peer { central.cancelPeripheralConnection(peer) }
        peer = nil; writable = nil; authenticated = false; input.removeAll(); output.removeAll(); event?()
    }
    func centralManagerDidUpdateState(_ central: CBCentralManager) { if central.state != .poweredOn { fail(PanelError.disconnected) }; event?() }
    func centralManager(_ central: CBCentralManager, didDiscover peripheral: CBPeripheral, advertisementData: [String : Any], rssi RSSI: NSNumber) {
        guard scanning, discovered.count < 32 else { return }; devices[peripheral.identifier] = peripheral
        let name = String((advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? peripheral.name ?? "附近车辆").prefix(60))
        discovered[peripheral.identifier] = ["id": peripheral.identifier.uuidString, "name": name, "rssi": RSSI.intValue]
    }
    func centralManager(_ central: CBCentralManager, didConnect peripheral: CBPeripheral) {
        guard peripheral === peer else { central.cancelPeripheralConnection(peripheral); return }
        peripheral.discoverServices([CBUUID(string: KeyProtocol.service)])
    }
    func centralManager(_ central: CBCentralManager, didFailToConnect peripheral: CBPeripheral, error: Error?) { if peripheral === peer { fail(PanelError.disconnected) } }
    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral peripheral: CBPeripheral, error: Error?) {
        guard peripheral === peer else { return }; let notify = proximity; fail(PanelError.disconnected); if notify { disconnected?() }
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverServices error: Error?) {
        guard peripheral === peer else { return }
        guard error == nil, let service = peripheral.services?.first(where: { $0.uuid == CBUUID(string: KeyProtocol.service) }) else { fail(PanelError.unavailable("未找到旧版车辆蓝牙服务。")); return }
        peripheral.discoverCharacteristics([CBUUID(string: KeyProtocol.write), CBUUID(string: KeyProtocol.notify)], for: service)
    }
    func peripheral(_ peripheral: CBPeripheral, didDiscoverCharacteristicsFor service: CBService, error: Error?) {
        guard peripheral === peer else { return }
        guard error == nil, let write = service.characteristics?.first(where: { $0.uuid == CBUUID(string: KeyProtocol.write) && $0.properties.contains(.write) }),
              let notify = service.characteristics?.first(where: { $0.uuid == CBUUID(string: KeyProtocol.notify) && $0.properties.contains(.notify) }) else { fail(PanelError.unavailable("车辆蓝牙特征与恢复协议不匹配。")); return }
        writable = write; peripheral.setNotifyValue(true, for: notify)
    }
    func peripheral(_ peripheral: CBPeripheral, didUpdateNotificationStateFor characteristic: CBCharacteristic, error: Error?) {
        guard peripheral === peer else { return }
        guard error == nil, characteristic.isNotifying else { fail(PanelError.unavailable("车辆没有允许蓝牙通知。")); return }
        timer?.cancel(); timer = nil; let done = connecting; connecting = nil; done?(.success(())); event?()
    }
    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic, error: Error?) {
        guard peripheral === peer else { return }; if error != nil { fail(PanelError.disconnected); return }
        if !output.isEmpty, let writable { peripheral.writeValue(output.removeFirst(), for: writable, type: .withResponse) }
    }
    func peripheral(_ peripheral: CBPeripheral, didReadRSSI RSSI: NSNumber, error: Error?) { if peripheral === peer && error == nil { lastRSSI = RSSI.intValue; event?() } }
    func peripheral(_ peripheral: CBPeripheral, didUpdateValueFor characteristic: CBCharacteristic, error: Error?) {
        guard peripheral === peer, characteristic.uuid == CBUUID(string: KeyProtocol.notify), error == nil, let value = characteristic.value else { return }
        input += value
        do { while let (command, payload) = try KeyProtocol.takeFrame(&input) {
            if let pending = awaiting, pending.0 == command {
                timer?.cancel(); timer = nil; awaiting = nil; output.removeAll(); pending.1(.success(payload))
            } else if authenticated && ((command == 0xfd && telemetry) || (command == 0xf3 && dashboard)) {
                let fields = try KeyProtocol.decode(payload); var data: [String: Any] = ["receivedAt": Date().timeIntervalSince1970 * 1000, "schemaVerified": false]
                if command == 0xfd {
                    if case .number(let value)? = fields[2], value <= 200 { data["socPercent"] = Double(value) / 2 }
                    for (index, name, range) in [(5, "voltageV", 0.0...200.0), (6, "temperatureC", -50.0...150.0)] {
                        if case .fixed32(let bits)? = fields[index] { let value = Double(Float(bitPattern: bits)); if value.isFinite && range.contains(value) { data[name] = value } }
                    }
                } else if case .number(let value)? = fields[1], value <= 300 { data["speedKph"] = value }
                telemetryValues = data; event?()
            }
        } } catch { fail(PanelError.invalid("蓝牙回复格式异常，已停止本轮。")) }
    }
}
