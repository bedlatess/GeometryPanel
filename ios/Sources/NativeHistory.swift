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
    var reportState: String?
    var reportedAt: Double?
    func dictionary() -> [String: Any] {
        var result: [String: Any] = ["at": at, "source": "ios-local-cloud-sample", "soc": soc as Any? ?? NSNull(), "range": range as Any? ?? NSNull(), "voltage": voltage as Any? ?? NSNull(), "current": current as Any? ?? NSNull(), "power": power as Any? ?? NSNull(), "charging": charging as Any? ?? NSNull(), "online": online as Any? ?? NSNull()]
        if let soc { result["soc"] = soc }; if let voltage { result["voltage"] = voltage }; if let range { result["range"] = range }; if let temperature { result["temperature"] = temperature }
        if let charging { result["charging"] = charging }; if let online { result["online"] = online }; if let frontPressure { result["frontPressure"] = frontPressure }; if let rearPressure { result["rearPressure"] = rearPressure }; if let tireWarning { result["tireWarning"] = tireWarning }
        result["reportState"] = reportState ?? "unknown"; result["reportedAt"] = reportedAt as Any? ?? NSNull()
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
        var closedUnknown = false
        func dictionary() -> [String: Any] {
            ["id": "charge-" + String(Int64(startedAt)), "startedAt": startedAt, "endedAt": completed || full || closedUnknown ? lastSeenAt as Any : NSNull(), "lastSeenAt": lastSeenAt, "startSoc": startSoc as Any? ?? NSNull(), "endSoc": endSoc as Any? ?? NSNull(), "status": closedUnknown ? "unknown" : full ? "full" : completed ? "interrupted" : Date().timeIntervalSince1970 * 1000 - lastSeenAt <= 300000 ? "charging" : "unknown", "sampleCount": sampleCount, "estimated": true]
        }
    }
    static func chargeSessions(_ samples: [NativeHistorySample]) -> [ChargeSession] {
        var result: [ChargeSession] = [], start: NativeHistorySample?, last: NativeHistorySample?, previous: NativeHistorySample?, count = 0
        for incoming in samples.sorted(by: { $0.at < $1.at }) {
            if incoming.reportState == "future" { continue }; var sample = incoming
            if sample.reportState == "stale" { sample.charging = nil; sample.chargeFull = nil }; defer { previous = sample }
            if let previous, sample.at - previous.at > 300000, let first = start {
                result.append(ChargeSession(startedAt: first.at, lastSeenAt: previous.at, startSoc: first.soc, endSoc: previous.soc, completed: false, full: false, sampleCount: count, closedUnknown: true)); start = nil; last = nil; count = 0
            }
            if sample.charging == true { if start == nil { start = sample }; last = sample; count += 1 }
            else if sample.charging == false, let first = start, let previous = last {
                result.append(ChargeSession(startedAt: first.at, lastSeenAt: sample.at, startSoc: first.soc, endSoc: sample.soc ?? previous.soc, completed: true, full: sample.chargeFull == true, sampleCount: count + 1)); start = nil; last = nil; count = 0
            }
        }
        if let first = start, let last { result.append(ChargeSession(startedAt: first.at, lastSeenAt: last.at, startSoc: first.soc, endSoc: last.soc, completed: false, full: false, sampleCount: count)) }
        return result
    }
    struct Event: Codable {
        let id: String, at: Double, kind: String, title: String, body: String
        func dictionary() -> [String: Any] { ["id": id, "at": at, "kind": kind, "title": title, "body": body] }
    }
    private struct Document: Codable { var samples: [NativeHistorySample] = []; var charges: [ChargeSession] = []; var events: [Event] = []; var chargeClearAt: Double = 0 }
    private static func name(_ account: NativeAccount, _ vehicle: NativeVehicle) -> String { vehicle.scope(accountId: account.id + "|" + account.uid) + ".history" }
    private static func load(_ account: NativeAccount, _ vehicle: NativeVehicle) throws -> Document {
        var document = try EncryptedLocalFile.read(Document.self, name: name(account, vehicle)) ?? Document(), now = Date().timeIntervalSince1970 * 1000
        let counts = [document.samples.count, document.charges.count, document.events.count]
        document.samples = Array(document.samples.filter { $0.at <= now && now - $0.at <= 90 * 86400 * 1000 }.suffix(5000))
        document.charges = Array(document.charges.filter { $0.lastSeenAt <= now && now - $0.lastSeenAt <= 90 * 86400 * 1000 }.suffix(500))
        document.events = Array(document.events.filter { $0.at <= now && now - $0.at <= 90 * 86400 * 1000 }.suffix(500))
        if counts != [document.samples.count, document.charges.count, document.events.count] { try EncryptedLocalFile.write(document, name: name(account, vehicle)) }; return document
    }
    static func last(account: NativeAccount, vehicle: NativeVehicle) -> NativeHistorySample? { try? load(account, vehicle).samples.last }
    static func append(_ sample: NativeHistorySample, account: NativeAccount, vehicle: NativeVehicle) throws {
        let now = Date().timeIntervalSince1970 * 1000
        guard sample.at.isFinite, sample.at > 0, sample.at <= now else { throw PanelError.invalid("采样时间无效。") }; if sample.reportState == "future" { return }
        var sample = sample; if sample.reportState == "stale" { sample.charging = nil; sample.chargeFull = nil }
        var document = try load(account, vehicle)
        if let prior = document.samples.last, sample.at <= prior.at { return }
        let previous = document.samples.last; document.samples.append(sample); document.samples.removeAll { now - $0.at > 90 * 86400 * 1000 }; if document.samples.count > 5000 { document.samples.removeFirst(document.samples.count - 5000) }
        var active = document.charges.lastIndex { !$0.completed && !$0.full && !$0.closedUnknown }
        if let index = active, let previous, sample.at - previous.at > 300000 {
            let old = document.charges[index]; document.charges[index] = ChargeSession(startedAt: old.startedAt, lastSeenAt: previous.at, startSoc: old.startSoc, endSoc: previous.soc ?? old.endSoc, completed: false, full: false, sampleCount: old.sampleCount, closedUnknown: true); active = nil
        }
        if sample.at >= document.chargeClearAt, sample.charging == true {
            if let index = active { let old = document.charges[index]; document.charges[index] = ChargeSession(startedAt: old.startedAt, lastSeenAt: sample.at, startSoc: old.startSoc, endSoc: sample.soc, completed: false, full: false, sampleCount: old.sampleCount + 1) }
            else { document.charges.append(ChargeSession(startedAt: sample.at, lastSeenAt: sample.at, startSoc: sample.soc, endSoc: sample.soc, completed: false, full: false, sampleCount: 1)) }
        } else if sample.charging == false, let index = active {
            let old = document.charges[index]; document.charges[index] = ChargeSession(startedAt: old.startedAt, lastSeenAt: sample.at, startSoc: old.startSoc, endSoc: sample.soc, completed: true, full: sample.chargeFull == true, sampleCount: old.sampleCount + 1)
        }
        document.charges.removeAll { now - $0.lastSeenAt > 90 * 86400 * 1000 }; document.charges.sort { $0.startedAt < $1.startedAt }; if document.charges.count > 500 { document.charges.removeFirst(document.charges.count - 500) }
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
        document.events.append(Event(id: UUID().uuidString, at: now, kind: kind, title: title, body: body)); document.events.removeAll { now - $0.at > 90 * 86400 * 1000 }; if document.events.count > 500 { document.events.removeFirst(document.events.count - 500) }
        try EncryptedLocalFile.write(document, name: name(account, vehicle))
    }
    static func clear(account: NativeAccount, vehicle: NativeVehicle, kind: String = "all") throws {
        if kind == "all" { EncryptedLocalFile.remove(name: name(account, vehicle)); return }
        var document = try load(account, vehicle)
        if kind == "battery" { document.samples.removeAll() }; if kind == "charge" { document.charges.removeAll(); document.chargeClearAt = Date().timeIntervalSince1970 * 1000 }; if kind == "events" { document.events.removeAll() }
        try EncryptedLocalFile.write(document, name: name(account, vehicle))
    }
}
