import UIKit
import AVFoundation
import UniformTypeIdentifiers
import ImageIO

enum NativeAsset {
    static func panel(_ params: [String: Any]) throws -> Data {
        guard params["kind"] as? String == "panel", params["fileName"] as? String == "geometry-status.png", let base64 = params["data"] as? String, base64.utf8.count <= 1_400_000, let data = Data(base64Encoded: base64), !data.isEmpty, data.count <= 1024 * 1024 else { throw PanelError.invalid("车况图片须为 1 MiB 内的 PNG。") }
        try WallpaperArchive.png(data)
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache:false] as CFDictionary), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString:Any], let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int, (1...2048).contains(width), (1...2048).contains(height) else { throw PanelError.invalid("车况图片边长不能超过 2048 像素。") }
        return data
    }
    static func permitted(_ url: URL) -> Bool {
        url.scheme == "https" && ["oss-cfmoto-private.zeehoev.com", "zeeho-user.oss-cn-hangzhou.aliyuncs.com"].contains(url.host ?? "") && (url.port == nil || url.port == 443) && url.user == nil && url.password == nil && url.fragment == nil
    }
    static func download(_ url: URL) async throws -> Data {
        guard permitted(url) else { throw PanelError.invalid("壁纸地址不在原包对象存储白名单中。") }
        let config = URLSessionConfiguration.ephemeral; config.httpShouldSetCookies = false; config.urlCache = nil; config.timeoutIntervalForResource = 120
        let session = URLSession(configuration: config, delegate: NoCloudRedirects(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        var current = url
        for _ in 0..<5 {
            guard permitted(current) else { throw PanelError.invalid("壁纸跳转地址未获允许。") }
            var request = URLRequest(url: current, timeoutInterval: 15); request.setValue("identity", forHTTPHeaderField: "Accept-Encoding")
            let (bytes, response) = try await session.bytes(for: request)
            guard let http = response as? HTTPURLResponse else { throw PanelError.disconnected }
            if (300..<400).contains(http.statusCode) {
                guard let location = http.value(forHTTPHeaderField: "Location"), let next = URL(string: location, relativeTo: current)?.absoluteURL, permitted(next) else { throw PanelError.invalid("壁纸跳转无效。") }; current = next; continue
            }
            guard http.statusCode == 200, response.expectedContentLength <= 16 * 1024 * 1024, ["", "identity"].contains((http.value(forHTTPHeaderField: "Content-Encoding") ?? "").lowercased()) else { throw PanelError.invalid("壁纸下载状态或长度无效。") }
            var result = Data()
            for try await byte in bytes { result.append(byte); guard result.count <= 16 * 1024 * 1024 else { throw PanelError.invalid("壁纸超过 16 MiB。") }; if result.count % 4096 == 0 { try Task.checkCancellation() } }
            guard !result.isEmpty else { throw PanelError.invalid("壁纸文件为空。") }; return result
        }
        throw PanelError.invalid("壁纸跳转次数超过限制。")
    }
}

@MainActor final class NativeTools {
    private weak var host: PanelViewController?
    private weak var tool: NativeToolController?
    private weak var scanner: ScannerController?
    private var release: URL?
    init(host: PanelViewController) { self.host = host }
    func stop() { tool?.cancel(); tool?.navigationController?.dismiss(animated: true); tool = nil; scanner?.stopCapture(); scanner?.navigationController?.dismiss(animated: true); scanner = nil }
    func open(_ name: String) throws -> [String: Any] {
        guard let host, host.presentedViewController == nil, UIApplication.shared.applicationState == .active else { throw PanelError.unavailable("请关闭当前系统窗口后重试。") }
        if name == "scanner" {
            let scanner = ScannerController(); self.scanner = scanner; host.present(UINavigationController(rootViewController: scanner), animated: true)
        } else {
            guard ["ota", "wallpaperZip", "diagnostics", "updates"].contains(name) else { throw PanelError.invalid("工具无效。") }
            let panel = NativeToolController(name: name, tools: self); tool = panel
            host.present(UINavigationController(rootViewController: panel), animated: true)
        }
        return ["opened": true]
    }
    func exportDiagnostics() throws -> [String: Any] {
        let data = try JSONSerialization.data(withJSONObject: ["platform": "ios", "version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown", "schema": 1, "accountCount": NativeBackground.shared.accounts.accounts.count, "monitorEnabled": NativeBackground.shared.enabled, "backgroundMode": NativeBackground.shared.backgroundMode, "widgetAvailable": WidgetSnapshot.sharedDefaults != nil, "containsCredentials": false, "containsLocation": false], options: [.prettyPrinted, .sortedKeys])
        try share(data, name: "GeometryPanel-diagnostics.json"); return ["opened": true]
    }
    func asset(_ params: [String: Any], validate: () -> Bool) async throws -> [String: Any] {
        if params["kind"] as? String == "panel" {
            let data = try NativeAsset.panel(params); guard validate() else { throw PanelError.cancelled }; try share(data, name: "geometry-status.png"); return ["opened":true, "validated":true, "size":data.count]
        }
        guard params["kind"] as? String == "wallpaper", let text = params["url"] as? String, text.count <= 8192, let url = URL(string: text), NativeAsset.permitted(url) else { throw PanelError.invalid("壁纸下载资料无效。") }
        let size = NativeCloud.number(params["fileSize"], range: 1...Double(16 * 1024 * 1024)), digest = params["md5"] as? String
        if params["fileSize"] != nil, !(params["fileSize"] is NSNull), size == nil { throw PanelError.invalid("壁纸长度无效。") }
        if let digest, digest.range(of: "^[a-fA-F0-9]{32}$", options: .regularExpression) == nil { throw PanelError.invalid("MD5 格式无效。") }
        let data = try await NativeAsset.download(url); try Task.checkCancellation(); guard validate() else { throw PanelError.cancelled }
        guard size == nil || Int(size!) == data.count, digest == nil || digest!.lowercased() == MeterWire.md5(data) else { throw PanelError.invalid("壁纸长度或 MD5 与云端资料不一致。") }
        try WallpaperArchive.validate(data); try share(data, name: "GeometryPanel-wallpaper.zip"); return ["opened": true, "validated": true, "size": data.count]
    }
    func share(_ data: Data, name: String) throws {
        guard let host else { throw PanelError.cancelled }
        let presenter = host.presentedViewController ?? host
        guard !(presenter is UIActivityViewController), presenter.presentedViewController == nil else { throw PanelError.unavailable("请关闭当前系统窗口。") }
        let directory = FileManager.default.temporaryDirectory.appendingPathComponent("GeometryExports", isDirectory: true)
        try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
        // Export names are fixed by native callers. Remove old export files on
        // the next export, without ever including account or vehicle material.
        for url in (try? FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: nil)) ?? [] { try? FileManager.default.removeItem(at: url) }
        let file = directory.appendingPathComponent(UUID().uuidString + "-" + name); try data.write(to: file, options: [.atomic, .completeFileProtection])
        let activity = UIActivityViewController(activityItems: [file], applicationActivities: nil); activity.popoverPresentationController?.sourceView = presenter.view; activity.popoverPresentationController?.sourceRect = CGRect(x: presenter.view.bounds.midX, y: presenter.view.bounds.midY, width: 1, height: 1)
        activity.completionWithItemsHandler = { _, _, _, _ in try? FileManager.default.removeItem(at: file) }; presenter.present(activity, animated: true)
    }
    func checkUpdate() async throws -> [String: Any] {
        release = nil
        let config = URLSessionConfiguration.ephemeral; config.httpShouldSetCookies = false; config.urlCache = nil
        let session = URLSession(configuration: config, delegate: NoCloudRedirects(), delegateQueue: nil); defer { session.invalidateAndCancel() }
        let request = URLRequest(url: URL(string: "https://api.github.com/repos/bedlatess/GeometryPanel/releases/latest")!, timeoutInterval: 15)
        let (bytes, response) = try await session.bytes(for: request)
        guard let http = response as? HTTPURLResponse else { throw PanelError.disconnected }
        if http.statusCode == 404 { return ["available": false, "message": "暂未发布可安装版本。"] }
        guard http.statusCode == 200, response.expectedContentLength <= 2 * 1024 * 1024 else { throw PanelError.unavailable("暂时无法读取本仓库发布信息。") }
        var data = Data(); for try await byte in bytes { data.append(byte); guard data.count <= 2 * 1024 * 1024 else { throw PanelError.invalid("发布信息过长。") } }
        guard let root = try JSONSerialization.jsonObject(with: data) as? [String: Any], let tag = root["tag_name"] as? String, tag.range(of: "^v?[0-9]+\\.[0-9]+\\.[0-9]+(?:[-.][A-Za-z0-9]+)*$", options: .regularExpression) != nil, root["draft"] as? Bool != true, root["prerelease"] as? Bool != true,
              let raw = root["html_url"] as? String, let url = URL(string: raw), url.scheme == "https", url.host == "github.com", url.user == nil, url.password == nil, url.port == nil, url.fragment == nil, url.query == nil, url.path == "/bedlatess/GeometryPanel/releases/tag/" + tag else { throw PanelError.invalid("发布资料校验未通过。") }
        release = url
        let current = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "0.0.0", latest = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        return ["available": latest.compare(current, options: .numeric) == .orderedDescending, "version": latest, "releaseUrl": url.absoluteString, "installation": "self-sign-unsigned-ipa"]
    }
    func installUpdate() throws -> [String: Any] {
        guard let release else { throw PanelError.invalid("请先检查更新，核对本仓库版本。") }
        UIApplication.shared.open(release); return ["opened": true, "message": "请下载未签名 IPA，使用自己的签名工具安装；不会签名可继续使用 Safari 主屏幕版。"]
    }
}

