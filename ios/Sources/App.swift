import UIKit
import WebKit

@main final class AppDelegate: UIResponder, UIApplicationDelegate {
    var window: UIWindow?
    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        let testing = ProcessInfo.processInfo.environment["XCTestConfigurationFilePath"] != nil || NSClassFromString("XCTestCase") != nil
        let window = UIWindow(frame: UIScreen.main.bounds); window.rootViewController = testing ? UIViewController() : PanelViewController(); window.makeKeyAndVisible(); self.window = window
        return true
    }
}

@MainActor final class PanelViewController: UIViewController, WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    private var web: WKWebView!
    private let local = LocalServices()
    private let bluetooth = BluetoothKey()
    private lazy var meter = MeterCoordinator(host: self)
    private var binding: VehicleBinding?
    private var pending: Set<String> = []
    private var epoch = 0
    private var retryButton: UIButton!
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
    }
    @objc private func retry() { retryButton.isHidden = true; web.load(URLRequest(url: TrustedPage.home)) }
    @objc private func background() { meter.stop(); if !bluetooth.proximity { bluetooth.disconnect() } }
    private func clear() {
        epoch += 1; binding = nil; bluetooth.binding = nil; bluetooth.disconnect(); meter.stop(); local.clear(); SecureStore.delete("binding")
    }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        let origin = message.frameInfo.securityOrigin
        guard message.name == "geometry", message.frameInfo.isMainFrame, origin.protocol == "https", origin.host == "bedlatess.github.io",
              origin.port == 443 || origin.port == 0, TrustedPage.permits(web.url), TrustedPage.permits(message.frameInfo.request.url),
              let body = message.body as? [String: Any], let id = body["id"] as? String, !id.isEmpty, id.count <= 100,
              let method = body["method"] as? String, let params = body["params"] as? [String: Any], pending.count < 8, !pending.contains(id),
              let serialized = try? JSONSerialization.data(withJSONObject: body), serialized.count <= 16384 else { return }
        let methods: Set<String> = ["capabilities", "status", "bindVehicle", "forgetVehicle", "ble.scan", "ble.connect", "ble.disconnect", "ble.command", "ble.proximity", "notifications.configure", "widget.update", "meter.open"]
        guard methods.contains(method) else { reply(id, failure: PanelError.unavailable("当前版本没有这个原生方法。")); return }
        pending.insert(id); let generation = epoch
        Task { [weak self] in
            guard let self else { return }
            defer { self.pending.remove(id) }
            do {
                let result = try await self.call(method, params: params)
                guard generation == self.epoch || method == "forgetVehicle" || method == "bindVehicle" else { return }
                self.reply(id, result: result)
            } catch { if generation == self.epoch || method == "bindVehicle" { self.reply(id, failure: error) } }
        }
    }
    private func call(_ method: String, params: [String: Any]) async throws -> Any {
        switch method {
        case "capabilities": return ["platform": "ios", "version": 1, "features": ["ble": true, "proximity": true, "notifications": true, "widget": local.widgetAvailable, "meter": true], "limitations": ["iOS 不能按蓝牙 MAC 直接选车：请在车旁扫描并确认设备。", "蓝牙连接提醒不代表靠近自动解锁；旧版没有已验证的自动解锁协议。", "后台不持续轮询云端；低电量提醒依据最近读取，组件显示上次车况。", "仪表需手动连接车辆 Wi-Fi；iOS 无通用 Wi-Fi Direct。投屏仅采集本应用画面，无音频和反控。", "组件版需要支持 App Groups 的自签资料；常规版不含组件。"]]
        case "status": var status = bluetooth.status; status["bound"] = binding != nil; status["meter"] = meter.status; status["widgetAvailable"] = local.widgetAvailable; return status
        case "bindVehicle":
            let validated = try VehicleBinding(params)
            if binding?.vin != validated.vin || binding?.uid != validated.uid || binding?.credentialDigest != validated.credentialDigest { clear() }
            try SecureStore.write(JSONEncoder().encode(validated), name: "binding"); binding = validated; bluetooth.binding = validated
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
            try bluetooth.setProximity(enabled); return ["enabled": enabled, "automaticUnlockVerified": false]
        case "notifications.configure": return try await local.configure(params)
        case "widget.update": return try local.update(params)
        case "meter.open":
            guard let binding else { throw PanelError.invalid("请先刷新当前车辆资料。") }; try binding.requireFresh()
            guard let mode = params["mode"] as? String, ["wallpaper", "cast"].contains(mode) else { throw PanelError.invalid("仪表功能无效。") }
            try meter.open(mode: mode, params: params); return ["opened": true]
        default: throw PanelError.unavailable("没有这个原生方法。")
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
    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) { epoch += 1; pending.removeAll(); bluetooth.disconnect(); meter.stop() }
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { retryButton.isHidden = true }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { if (error as NSError).code != NSURLErrorCancelled { retryButton.isHidden = false } }
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { retryButton.isHidden = false }
    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { bluetooth.disconnect(); meter.stop(); retryButton.isHidden = false }
}
