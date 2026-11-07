import UIKit
import BackgroundTasks

struct NativeTaskConfiguration: Codable {
    static let actionNames = ["signin", "streakPrize", "like", "share", "post", "cleanup"]
    var enabled = false, time = "09:00", requestIntervalMs = 2000
    var actions = Dictionary(uniqueKeysWithValues: actionNames.map { ($0, false) })
    var postContent = "", legacyLikeConfirmed = false
    init() {}
    init(_ raw: [String: Any]) throws {
        guard let enabled = raw["enabled"] as? Bool, let time = raw["time"] as? String, time.range(of: "^(?:[01][0-9]|2[0-3]):[0-5][0-9]$", options: .regularExpression) != nil,
              let interval = NativeCloud.number(raw["requestIntervalMs"], range: 0...60000), interval.rounded() == interval,
              let actions = raw["actions"] as? [String: Any], Self.actionNames.allSatisfy({ actions[$0] is Bool }),
              let text = raw["postContent"] as? String, text.utf16.count <= 500, text.range(of: "[\\x00-\\x08\\x0b\\x0c\\x0e-\\x1f]", options: .regularExpression) == nil else { throw PanelError.invalid("自动任务配置无效。") }
        self.enabled = enabled; self.time = time; requestIntervalMs = Int(interval); self.actions = Dictionary(uniqueKeysWithValues: Self.actionNames.map { ($0, actions[$0] as? Bool ?? false) }); postContent = text; legacyLikeConfirmed = raw["legacyLikeConfirmed"] as? Bool ?? false
        guard self.actions["post"] != true || !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty, self.actions["cleanup"] != true || self.actions["post"] == true else { throw PanelError.invalid("发帖必须单独开启并输入内容，清理仅适用于本次发帖。") }
    }
    func dictionary() -> [String: Any] { ["enabled": enabled, "time": time, "requestIntervalMs": requestIntervalMs, "actions": actions, "postContent": postContent, "legacyLikeConfirmed": legacyLikeConfirmed] }
}

enum NativeTaskEvidence {
    struct Article { let id: String, author: String; let content: String?, at: Double? }
    static func day(_ now: Date = Date()) -> String {
        let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = TimeZone(secondsFromGMT: 28800); formatter.dateFormat = "yyyy-MM-dd"; return formatter.string(from: now)
    }
    static func articleId(_ value: Any?) -> String? {
        guard let value, value is String || value is NSNumber else { return nil }
        if let number = value as? NSNumber, CFGetTypeID(number) == CFBooleanGetTypeID() { return nil }
        let text = String(describing: value)
        guard text.range(of: "^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$", options: .regularExpression) != nil, text.range(of: "^(?:0+|true|false|null|undefined)$", options: [.regularExpression, .caseInsensitive]) == nil else { return nil }; return text
    }
    static func articles(_ raw: Any) throws -> [Article] {
        guard let rows = raw as? [[String: Any]], rows.count <= 500 else { throw NativeCloudError.format }
        return try rows.map { row in
            guard let id = articleId(row["tuuid"]) else { throw NativeCloudError.format }
            var at: Double?
            if let text = row["createDate"] as? String, text.range(of: "^20[0-9]{2}-[0-9]{2}-[0-9]{2}[ T](?:[01][0-9]|2[0-3]):[0-5][0-9]:[0-5][0-9](?:\\.[0-9]{1,6})?$", options: .regularExpression) != nil {
                let formatter = DateFormatter(); formatter.locale = Locale(identifier: "en_US_POSIX"); formatter.calendar = Calendar(identifier: .gregorian); formatter.timeZone = TimeZone(secondsFromGMT: 28800); formatter.dateFormat = "yyyy-MM-dd HH:mm:ss"; formatter.isLenient = false
                if let date = formatter.date(from: String(text.prefix(19)).replacingOccurrences(of: "T", with: " ")) { let fraction = text.count > 20 ? Double("0." + text.dropFirst(20)) ?? 0 : 0; at = (date.timeIntervalSince1970 + fraction) * 1000 }
            }
            return Article(id: id, author: row["userid"].map { String(describing: $0) } ?? "", content: row["tcontent"] as? String, at: at)
        }
    }
    static func created(before: [Article], after: [Article], uid: String, content: String, started: Double, ended: Double) -> (String?, Bool) {
        guard !uid.isEmpty, ended >= started else { return (nil, false) }
        let prior = Set(before.map(\.id)); var matches: Set<String> = []
        for article in after where !prior.contains(article.id) {
            guard !article.author.isEmpty, let body = article.content, let at = article.at else { return (nil, false) }
            if article.author == uid, body == content, at >= started - 2000, at <= ended + 2000 { matches.insert(article.id) }
        }
        return (matches.count == 1 ? matches.first : nil, matches.count <= 1)
    }
}