enum GeminiOTA {
    static func frame(_ command: UInt32, _ body: Data = Data()) throws -> Data {
        guard body.count <= 65536 else { throw PanelError.invalid("OTA 帧过长。") }; var frame = Data(); frame.appendBE(UInt16(0)); frame.appendBE(command); frame.appendBE(UInt32(body.count)); frame += body; return frame
    }
    static func read(_ socket: MeterSocket, command: UInt32, timeout: Double) async throws -> Data {
        let deadline = Date().addingTimeInterval(timeout)
        for _ in 0..<16 {
            let remaining = deadline.timeIntervalSinceNow; guard remaining > 0 else { throw PanelError.timeout }
            let head = try await socket.read(10, timeout: remaining)
            guard try head.unsigned(0, 2, little: false) == 0 else { throw PanelError.invalid("OTA 帧头无效。") }
            let received = UInt32(try head.unsigned(2, 4, little: false)), length = Int(try head.unsigned(6, 4, little: false))
            guard length <= 65536 else { throw PanelError.invalid("OTA 回复超限。") }
            let body = length == 0 ? Data() : try await socket.read(length, timeout: max(0.1, deadline.timeIntervalSinceNow))
            if received == command { return body }; guard received == 0x10000002 else { throw PanelError.invalid("OTA 回复顺序不符。") }
        }
        throw PanelError.invalid("OTA 回复次数超限。")
    }
    static func prepare(_ source: URL) throws -> (URL, Int, String, String) {
        let allowed = source.startAccessingSecurityScopedResource(); defer { if allowed { source.stopAccessingSecurityScopedResource() } }
        let name = source.lastPathComponent
        guard name.count <= 200, name.lowercased().hasSuffix(".bin"), !name.contains("/"), !name.contains("\\"), name.rangeOfCharacter(from: .controlCharacters) == nil else { throw PanelError.invalid("请选择名称有效的 .bin 固件。") }
        let destination = FileManager.default.temporaryDirectory.appendingPathComponent("meter-ota-" + UUID().uuidString + ".bin")
        FileManager.default.createFile(atPath: destination.path, contents: nil, attributes: [.protectionKey: FileProtectionType.complete])
        do {
            let input = try FileHandle(forReadingFrom: source), output = try FileHandle(forWritingTo: destination); defer { try? input.close(); try? output.close() }
            var context = CC_MD5_CTX(); CC_MD5_Init(&context); var size = 0
            while let data = try input.read(upToCount: 65536), !data.isEmpty {
                try Task.checkCancellation(); size += data.count; guard size <= 512 * 1024 * 1024 else { throw PanelError.invalid("固件须小于 512 MiB。") }
                try output.write(contentsOf: data); _ = data.withUnsafeBytes { CC_MD5_Update(&context, $0.baseAddress, CC_LONG(data.count)) }
            }
            guard size > 0 else { throw PanelError.invalid("固件为空。") }
            var digest = [UInt8](repeating: 0, count: 16); CC_MD5_Final(&digest, &context)
            return (destination, size, Data(digest).hex, name)
        } catch { try? FileManager.default.removeItem(at: destination); throw error }
    }
}

