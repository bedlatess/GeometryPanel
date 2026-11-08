import UIKit
import WebKit

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let testing = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil || NSClassFromString("XCTestCase") != nil
        if !testing { NativeBackground.shared.register(); NativeTasks.shared.register() }
        let window = UIWindow(frame: UIScreen.main.bounds); window.rootViewController = testing ? UIViewController() : PanelViewController(); window.makeKeyAndVisible(); self.window = window
        return true
    }
    func applicationDidBecomeActive(_ application: UIApplication) { NativeBackground.shared.foreground(true); NativeTasks.shared.foreground(true) }
    func applicationDidEnterBackground(_ application: UIApplication) { NativeBackground.shared.foreground(false); NativeTasks.shared.foreground(false) }
    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool { NativeShortcuts.handle(url) }
}

@MainActor final class PanelViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var web: WKWebView!
    private let local = LocalServices()
    private let bluetooth = BluetoothKey()
    private lazy var meter = MeterCoordinator(host: self)
    private lazy var tools = NativeTools(host: self)
    private var binding: VehicleBinding?
    private var pending: Set<String> = []
    private var epoch = 0
    private var retryButton: UIButton!
    private var webReady = false, shortcutDelivering = false
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default(); configuration.allowsInlineMediaPlayback = true
        configuration.userContentController.add(self, name: "geometry")
        web = WKWebView(frame: .zero, configuration: configuration); web.navigationDelegate = self; web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true; web.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(web)
        NSLayoutConstraint.activate([web.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor), web.bottomAnchor.constraint(equalTo: view.bottomAnchor), web.leadingAnchor.constraint(equalTo: view.leadingAnchor), web.trailingAnchor.constraint(equalTo: view.trailingAnchor)])
        retryButton = UIButton(type: .system); retryButton.setTitle("页面加载失败，点此重试", for: .normal); retryButton.addTarget(self, action: #selector(retry), for: .touchUpInside)
        retryButton.backgroundColor = .secondarySystemBackground; retryButton.translatesAutoresizingMaskIntoConstraints = false; retryButton.isHidden = true; view.addSubview(retryButton)
        NSLayoutConstraint.activate([retryButton.centerXAnchor.constraint(equalTo: view.centerXAnchor), retryButton.centerYAnchor.constraint(equalTo: view.centerYAnchor), retryButton.heightAnchor.constraint(equalToConstant: 52)])
        bluetooth.disconnected = { [weak self] in self?.local.bluetoothDisconnected() }
        web.load(URLRequest(url: TrustedPage.home))
        NotificationCenter.default.addObserver(self, selector: #selector(background), name: UIApplication.didEnterBackgroundNotification, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(deliverShortcut), name: NativeShortcuts.received, object: nil)
        NotificationCenter.default.addObserver(self, selector: #selector(deliverShortcut), name: UIApplication.didBecomeActiveNotification, object: nil)
    }
    @objc private func retry() { retryButton.isHidden = true; web.load(URLRequest(url: TrustedPage.home)) }
    @objc private func background() { meter.stop(); tools.stop(); if !bluetooth.proximity { bluetooth.disconnect() } }
    private func clear(advanceEpoch: Bool = true) {
        if advanceEpoch { epoch += 1 }; binding = nil; bluetooth.binding = nil; bluetooth.disconnect(); meter.stop(); tools.stop(); local.clear(); SecureStore.delete("binding")
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.name == "geometry", message.frameInfo.isMainFrame, origin.protocol == "https", origin.host == "bedlatess.github.io",
              origin.port == 443 || origin.port == 0, TrustedPage.permits(web.url), TrustedPage.permits(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let id = body["id"] as? String, !id.isEmpty, id.count <= 100,
              let method = body["method"] as? String, let params = body["params"] as? [String: Any], pending.count < 8, !pending.contains(id),
              let serialized = try? JSONSerialization.data(withJSONObject: body), serialized.count <= 1572864,
              serialized.count <= (method == "asset.export" && params["kind"] as? String == "panel" ? 1572864 : ["accounts.sync", "background.configure", "tasks.configure"].contains(method) ? 262144 : 16384) else { return }
        let methods: Set<String> = ["capabilities", "status", "bindVehicle", "forgetVehicle", "ble.scan", "ble.connect", "ble.disconnect", "ble.command", "ble.proximity", "notifications.configure", "widget.update", "meter.open", "accounts.sync", "accounts.remove", "background.configure", "background.status", "background.run", "background.history", "history.clear", "tasks.configure", "tasks.run", "tasks.status", "widget.configure", "widget.pin", "shortcuts.configure", "tools.open", "diagnostics.export", "updates.check", "updates.install", "keepalive.export", "officialLogin.start", "officialLogin.stop", "officialLogin.result", "asset.export", "haptic"]
        guard methods.contains(method) else { reply(id, failure: PanelError.unavailable("当前版本没有这个原生方法。")); return }
        pending.insert(id); let generation = epoch
        Task { [weak self] in
            guard let self else { return }
            defer { self.pending.remove(id) }
            do {
                let result = try await self.call(method, params: params)
                guard generation == self.epoch || method == "forgetVehicle" || method == "bindVehicle" else { return }
                self.reply(id, result: result)
                if method == "capabilities" { self.deliverShortcut() }
            } catch { if generation == self.epoch || method == "bindVehicle" { self.reply(id, failure: error) } }
        }
    }
    private func call(_ method: String, params: [String: Any]) async throws -> Any {
        switch method {
        case "capabilities": return ["platform": "ios", "version": 1, "features": ["ble": true, "proximity": true, "notifications": true, "widget": local.widgetAvailable, "meter": true, "background": true, "history": true, "multiAccount": true, "tasks": true, "shortcuts": true, "scanner": true, "ota": true, "wallpaperZip": true, "diagnostics": true, "updates": true, "officialLogin": false, "keepalive": false], "limitations": ["iOS 不能按蓝牙 MAC 直接选车：请在车旁扫描并确认设备。", "蓝牙连接提醒不代表靠近自动解锁；旧版没有已验证的自动解锁协议。", "启用后前台每分钟监测；后台由系统机会调度，不承诺持续运行或自动任务准点执行。", "仪表需手动连接车辆 Wi-Fi；iOS 无通用 Wi-Fi Direct。投屏仅采集本应用画面，无音频和反控。", "组件版需要支持 App Groups 的自签资料；常规版不含组件。IPA 由使用者自签。"]]
        case "haptic":
            let type = params["type"] as? String ?? ""
            switch type {
            case "light": UIImpactFeedbackGenerator(style: .light).impactOccurred()
            case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
            case "selection": UISelectionFeedbackGenerator().selectionChanged()
            case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
            case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
            default: return ["performed": false]
            }
            return ["performed": true]
        case "status": var status = bluetooth.status; status["uniqueIdentify"] = try SecureStore.identity().hex; status["bound"] = binding != nil; status["meter"] = meter.status; status["widgetAvailable"] = local.widgetAvailable; return status
        case "bindVehicle":
            let validated = try VehicleBinding(params)
            if binding?.vin != validated.vin || binding?.uid != validated.uid || binding?.credentialDigest != validated.credentialDigest { clear() }
            else if binding?.key != validated.key || binding?.encryptValue != validated.encryptValue || binding?.cloudEnabled != validated.cloudEnabled { bluetooth.disconnect() }
            try SecureStore.write(JSONEncoder().encode(validated), name: "binding"); binding = validated; bluetooth.binding = validated
            try NativeBackground.shared.accounts.cache(validated)
            return ["bound": true]
        case "forgetVehicle": clear(); return ["forgotten": true]
        case "ble.scan": return try await bluetooth.scan()
        case "ble.connect":
            guard let id = params["id"] as? String else { throw PanelError.invalid("请先扫描并选择车辆。") }
            let generation = epoch
            try await confirm("连接蓝牙车辆", "iOS 无法读取蓝牙 MAC。请确认在你的车辆旁，并已从本轮扫描结果中选择正确设备。连接后还要使用当前车辆资料认证。")
            guard generation == epoch else { throw PanelError.cancelled }
            try await bluetooth.connect(id); return bluetooth.status
        case "ble.disconnect": bluetooth.disconnect(); return bluetooth.status
        case "ble.command":
            guard let action = params["action"] as? String else { throw PanelError.invalid("蓝牙操作无效。") }
            if action == "register" { let generation = epoch; try await confirm("登记本手机", "这会修改车辆上的手机钥匙登记。车端确认、本机系统配对和云端保存是不同步骤；完成后仍需现场确认钥匙效果。"); guard generation == epoch else { throw PanelError.cancelled } }
            return try await bluetooth.command(action)
        case "ble.proximity":
            guard let enabled = params["enabled"] as? Bool else { throw PanelError.invalid("连接提醒选项无效。") }
            let generation = epoch
            try await local.configureProximity(enabled)
            do { guard generation == epoch else { throw PanelError.cancelled }; try bluetooth.setProximity(enabled) }
            catch { try? await local.configureProximity(false); throw error }
            return ["enabled": enabled, "automaticUnlockVerified": false]
        case "notifications.configure": return try await local.configure(params)
        case "widget.update": return try local.update(params)
        case "accounts.sync":
            let result = try NativeBackground.shared.sync(params)
            if let binding, !NativeBackground.shared.accounts.permits(binding) { clear(advanceEpoch: false) }; return result
        case "accounts.remove":
            guard let id = params["accountId"] as? String else { throw PanelError.invalid("账号标识无效。") }; let result = try NativeBackground.shared.remove(id)
            if let binding, !NativeBackground.shared.accounts.permits(binding) { clear(advanceEpoch: false) }; return result
        case "background.configure":
            let generation = epoch; return try await NativeBackground.shared.configure(params, validate: { [weak self] in self?.epoch == generation })
        case "background.status": return NativeBackground.shared.status()
        case "background.run": try NativeBackground.shared.run(vehicleId: params["vehicleId"] as? String); return NativeBackground.shared.status()
        case "background.history": return try NativeBackground.shared.history(params)
        case "history.clear": return try NativeBackground.shared.history(params, clear: true)
        case "tasks.configure": return try NativeTasks.shared.configure(params)
        case "tasks.status": return NativeTasks.shared.status()
        case "tasks.run":
            guard params["confirmed"] as? Bool == true else { throw PanelError.invalid("请先确认执行已配置的自动任务。") }
            try NativeTasks.shared.run(accountId: params["accountId"] as? String); return NativeTasks.shared.status()
        case "widget.configure": return try NativeShortcuts.widget(params)
        case "widget.pin":
            try await confirm("添加几何面板组件", "请回到 iPhone 主屏幕，长按空白处，点击添加组件并搜索“几何面板”。组件尺寸由 iOS 提供；带控制入口的操作会打开面板确认。组件版需要支持 App Groups 的自签资料。")
            return ["opened": true, "systemInstructions": true]
        case "shortcuts.configure": return try NativeShortcuts.configure(params)
        case "tools.open": guard let tool = params["tool"] as? String else { throw PanelError.invalid("工具无效。") }; return try tools.open(tool)
        case "diagnostics.export": return try tools.exportDiagnostics()
        case "updates.check": return try await tools.checkUpdate()
        case "updates.install": return try tools.installUpdate()
        case "asset.export": let generation = epoch; return try await tools.asset(params, validate: { [weak self] in self?.epoch == generation })
        case "keepalive.export": throw PanelError.unavailable("iOS 不支持 Android Magisk / KernelSU 保活模块。")
        case "officialLogin.start", "officialLogin.stop", "officialLogin.result": throw PanelError.unavailable("iOS 不提供 Android 本地 VPN 官方登录捕获，请使用当前短信登录。")
        case "meter.open":
            guard let binding else { throw PanelError.invalid("请先刷新当前车辆资料。") }; try binding.requireFresh()
            guard let mode = params["mode"] as? String, ["wallpaper", "cast"].contains(mode) else { throw PanelError.invalid("仪表功能无效。") }
            let generation = epoch
            try meter.open(mode: mode, params: params, validate: { [weak self] in
                guard let self, self.epoch == generation, self.binding?.vin == binding.vin, self.binding?.uid == binding.uid,
                      self.binding?.credentialDigest == binding.credentialDigest else { throw PanelError.cancelled }
                try binding.requireFresh()
            }); return ["opened": true]
        default: throw PanelError.unavailable("没有这个原生方法。")
        }
    }
    @objc private func deliverShortcut() { tryDeliverShortcut(attempt: 0) }
    private func tryDeliverShortcut(attempt: Int) {
        guard webReady, !shortcutDelivering, UIApplication.shared.applicationState == .active, TrustedPage.permits(web.url), let value = NativeShortcuts.peek(), let data = try? JSONSerialization.data(withJSONObject: value), let json = String(data: data, encoding: .utf8) else { return }
        shortcutDelivering = true; let generation = epoch
        web.evaluateJavaScript("(() => { if (window.__geometryNativeShortcutReady !== true) return false; window.dispatchEvent(new CustomEvent('geometry:native-shortcut', {detail: \(json)})); return true; })()") { [weak self] result, error in
            guard let self else { return }; self.shortcutDelivering = false
            guard self.epoch == generation else { return }
            if error == nil, result as? Bool == true { NativeShortcuts.acknowledge(value) }
            else if attempt < 20 { DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in self?.tryDeliverShortcut(attempt: attempt + 1) } }
        }
    }
    func confirm(_ title: String, _ message: String) async throws {
        guard presentedViewController == nil, UIApplication.shared.applicationState == .active else { throw PanelError.unavailable("请先关闭当前系统窗口，再操作。") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let alert = UIAlertController(title: title, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "取消", style: .cancel) { _ in continuation.resume(throwing: PanelError.cancelled) })
            alert.addAction(UIAlertAction(title: "确认", style: .default) { _ in continuation.resume() }); present(alert, animated: true)
        }
    }
    private func reply(_ id: String, result: Any? = nil, failure: Error? = nil) {
        guard TrustedPage.permits(web.url) else { return }
        var response: [String: Any] = ["id": id, "ok": failure == nil]
        if let failure { response["error"] = ["code": (failure as? PanelError)?.code ?? "native", "message": (failure as? PanelError)?.errorDescription ?? "原生操作没有完成，请检查系统权限和设备连接。"] }
        else { response["result"] = result ?? [:] }
        guard JSONSerialization.isValidJSONObject(response), let data = try? JSONSerialization.data(withJSONObject: response, options: [.fragmentsAllowed]), let json = String(data: data, encoding: .utf8) else { return }
        web.evaluateJavaScript("window.__geometryNativeReceive && window.__geometryNativeReceive(\(json))", completionHandler: nil)
    }
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = navigationAction.request.url else { decisionHandler(.cancel); return }
        if navigationAction.targetFrame?.isMainFrame == false { decisionHandler(url.scheme == "https" ? .allow : .cancel); return }
        if TrustedPage.permits(url) { decisionHandler(.allow); return }
        if url.scheme == "https", url.user == nil, url.password == nil { UIApplication.shared.open(url) }
        decisionHandler(.cancel)
    }
    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = navigationAction.request.url, url.scheme == "https", url.user == nil, url.password == nil { UIApplication.shared.open(url) }; return nil
    }
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { epoch += 1; webReady = false; pending.removeAll(); bluetooth.disconnect(); meter.stop(); tools.stop() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { retryButton.isHidden = true; webReady = true; deliverShortcut() }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { retryButton.isHidden = false } }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { retryButton.isHidden = false }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { bluetooth.disconnect(); meter.stop(); retryButton.isHidden = false }
}