@MainActor final class NativeTasks {
    static let shared = NativeTasks(), identifier = "app.geometrypanel.mobile.daily-tasks"
    private var configuration = NativeTaskConfiguration()
    private let cloud = NativeCloud()
    private var task: Task<Void, Never>?, timer: Timer?
    private var generation = 0
    private var rows: [String: [String: Any]] = [:]
    private var attempting: [String: String] = [:]
    private var scheduled = false
    private var lastRun: Double?
    private let mine = "/v1.0/mine/cfmotoservermine", social = "/v1.0/social/cfmotoserversocial", h5 = "/cfmotoservermine/H5/signin"
    private init() { if let saved = try? EncryptedLocalFile.read(NativeTaskConfiguration.self, name: "tasks.v1") { configuration = saved } }
    func register() {
        BGTaskScheduler.shared.register(forTaskWithIdentifier: Self.identifier, using: .main) { granted in
            Task { @MainActor in
                self.scheduled = false; self.schedule()
                guard self.configuration.enabled, self.task == nil, self.due else { granted.setTaskCompleted(success: false); return }
                granted.expirationHandler = { Task { @MainActor in self.cancel() } }
                do { try self.run(accountId: nil, background: true, automatic: true, completion: { granted.setTaskCompleted(success: $0) }) } catch { granted.setTaskCompleted(success: false) }
            }
        }
        schedule()
    }
    func foreground(_ active: Bool) {
        timer?.invalidate(); timer = nil
        if active, configuration.enabled {
            timer = Timer.scheduledTimer(withTimeInterval: 60, repeats: true) { _ in Task { @MainActor in if self.due, self.task == nil { try? self.run(accountId: nil, automatic: true) } } }
        }
        schedule()
    }
    private var due: Bool {
        let parts = Calendar.current.dateComponents([.hour, .minute], from: Date()), now = (parts.hour ?? 0) * 60 + (parts.minute ?? 0), time = configuration.time.split(separator: ":").compactMap { Int($0) }
        guard time.count == 2, now >= time[0] * 60 + time[1] else { return false }
        return NativeBackground.shared.accounts.accounts.contains { $0.enabled && !$0.expired && !ranToday($0) }
    }
    private func ledgerName(_ account: NativeAccount) -> String { "tasks-" + MeterWire.md5(Data((account.id + "|" + account.uid).utf8)) + ".ledger" }
    private func ranToday(_ account: NativeAccount) -> Bool { let ledger = (try? EncryptedLocalFile.read([String: String].self, name: ledgerName(account))) ?? [:]; return ledger["scheduled"] == NativeTaskEvidence.day() }
    private func claim(_ account: NativeAccount, _ action: String, day: String) throws -> Bool {
        var ledger = try EncryptedLocalFile.read([String: String].self, name: ledgerName(account)) ?? [:]
        guard ledger[action] != day else { return false }; ledger[action] = day; try EncryptedLocalFile.write(ledger, name: ledgerName(account)); return true
    }
    func configure(_ params: [String: Any]) throws -> [String: Any] {
        let next = try NativeTaskConfiguration(params); cancel(); try EncryptedLocalFile.write(next, name: "tasks.v1"); configuration = next; foreground(UIApplication.shared.applicationState == .active); return status()
    }
    func cancel() {
        generation += 1; task?.cancel(); task = nil
        for (id, var row) in rows where row["status"] as? String == "running" {
            row["status"] = "cancelled"
            if let action = attempting[id] { var steps = row["steps"] as? [[String:Any]] ?? []; steps.append(["action":action, "state":"uncertain", "reason":"cancelled", "at":Date().timeIntervalSince1970 * 1000]); row["steps"] = steps }
            rows[id] = row
        }
        attempting.removeAll()
    }
    func run(accountId: String?, background: Bool = false, automatic: Bool = false, completion: ((Bool) -> Void)? = nil) throws {
        guard task == nil else { throw PanelError.coded("busy", "自动任务正在运行，请稍后刷新状态。") }
        var selected = NativeBackground.shared.accounts.accounts.filter { $0.enabled && !$0.expired && (accountId == nil || $0.id == accountId) && (!automatic || !ranToday($0)) }
        guard !selected.isEmpty else { throw PanelError.invalid("没有可运行任务的已启用账号。") }; if background { selected = Array(selected.prefix(1)) }
        let epoch = generation, config = configuration
        task = Task { [weak self] in
            guard let self else { completion?(false); return }; var success = false
            defer { if self.generation == epoch { self.task = nil; self.lastRun = Date().timeIntervalSince1970 * 1000 }; completion?(success) }
            for account in selected {
                guard self.generation == epoch, !Task.isCancelled, NativeBackground.shared.valid(account) else { return }
                if automatic { do { guard try self.claim(account, "scheduled", day: NativeTaskEvidence.day()) else { continue } } catch { continue } }
                self.rows[account.id] = ["status": "running", "steps": [[String: Any]](), "lastRun": Date().timeIntervalSince1970 * 1000]
                do { try await self.execute(account, config: config, epoch: epoch); success = true }
                catch { if case NativeCloudError.expired = error { NativeBackground.shared.accounts.markExpired(account) } }
                guard self.generation == epoch else { return }
                var row = self.rows[account.id] ?? [:], steps = row["steps"] as? [[String: Any]] ?? []
                row["status"] = steps.contains { $0["state"] as? String == "uncertain" || $0["state"] as? String == "failed" } ? "partial" : "completed"; self.rows[account.id] = row
            }
        }
    }
    private func execute(_ account: NativeAccount, config: NativeTaskConfiguration, epoch: Int) async throws {
        let day = NativeTaskEvidence.day()
        func check() throws { guard self.generation == epoch, !Task.isCancelled, NativeTaskEvidence.day() == day, NativeBackground.shared.valid(account) else { throw PanelError.cancelled } }
        func emit(_ action: String, _ state: String, _ reason: String? = nil) {
            guard self.generation == epoch else { return }; var row = self.rows[account.id] ?? [:], steps = row["steps"] as? [[String: Any]] ?? []
            var value: [String: Any] = ["action": action, "state": state, "at": Date().timeIntervalSince1970 * 1000]; if let reason { value["reason"] = reason }; steps.append(value); row["steps"] = steps; self.rows[account.id] = row; if self.attempting[account.id] == action { self.attempting[account.id] = nil }
        }
        func call(_ path: String, query: [String: String] = [:], method: String = "GET", body: String = "", h5: Bool = false) async throws -> Any {
            try check(); let result = try await self.cloud.perform(path, token: account.token, query: query, method: method, body: body, h5: h5); try check(); return result
        }
        func ready(_ action: String) async throws -> Bool {
            try check(); if config.requestIntervalMs > 0 { try await Task.sleep(nanoseconds: UInt64(config.requestIntervalMs) * 1_000_000) }; try check()
            guard try self.claim(account, action, day: day) else { emit(action, "skipped", "daily_gate"); return false }; try check(); self.attempting[account.id] = action; return true
        }
        func eligible(_ action: String) async throws -> Bool {
            let summary = try await call(self.mine + "/integral/getByUserId", query: ["userId": account.uid]) as? [String: Any]
            let code = ["like":"1026", "share":"1024", "post":"1023"][action] ?? "", list = summary?["ps0003_01_002_VOList"] as? [[String: Any]] ?? [], matching = list.filter { String(describing: $0["code"] ?? "") == code }
            guard list.count <= 200, matching.count == 1 else { emit(action, "skipped", "state_unknown"); return false }
            let flag = String(describing: matching[0]["completeFlag"] ?? "")
            guard flag == "1" else { emit(action, "skipped", flag == "0" ? "already_done" : "state_unknown"); return false }; return true
        }
        func verify(_ action: String) async throws {
            let summary = try await call(self.mine + "/integral/getByUserId", query: ["userId": account.uid]) as? [String: Any], code = ["like":"1026", "share":"1024", "post":"1023"][action] ?? ""
            let matching = (summary?["ps0003_01_002_VOList"] as? [[String: Any]] ?? []).filter { String(describing: $0["code"] ?? "") == code }, confirmed = matching.count == 1 && String(describing: matching[0]["completeFlag"] ?? "") == "0"
            emit(action, confirmed ? "confirmed" : "uncertain", confirmed ? nil : "accepted_not_verified")
        }
        for action in NativeTaskConfiguration.actionNames where config.actions[action] == true && action != "cleanup" {
            try check(); var attempted = false
            do {
                if action == "signin" {
                    let count = try await call(mine + "/signin/count") as? [String: Any], status = String(describing: count?["signStatus"] ?? "")
                    guard status == "0" else { emit(action, "skipped", status == "1" ? "already_done" : "state_unknown"); continue }
                    guard try await ready(action) else { continue }; attempted = true
                    do { _ = try await call(h5, method: "POST", body: "{}", h5: true) } catch { try check(); if case NativeCloudError.expired = error { throw error } }
                    let after = try await call(mine + "/signin/count") as? [String: Any], confirmed = String(describing: after?["signStatus"] ?? "") == "1"
                    emit(action, confirmed ? "confirmed" : "uncertain", confirmed ? nil : "accepted_not_verified")
                } else if action == "streakPrize" {
                    let count = try await call(mine + "/signin/count") as? [String: Any], value = NativeCloud.number(count?["count"], range: 1...100000)
                    guard String(describing: count?["signStatus"] ?? "") == "1", let value, value.rounded() == value, Int(value) % 30 == 0 else { emit(action, "skipped", "not_eligible"); continue }
                    let info = try await call(h5 + "/info", query: ["month":String(day.prefix(7)), "server_name":"SMART"], h5: true) as? [String: Any]
                    guard info?["signPrizeDate"] as? String == day else { emit(action, "skipped", "not_eligible"); continue }
                    guard try await ready(action) else { continue }; attempted = true
                    let reward = try await call(h5 + "/supplementPrize", query: ["supplementDate":day], h5: true) as? [String: Any], title = reward?["prizesName"] as? String ?? reward?["prizeName"] as? String ?? ""
                    emit(action, title.isEmpty ? "uncertain" : "confirmed", title.isEmpty ? "accepted_not_verified" : nil)
                } else if action == "like" || action == "share" {
                    guard try await eligible(action) else { continue }
                    let articles = try NativeTaskEvidence.articles(await call(social + "/community/qbTzInfoNewV2", query: ["postModule":"1", "slidingType":"0", "page":"1", "pageSize":"20"]))
                    guard let target = articles.filter({ !$0.author.isEmpty && $0.author != account.uid && $0.at != nil }).sorted(by: { $0.at! > $1.at! }).first else { emit(action, "skipped", "no_target"); continue }
                    if action == "like", !config.legacyLikeConfirmed { emit(action, "skipped", "state_unknown"); continue }
                    guard try await ready(action) else { continue }; attempted = true
                    if action == "like" {
                        let body = try MeterWire.json(["postId":target.id, "kindFlag":"0"]); _ = try await call(social + "/socialCommu/likeFavoriteInfo", method: "POST", body: String(decoding: body, as: UTF8.self))
                    } else { _ = try await call(social + "/article/share/" + target.id, method: "PUT"); _ = try await call(mine + "/integral/adjustByShare") }
                    try await verify(action)
                } else if action == "post" {
                    guard try await eligible(action) else { continue }
                    let before = try NativeTaskEvidence.articles(await call(social + "/community/mineArticleInfo", query: ["userId":account.uid]))
                    guard try await ready(action) else { continue }; attempted = true
                    let start = Date().timeIntervalSince1970 * 1000, body = try MeterWire.json(["postSubInfo":["topicList":[]], "topicid":"", "postcontent":config.postContent])
                    do { _ = try await call(social + "/commonArticle", method: "POST", body: String(decoding: body, as: UTF8.self)) } catch { try check(); if case NativeCloudError.expired = error { throw error } }
                    let end = Date().timeIntervalSince1970 * 1000; var proof: (String?, Bool) = (nil, true)
                    for attempt in 0..<5 {
                        if attempt > 0 { try await Task.sleep(nanoseconds: 1_000_000_000) }; try check()
                        let after = try NativeTaskEvidence.articles(await call(social + "/community/mineArticleInfo", query: ["userId":account.uid]))
                        proof = NativeTaskEvidence.created(before: before, after: after, uid: account.uid, content: config.postContent, started: start, ended: end); if proof.0 != nil || !proof.1 { break }
                    }
                    guard proof.1, let created = proof.0 else { emit(action, "uncertain", "evidence_unsafe"); if config.actions["cleanup"] == true { emit("cleanup", "skipped", "evidence_unsafe") }; continue }
                    emit(action, "confirmed")
                    if config.actions["cleanup"] == true, try await ready("cleanup") {
                        _ = try await call(social + "/commonArticle/deleteArticle", query: ["articleId":created, "postType":"1"], method: "DELETE")
                        let after = try NativeTaskEvidence.articles(await call(social + "/community/mineArticleInfo", query: ["userId":account.uid])), exists = after.contains { $0.id == created }
                        emit("cleanup", exists ? "uncertain" : "confirmed", exists ? "accepted_not_verified" : nil)
                    }
                }
            } catch {
                let expired: Bool; if case NativeCloudError.expired = error { expired = true } else { expired = false }
                let cancelled = error is CancellationError || (error as? PanelError)?.code == "cancelled"
                emit(action, attempted ? "uncertain" : "failed", expired ? "expired" : cancelled ? "cancelled" : "network")
                if expired || cancelled { throw error }
            }
        }
    }
    private func schedule() {
        BGTaskScheduler.shared.cancel(taskRequestWithIdentifier: Self.identifier); scheduled = false
        guard configuration.enabled, NativeBackground.shared.backgroundMode == "opportunistic" else { return }
        let components = configuration.time.split(separator: ":").compactMap { Int($0) }; guard components.count == 2 else { return }
        let date = Calendar.current.nextDate(after: Date(), matching: DateComponents(hour: components[0], minute: components[1]), matchingPolicy: .nextTime) ?? Date().addingTimeInterval(86400)
        let request = BGAppRefreshTaskRequest(identifier: Self.identifier); request.earliestBeginDate = due ? Date().addingTimeInterval(900) : date
        do { try BGTaskScheduler.shared.submit(request); scheduled = true } catch { scheduled = false }
    }
    func status() -> [String: Any] {
        let accounts: [[String: Any]] = NativeBackground.shared.accounts.accounts.map { account in
            var row = rows[account.id] ?? ["status":"idle", "steps":[[String:Any]]()]; row["id"] = account.id; row["label"] = account.label; row["epoch"] = account.epoch; if row["lastRun"] == nil { row["lastRun"] = NSNull() }; return row
        }
        return ["enabled":configuration.enabled, "running":task != nil, "backgroundMode":NativeBackground.shared.backgroundMode, "jobScheduled":scheduled, "lastRun":lastRun as Any? ?? NSNull(), "config":configuration.dictionary(), "accounts":accounts]
    }
}