@MainActor final class NativeToolController: UIViewController, UIDocumentPickerDelegate {
    private let name: String
    private unowned let tools: NativeTools
    private let output = UITextView()
    private var task: Task<Void, Never>?, socket: MeterSocket?
    private var preparation: Task<(URL, Int, String, String), Error>?
    private var confirmation: CheckedContinuation<Void, Error>?
    private var generation = 0, began = false
    init(name: String, tools: NativeTools) { self.name = name; self.tools = tools; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); view.backgroundColor = .systemBackground
        title = ["ota":"Gemini 仪表升级", "wallpaperZip":"检查本地壁纸 ZIP", "diagnostics":"脱敏诊断", "updates":"应用更新"][name]
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "关闭", style: .done, target: self, action: #selector(close))
        if name == "ota" { navigationItem.leftBarButtonItem = UIBarButtonItem(title: "停止", style: .plain, target: self, action: #selector(stopTransmission)) }
        let button = UIButton(type: .system); var config = UIButton.Configuration.filled(); config.title = ["ota":"选择本地 .bin 固件", "wallpaperZip":"选择 ZIP 并校验 / 导出", "diagnostics":"导出诊断", "updates":"检查本仓库更新"][name]; button.configuration = config; button.addAction(UIAction { [weak self] _ in self?.perform() }, for: .touchUpInside)
        let stack = UIStackView(arrangedSubviews: [button, output]); stack.axis = .vertical; stack.spacing = 20; stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        NSLayoutConstraint.activate([stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 20), stack.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor, constant: -20), stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 20), stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -20)])
        output.isEditable = false; output.font = .preferredFont(forTextStyle: .body)
        output.text = name == "ota" ? "仅适用于 AE5I 的 5 寸 Sunplus Gemini 仪表。先手动连接自己的车辆热点，停稳车辆并保持供电。读取版本后还需再次确认；MD5 不能证明固件兼容性，必须使用你确认来源和车型的固件。" : name == "wallpaperZip" ? "在本机检查 ZIP 中的 1.png、2.png、长度、CRC 和 PNG 结构。通过后可保存 / 分享；推送请回仪表壁纸入口选中模板。" : name == "updates" ? "这里只读取本 GitHub 仓库正式发布。IPA 不签名，下载后由使用者自签；Safari 主屏幕版无需签名。" : "仅导出版本、能力、账号数量和监控模式，不含账号、钥匙、位置、服务端原文。"
        if name == "updates" {
            let install = UIButton(type: .system); install.setTitle("打开已核对的发布页 / 自签安装", for: .normal); install.addAction(UIAction { [weak self] _ in do { _ = try self?.tools.installUpdate() } catch { self?.output.text = (error as? PanelError)?.errorDescription } }, for: .touchUpInside); stack.insertArrangedSubview(install, at: 1)
        }
    }
    private func perform() {
        guard task == nil else { return }
        if ["ota", "wallpaperZip"].contains(name) { let picker = UIDocumentPickerViewController(forOpeningContentTypes: name == "ota" ? [.data] : [.zip], asCopy: true); picker.delegate = self; present(picker, animated: true); return }
        if name == "diagnostics" { do { _ = try tools.exportDiagnostics() } catch { output.text = "导出未完成。" }; return }
        task = Task { [weak self] in guard let self else { return }; defer { self.task = nil }; do { let result = try await self.tools.checkUpdate(); self.output.text = "检查结果：\(result["version"] as? String ?? "暂无正式发布")。\n\(result["available"] as? Bool == true ? "有新版本，可打开发布页。" : "当前没有更高的正式版本。")\nIPA 需要使用者自签安装。" } catch { self.output.text = "暂时无法读取发布信息，请稍后重试。" } }
    }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let source = urls.first, task == nil else { return }
        let epoch = generation
        task = Task { [weak self] in
            guard let self else { return }; defer { if self.generation == epoch { self.task = nil; self.socket?.close(); self.socket = nil; self.isModalInPresentation = false } }
            do {
                if self.name == "wallpaperZip" {
                    let access = source.startAccessingSecurityScopedResource(); defer { if access { source.stopAccessingSecurityScopedResource() } }
                    guard let size = try source.resourceValues(forKeys: [.fileSizeKey]).fileSize, size > 0, size <= 16 * 1024 * 1024 else { throw PanelError.invalid("ZIP 必须小于 16 MiB。") }
                    let data = try Data(contentsOf: source); try WallpaperArchive.validate(data)
                    guard epoch == self.generation else { throw PanelError.cancelled }; self.output.text = "ZIP / PNG 校验通过，可保存后从壁纸模板入口推送。"
                    controller.dismiss(animated: true) { [weak self] in
                        guard let self, epoch == self.generation else { return }; do { try self.tools.share(data, name: "GeometryPanel-wallpaper.zip") } catch { self.output.text = "校验通过，导出未完成。请重新选择后重试。" }
                    }; return
                }
                self.output.text = "正在复制并校验固件…"
                self.preparation = Task.detached(priority: .userInitiated) { try GeminiOTA.prepare(source) }
                guard let preparation = self.preparation else { throw PanelError.cancelled }; let prepared = try await preparation.value; self.preparation = nil
                defer { try? FileManager.default.removeItem(at: prepared.0) }
                guard epoch == self.generation, !Task.isCancelled else { throw PanelError.cancelled }
                let socket = MeterSocket(port: 10086); self.socket = socket; try await socket.open()
                try await socket.send(GeminiOTA.frame(0x10000001)); let versionData = try await GeminiOTA.read(socket, command: 0x10000001, timeout: 5)
                guard let version = String(data: versionData, encoding: .utf8)?.trimmingCharacters(in: .whitespacesAndNewlines), !version.isEmpty else { throw PanelError.invalid("仪表版本无法识别。") }
                guard epoch == self.generation, UIApplication.shared.applicationState == .active else { throw PanelError.cancelled }
                try await self.confirm("确认固件推送", "仪表版本：\(String(version.prefix(200)))\n文件：\(prepared.3)\n大小：\(prepared.1)\nMD5：\(prepared.2)\n确认这是自己的 AE5I Gemini 仪表及适用固件。开始后请保持供电，中断时不要直接重试。")
                guard epoch == self.generation, !Task.isCancelled else { throw PanelError.cancelled }
                self.began = true; self.isModalInPresentation = true
                try await socket.send(GeminiOTA.frame(0x10000003, MeterWire.json(["size": prepared.1, "md5": prepared.2, "name": prepared.3, "type": "gemini"])))
                _ = try await GeminiOTA.read(socket, command: 0x10000004, timeout: 15)
                let input = try FileHandle(forReadingFrom: prepared.0); defer { try? input.close() }; var sent = 0
                while let data = try input.read(upToCount: 4096), !data.isEmpty {
                    guard epoch == self.generation, !Task.isCancelled else { throw PanelError.cancelled }
                    try await socket.send(GeminiOTA.frame(0x10000005, data)); sent += data.count; self.output.text = "正在推送 \(sent * 100 / prepared.1)%；请保持供电。"
                }
                try await socket.send(GeminiOTA.frame(0x10000007)); _ = try await GeminiOTA.read(socket, command: 0x10000006, timeout: 60)
                guard epoch == self.generation else { throw PanelError.cancelled }
                self.output.text = "收到仪表最终校验响应，这不代表升级成功。请保持供电，现场观察重启后版本变化。"
            } catch {
                if epoch == self.generation { self.output.text = self.began ? "升级请求已经发出，当前结果未知。保持供电，查看仪表，不要直接重复推送。" : (error as? PanelError)?.errorDescription ?? "操作没有完成，请检查文件、车辆热点和系统局域网权限。" }
            }
        }
    }
    private func confirm(_ title: String, _ text: String) async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            confirmation = continuation
            let alert = UIAlertController(title: title, message: text, preferredStyle: .alert); alert.addAction(UIAlertAction(title: "取消", style: .cancel) { [weak self] _ in self?.completeConfirmation(.failure(PanelError.cancelled)) }); alert.addAction(UIAlertAction(title: "确认推送", style: .destructive) { [weak self] _ in self?.completeConfirmation(.success(())) }); present(alert, animated: true)
        }
    }
    private func completeConfirmation(_ result: Result<Void, Error>) { let saved = confirmation; confirmation = nil; saved?.resume(with: result) }
    func cancel() { generation += 1; completeConfirmation(.failure(PanelError.cancelled)); preparation?.cancel(); preparation = nil; task?.cancel(); task = nil; socket?.close(); socket = nil; isModalInPresentation = false }
    @objc private func stopTransmission() {
        guard task != nil, presentedViewController == nil else { return }
        let alert = UIAlertController(title: "停止当前操作", message: began ? "请求已发送；停止后结果未知，请保持车辆供电并观察仪表，不要直接重试。" : "将取消文件准备或仪表查询。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "继续", style: .cancel)); alert.addAction(UIAlertAction(title: "停止", style: .destructive) { [weak self] _ in guard let self else { return }; self.cancel(); self.output.text = self.began ? "传输已中止，结果未知。请保持供电并观察仪表。" : "已取消。" }); present(alert, animated: true)
    }
    override func viewDidDisappear(_ animated: Bool) { super.viewDidDisappear(animated); if navigationController?.isBeingDismissed == true || isBeingDismissed { cancel() } }
    @objc private func close() { if began, task != nil { output.text = "正在传输；如确需中止，请保持车辆供电后退出应用，结果将未知。"; return }; cancel(); dismiss(animated: true) }
}

