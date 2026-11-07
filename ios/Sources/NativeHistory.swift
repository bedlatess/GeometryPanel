import Foundation

struct NativeHistorySample: Codable, Equatable {
    var at: Double
    var soc: Double?
    var voltage: Double?
    var range: Double?
    var temperature: Double?
    var current: Double?
    var power: Double?
    var charging: Bool?
    var online: Bool?
    var frontPressure: Double?
    var rearPressure: Double?
    var tireWarning: Bool?
    var chargeFull: Bool?
    func dictionary() -> [String: Any] {
        var result: [String: Any] = ["at": at, "source": "ios-local-cloud-sample", "soc": soc as Any? ?? NSNull(), "range": range as Any? ?? NSNull(), "voltage": voltage as Any? ?? NSNull(), "current": current as Any? ?? NSNull(), "power": power as Any? ?? NSNull(), "charging": charging as Any? ?? NSNull(), "online": online as Any? ?? NSNull()]
        if let soc { result["soc"] = soc }; if let voltage { result["voltage"] = voltage }; if let range { result["range"] = range }; if let temperature { result["temperature"] = temperature }
        if let charging { result["charging"] = charging }; if let online { result["online"] = online }; if let frontPressure { result["frontPressure"] = frontPressure }; if let rearPressure { result["rearPressure"] = rearPressure }; if let tireWarning { result["tireWarning"] = tireWarning }
        return result
    }
}

enum NativeHistory {
    struct ChargeSession: Equatable, Codable {
        let startedAt: Double, lastSeenAt: Double
        let startSoc: Double?, endSoc: Double?
        let completed: Bool
        let full: Bool
        let sampleCount: Int
        func dictionary() -> [String: Any] {
            ["id": "charge-" + String(Int64(startedAt)), "startedAt": startedAt, "endedAt": completed || full ? lastSeenAt as Any : NSNull(), "lastSeenAt": lastSeenAt, "startSoc": startSoc as Any? ?? NSNull(), "endSoc": endSoc as Any? ?? NSNull(), "status": full ? "full" : completed ? "interrupted" : Date().timeIntervalSince1970 * 1000 - lastSeenAt < 6 * 3600 * 1000 ? "charging" : "unknown", "sampleCount": sampleCount, "estimated": true]
        }
    }
    static func chargeSessions(_ samples: [NativeHistorySample]) -> [ChargeSession] {
        var result: [ChargeSession] = [], start: NativeHistorySample?, last: NativeHistorySample?, count = 0, full = false
        for sample in samples.sorted(by: { $0.at < $1.at }) {
            if let previous = last, sample.at - previous.at > 6 * 3600 * 1000, let first = start {
                result.append(ChargeSession(startedAt: first.at, lastSeenAt: previous.at, startSoc: first.soc, endSoc: previous.soc, completed: false, full: full, sampleCount: count)); start = nil; count = 0; full = false
            }
            if sample.charging == true || sample.chargeFull == true { if start == nil { start = sample }; last = sample; count += 1; full = full || sample.chargeFull == true }
            else if sample.charging == false, let first = start, let previous = last {
                result.append(ChargeSession(startedAt: first.at, lastSeenAt: sample.at, startSoc: first.soc, endSoc: sample.soc ?? previous.soc, completed: true, full: full, sampleCount: count + 1)); start = nil; last = nil; count = 0; full = false
            }
        }
        if let first = start, let last { result.append(ChargeSession(startedAt: first.at, lastSeenAt: last.at, startSoc: first.soc, endSoc: last.soc, completed: false, full: full, sampleCount: count)) }
        return result
    }
    struct Event: Codable {
        let id: String, at: Double, kind: String, title: String, body: String
        func dictionary() -> [String: Any] { ["id": id, "at": at, "kind": kind, "title": title, "body": body] }
    }
    private struct Document: Codable { var samples: [NativeHistorySample] = []; var charges: [ChargeSession] = []; var events: [Event] = []; var chargeClearAt: Double = 0 }
    private static func name(_ account: NativeAccount, _ vehicle: NativeVehicle) -> String { vehicle.scope(accountId: account.id + "|" + account.uid) + ".history" }
    private static func load(_ account: NativeAccount, _ vehicle: NativeVehicle) throws -> Document { try EncryptedLocalFile.read(Document.self, name: name(account, vehicle)) ?? Document() }
    static func last(account: NativeAccount, vehicle: NativeVehicle) -> NativeHistorySample? { try? load(account, vehicle).samples.last }
    static func append(_ sample: NativeHistorySample, account: NativeAccount, vehicle: NativeVehicle) throws {
        let now = Date().timeIntervalSince1970 * 1000
        guard sample.at.isFinite, sample.at > 0, sample.at <= now + 5000 else { throw PanelError.invalid("采样时间无效。") }
        var document = try load(account, vehicle)
        if let prior = document.samples.last, sample.at - prior.at < 10000 { return }
        document.samples.append(sample); document.samples.removeAll { now - $0.at > 30 * 86400 * 1000 }; if document.samples.count > 2000 { document.samples.removeFirst(document.samples.count - 2000) }
        for charge in chargeSessions(document.samples.filter({ $0.at >= document.chargeClearAt })) {
            document.charges.removeAll { $0.startedAt == charge.startedAt }; document.charges.append(charge)
        }
        document.charges.removeAll { now - $0.lastSeenAt > 30 * 86400 * 1000 }; document.charges.sort { $0.startedAt < $1.startedAt }; if document.charges.count > 500 { document.charges.removeFirst(document.charges.count - 500) }
        try EncryptedLocalFile.write(document, name: name(account, vehicle))
    }
    static func read(account: NativeAccount, vehicle: NativeVehicle, kind: String, before: Double?, limit: Int) throws -> [String: Any] {
        let document = try load(account, vehicle), maximum = min(max(limit, 1), 500)
        if kind == "battery" { return ["kind": kind, "items": document.samples.filter { before == nil || $0.at < before! }.suffix(maximum).reversed().map { $0.dictionary() }, "total": document.samples.count] }
        if kind == "events" { return ["kind": kind, "items": document.events.filter { before == nil || $0.at < before! }.suffix(maximum).reversed().map { $0.dictionary() }, "total": document.events.count] }
        return ["kind": "charge", "items": document.charges.filter { before == nil || $0.startedAt < before! }.suffix(maximum).reversed().map { $0.dictionary() }, "total": document.charges.count]
    }
    static func event(account: NativeAccount, vehicle: NativeVehicle, kind: String, title: String, body: String) throws {
        var document = try load(account, vehicle), now = Date().timeIntervalSince1970 * 1000
        document.events.append(Event(id: UUID().uuidString, at: now, kind: kind, title: title, body: body)); document.events.removeAll { now - $0.at > 30 * 86400 * 1000 }; if document.events.count > 500 { document.events.removeFirst(document.events.count - 500) }
        try EncryptedLocalFile.write(document, name: name(account, vehicle))
    }
    static func clear(account: NativeAccount, vehicle: NativeVehicle, kind: String = "all") throws {
        if kind == "all" { EncryptedLocalFile.remove(name: name(account, vehicle)); return }
        var document = try load(account, vehicle)
        if kind == "battery" { document.samples.removeAll() }; if kind == "charge" { document.charges.removeAll(); document.chargeClearAt = Date().timeIntervalSince1970 * 1000 }; if kind == "events" { document.events.removeAll() }
        try EncryptedLocalFile.write(document, name: name(account, vehicle))
    }
}
