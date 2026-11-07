import Foundation

enum NativeCloudError: Error { case expired, network, format, rejected, limit }
final class NoCloudRedirects: NSObject, URLSessionTaskDelegate {
    func urlSession(_ session: URLSession, task: URLSessionTask, willPerformHTTPRedirection response: HTTPURLResponse, newRequest request: URLRequest, completionHandler: @escaping (URLRequest?) -> Void) { completionHandler(nil) }
}

enum LegacyCloudSignature {
    static func sign(body: String = "", query: [String: String] = [:], timestamp: Int64, nonce: String, h5: Bool = false) -> (canonical: String, parameters: String, digest: String) {
        let canonical = query.keys.filter { query[$0] != "" }.sorted().map { $0 + "=" + query[$0]! }.joined(separator: "&")
        let parameters = "appId=\(h5 ? "AiTXmBrm" : "S7qPWPU1")&nonce=\(nonce)&timestamp=\(timestamp)"
        var sha = [UInt8](repeating: 0, count: Int(CC_SHA1_DIGEST_LENGTH)); let secret = h5 ? "70c2c7458ab88ca9504ad0521f170075bc91f2f7" : "c5e0da7f4da28df805694ec3dd1fc6792e9df99d", input = Data((canonical + body + parameters + secret).utf8)
        _ = input.withUnsafeBytes { CC_SHA1($0.baseAddress, CC_LONG(input.count), &sha) }
        return (canonical, parameters, MeterWire.md5(Data(Data(sha).hex.utf8)))
    }
}

struct NativeCloudSnapshot {
    let sample: NativeHistorySample
    let messageIds: Set<String>
    let partial: Bool
}