@MainActor final class ScannerController: UIViewController, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession(), result = UITextView()
    private let captureQueue = DispatchQueue(label: "geometry.scanner.capture")
    private var closed = false
    override func viewDidLoad() {
        super.viewDidLoad(); title = "扫码工具"; view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "关闭", style: .done, target: self, action: #selector(close))
        result.isEditable = false; result.font = .preferredFont(forTextStyle: .body); result.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(result)
        NSLayoutConstraint.activate([result.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 16), result.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -16), result.bottomAnchor.constraint(equalTo: view.safeAreaLayoutGuide.bottomAnchor), result.heightAnchor.constraint(equalToConstant: 180)])
        result.text = "扫描结果只在本机显示，可长按复制；不会自动打开链接、登录或执行车控。"
        Task { [weak self] in
            guard let self else { return }
            guard await AVCaptureDevice.requestAccess(for: .video), !self.closed, self.view.window != nil, let camera = AVCaptureDevice.default(for: .video), let input = try? AVCaptureDeviceInput(device: camera), self.session.canAddInput(input) else { self.result.text = "相机未获允许或不可用，请在系统设置检查相机权限。"; return }
            self.session.addInput(input); let output = AVCaptureMetadataOutput(); guard self.session.canAddOutput(output) else { return }; self.session.addOutput(output)
            output.setMetadataObjectsDelegate(self, queue: .main); output.metadataObjectTypes = [.qr, .ean8, .ean13, .code128].filter { output.availableMetadataObjectTypes.contains($0) }
            let preview = AVCaptureVideoPreviewLayer(session: self.session); preview.videoGravity = .resizeAspectFill; preview.frame = CGRect(x: 0, y: self.view.safeAreaInsets.top, width: self.view.bounds.width, height: max(100, self.view.bounds.height - 240)); self.view.layer.insertSublayer(preview, at: 0)
            let capture = self.session; self.captureQueue.async { capture.startRunning() }
        }
    }
    func metadataOutput(_ output: AVCaptureMetadataOutput, didOutput metadataObjects: [AVMetadataObject], from connection: AVCaptureConnection) {
        guard let text = (metadataObjects.first as? AVMetadataMachineReadableCodeObject)?.stringValue else { return }; result.text = String(text.prefix(4096)) + "\n\n可长按选择和复制。不会自动打开或执行。"
    }
    func stopCapture() { closed = true; let capture = session; captureQueue.async { capture.stopRunning() } }
    override func viewWillDisappear(_ animated: Bool) { super.viewWillDisappear(animated); stopCapture() }
    @objc private func close() { dismiss(animated: true) }
}