final class NativeCloud {
    private let session: URLSession
    init() {
        let configuration = URLSessionConfiguration.ephemeral; configuration.httpShouldSetCookies = false; configuration.urlCache = nil
        configuration.timeoutIntervalForRequest = 12; configuration.timeoutIntervalForResource = 20
        session = URLSession(configuration: configuration, delegate: NoCloudRedirects(), delegateQueue: nil)
    }
    static func request(path: String, token: String, query: [String: String] = [:], timestamp: Int64? = nil, nonce: String? = nil, method: String = "GET", body: String = "", h5: Bool = false) throws -> URLRequest {
        guard path.range(of: h5 ? "^/cfmotoservermine/H5/signin(?:/(?:info|supplementPrize))?$" : "^/v1\\.0/[A-Za-z0-9/_-]+$", options: .regularExpression) != nil, ["GET", "POST", "PUT", "DELETE"].contains(method), body.utf8.count <= 8192, query.count <= 30,
              query.allSatisfy({ $0.key.range(of: "^[A-Za-z][A-Za-z0-9_]{0,63}$", options: .regularExpression) != nil && $0.value.count <= 256 && $0.value.range(of: "^[A-Za-z0-9_.:-]*$", options: .regularExpression) != nil }),
              !token.isEmpty, token.utf8.count <= 4096, token.rangeOfCharacter(from: .whitespacesAndNewlines) == nil else { throw NativeCloudError.format }
        let time = timestamp ?? Int64(Date().timeIntervalSince1970 * 1000), random = nonce ?? String(time) + String(UUID().uuidString.replacingOccurrences(of: "-", with: "").lowercased().prefix(16))
        let signed = LegacyCloudSignature.sign(body: body, query: query, timestamp: time, nonce: random, h5: h5)
        guard let url = URL(string: (h5 ? "https://h5.zeehoev.com" : "https://tapi.zeehoev.com") + path + (signed.canonical.isEmpty ? "" : "?" + signed.canonical)) else { throw NativeCloudError.format }
        var request = URLRequest(url: url, cachePolicy: .reloadIgnoringLocalAndRemoteCacheData, timeoutInterval: 12)
        request.httpMethod = method; if !body.isEmpty { request.httpBody = Data(body.utf8) }
        request.setValue("application/json;charset=UTF-8", forHTTPHeaderField: "Content-Type"); request.setValue("zh-CN", forHTTPHeaderField: "Accept-Language"); request.setValue("2", forHTTPHeaderField: "interfaceversion")
        request.setValue(signed.parameters, forHTTPHeaderField: "cfmoto-x-param"); request.setValue(signed.digest, forHTTPHeaderField: "cfmoto-x-sign"); request.setValue("0", forHTTPHeaderField: "cfmoto-x-sign-type"); request.setValue("Bearer " + token, forHTTPHeaderField: "Authorization")
        return request
    }
    func perform(_ path: String, token: String, query: [String: String] = [:], method: String = "GET", body: String = "", h5: Bool = false) async throws -> Any {
        let request = try Self.request(path: path, token: token, query: query, method: method, body: body, h5: h5)
        do {
            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw NativeCloudError.network }
            if http.statusCode == 401 { throw NativeCloudError.expired }
            guard !(300..<400).contains(http.statusCode), response.expectedContentLength <= 2 * 1024 * 1024 else { throw NativeCloudError.limit }
            var data = Data()
            for try await byte in bytes { data.append(byte); if data.count > 2 * 1024 * 1024 { throw NativeCloudError.limit }; if data.count % 4096 == 0 { try Task.checkCancellation() } }
            guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any] else { throw NativeCloudError.format }
            if String(describing: root["code"] ?? "") == "10000", (200..<300).contains(http.statusCode) {
                if let flag = root["data"] as? NSNumber, CFGetTypeID(flag) == CFBooleanGetTypeID(), !flag.boolValue { throw NativeCloudError.rejected }
                return root["data"] ?? NSNull()
            }
            let message = String(describing: root["message"] ?? "").lowercased()
            if message.contains("token") && (message.contains("invalid") || message.contains("失效") || message.contains("过期")) || message.contains("请重新登录") || message.contains("登录已过期") { throw NativeCloudError.expired }
            throw NativeCloudError.rejected
        } catch is CancellationError { throw CancellationError() }
        catch let error as NativeCloudError { throw error }
        catch { throw NativeCloudError.network }
    }
    private func get(_ path: String, token: String, query: [String: String] = [:]) async throws -> [String: Any] {
        guard let data = try await perform(path, token: token, query: query) as? [String: Any] else { throw NativeCloudError.format }; return data
    }
    func snapshot(account: NativeAccount, vehicle: NativeVehicle, tire: Bool, messages: Bool) async throws -> NativeCloudSnapshot {
        let prefix = "/v1.0/app/cfmotoserverapp", home = try await get(prefix + "/vehicleHomePageV2/" + vehicle.vin, token: account.token)
        if let reported = home["vinNo"] as? String, reported != vehicle.vin { throw NativeCloudError.format }
        try Task.checkCancellation(); var battery: [String: Any] = [:], tires: [String: Any] = [:], inbox: [String: Any] = [:], partial = false
        do { battery = try await get(prefix + "/batteryInfo/" + vehicle.vin, token: account.token) } catch NativeCloudError.expired { throw NativeCloudError.expired } catch is CancellationError { throw CancellationError() } catch { partial = true }
        if tire { do { tires = try await get(prefix + "/app/vehicle/tire/monitoring", token: account.token, query: ["sensorType": "EXTERNAL", "vinNo": vehicle.vin]) } catch NativeCloudError.expired { throw NativeCloudError.expired } catch is CancellationError { throw CancellationError() } catch { partial = true } }
        if messages { do { inbox = try await get("/v1.0/mine/cfmotoservermine/app/Message/list_v2", token: account.token, query: ["messageKind": "3", "page": "1", "pageSize": "20", "userId": account.uid]) } catch NativeCloudError.expired { throw NativeCloudError.expired } catch is CancellationError { throw CancellationError() } catch { partial = true } }
        return Self.parse(home: home, battery: battery, tires: tires, inbox: inbox, vin: vehicle.vin, partial: partial)
    }
    static func number(_ value: Any?, range: ClosedRange<Double>) -> Double? {
        guard let value, value is NSNumber || value is String else { return nil }
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
        guard let number = Double(String(describing: value)), number.isFinite, range.contains(number) else { return nil }; return number
    }
    static func reportedTime(_ value: Any?) -> Double? {
        guard let value, value is String || value is NSNumber else { return nil }
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
        let text = String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
        if text.range(of: "^(?:[0-9]{10}|[0-9]{12,13})$", options: .regularExpression) != nil, let number = Double(text) {
            let at = number * (text.count == 10 ? 1000 : 1); return at >= 946684800000 ? at : nil
        }
        guard text.range(of: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}[ T](?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\\.[0-9]{1,3})?)?(?:Z|[+-][0-9]{2}:?[0-9]{2})?$", options: .regularExpression) != nil else { return nil }
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = TimeZone(secondsFromGMT: 28800); formatter.isLenient = false
        for format in ["yyyy-MM-dd HH:mm:ss.SSSXXXXX", "yyyy-MM-dd HH:mm:ssXXXXX", "yyyy-MM-dd HH:mmXXXXX", "yyyy-MM-dd HH:mm:ss.SSS", "yyyy-MM-dd HH:mm:ss", "yyyy-MM-dd HH:mm"] {
            formatter.dateFormat = format
            if let date = formatter.date(from: text.replacingOccurrences(of: "T", with: " ")) { return date.timeIntervalSince1970 * 1000 }
        }
        return nil
    }
    static func parse(home: [String: Any], battery: [String: Any], tires: [String: Any], inbox: [String: Any], vin: String, partial: Bool, now: Double = Date().timeIntervalSince1970 * 1000) -> NativeCloudSnapshot {
        func numeric(_ keys: [String], range: ClosedRange<Double>) -> Double? { for source in [battery, home] { for key in keys { if let value = number(source[key], range: range) { return value } } }; return nil }
        func electrical(_ raw: [String:Any], powerKey: String) -> (Double?, Double?) {
            let voltage = number(raw["voltage"], range: 0...300) ?? number(raw["bmsVoltage"], range: 0...300), current = number(raw["current"], range: -1000...1000), power = number(raw[powerKey], range: -100000...100000)
            return (current ?? (voltage != nil && voltage! > 0 && power != nil ? power! / voltage! : nil), power ?? (voltage != nil && current != nil ? voltage! * current! : nil))
        }
        let batteryElectrical = electrical(battery, powerKey: "power"), homeElectrical = electrical(home, powerKey: "batteryPower"), reported = reportedTime(battery["refreshTime"])
        let reportState = reported == nil ? "unknown" : reported! > now + 300000 ? "future" : now - reported! > 30 * 60 * 1000 ? "stale" : "fresh"
        let onlineText = String(describing: home["onlineStatus"] ?? "").lowercased(), chargeText = String(describing: battery["chargeState"] ?? home["chargeState"] ?? "")
        let online: Bool? = ["online","1","true"].contains(onlineText) ? true : ["offline","0","false"].contains(onlineText) ? false : nil
        let invalidReport = reportState == "stale" || reportState == "future", full: Bool? = invalidReport ? nil : String(describing: battery["chargeStateStr"] ?? "").contains("充满") ? true : nil
        let charging: Bool? = invalidReport ? nil : full == true ? false : chargeText == "1" ? true : chargeText == "0" ? false : nil
        let rows = tires["realTimeData"] as? [[String: Any]] ?? [], front = rows.last { number($0["sensorPosition"], range: 1...2) == 1 }, rear = rows.last { number($0["sensorPosition"], range: 1...2) == 2 }
        let pressureFront = number(front?["tirePressure"], range: 0...10), pressureRear = number(rear?["tirePressure"], range: 0...10)
        let warnings = rows.compactMap { number($0["warningType"], range: 0...100000) }; let tireWarning: Bool? = warnings.isEmpty ? nil : warnings.contains { $0 > 0 }
        let sample = NativeHistorySample(at: now, soc: numeric(["bmssoc"], range: 0...100), voltage: numeric(["voltage","bmsVoltage"], range: 0...300), range: number(home["hmiRidableMile"], range: 0...2000), temperature: numeric(["batteryTemp"], range: -50...150), current: batteryElectrical.0 ?? homeElectrical.0, power: batteryElectrical.1 ?? homeElectrical.1, charging: charging, online: online, frontPressure: pressureFront, rearPressure: pressureRear, tireWarning: tireWarning, chargeFull: full, reportState: reportState, reportedAt: reported)
        var ids: Set<String> = []
        for row in (inbox["messageVOList"] as? [[String: Any]] ?? []).prefix(100) {
            var reported = row["vinNo"] as? String
            if reported == nil, let extraText = row["extra"] as? String, let data = extraText.data(using: .utf8), data.count <= 16384, let extra = try? JSONSerialization.jsonObject(with: data) as? [String: Any] { reported = extra["vinNo"] as? String ?? (extra["carInfo"] as? [String:Any])?["vinNo"] as? String }
            guard reported == nil || reported == "" || reported == vin, let id = row["messageId"], let unread = number(row["unread"], range: 0...1), unread == 0 else { continue }
            let text = String(describing: id); if text.utf8.count <= 100 { ids.insert(text) }
        }
        return NativeCloudSnapshot(sample: sample, messageIds: ids, partial: partial)
    }
}
