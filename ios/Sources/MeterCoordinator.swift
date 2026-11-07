import UIKit
import UniformTypeIdentifiers
import ImageIO

@MainActor final class MeterCoordinator {
    private weak var host: UIViewController?
    private weak var controller: MeterViewController?
    private let cast = MeterCast()
    private var socket: MeterSocket?
    private var task: Task<Void, Never>?
    private var generation = 0
    private var stopButton: UIButton?
    private(set) var state = "idle"
    var status: [String: Any] { ["state": state, "cast": cast.state, "transport": "manual_vehicle_wifi", "addressVerifiedByVIN": false, "audio": false, "remoteControl": false] }
    init(host: UIViewController) { self.host = host; cast.changed = { [weak self] text in self?.changed(text) } }
    func open(mode: String, params: [String: Any]) throws {
        guard let host, host.presentedViewController == nil else { throw PanelError.unavailable("请先关闭当前系统窗口。") }
        let panel = MeterViewController(mode: mode, params: params, coordinator: self); controller = panel
        let navigation = UINavigationController(rootViewController: panel); navigation.modalPresentationStyle = .pageSheet
        host.present(navigation, animated: true)
    }
    func stop() {
        generation += 1; task?.cancel(); task = nil; socket?.close(); socket = nil; cast.stop(); state = "idle"
        stopButton?.removeFromSuperview(); stopButton = nil
        controller?.navigationController?.dismiss(animated: true); controller = nil
    }
    func beginWallpaper(first: Data, second: Data, params: [String: Any]) throws {
        guard task == nil, let number = params["wallpaperNum"] as? String, !number.isEmpty, number.utf8.count <= 4096,
              let display = params["displayWallpaperSet"] as? String, !display.isEmpty, display.utf8.count <= 4096 else { throw PanelError.invalid("缺少所选壁纸模板的编号或显示配置，请返回网页重新读取模板。") }
        let archive = try MeterWire.wallpaperArchive(first: first, second: second), epoch = generation
        state = "preparing"; changed("正在连接车辆热点的 192.168.0.1:10950…")
        task = Task { [weak self] in
            guard let self else { return }; var began = false
            let socket = MeterSocket(port: 10950); self.socket = socket
            defer { socket.close(); self.socket = nil; self.task = nil }
            do {
                try await socket.open(); guard self.generation == epoch else { throw PanelError.cancelled }
                let metadata = try MeterWire.json(["fileName": "GeometryPanel-wallpaper.zip", "fileSize": archive.count, "md5": MeterWire.md5(archive), "wallpaperNum": number, "displayWallpaperSet": display])
                began = true; self.state = "transferring"; self.controller?.isModalInPresentation = true
                try await socket.send(MeterWire.wallpaper(0x10000043, flag: 1, body: metadata)); try await MeterWire.wallpaperAck(socket, expected: 0x80000043)
                let deadline = Date().addingTimeInterval(120)
                for offset in stride(from: 0, to: archive.count, by: 65536) {
                    guard self.generation == epoch, !Task.isCancelled else { throw PanelError.cancelled }
                    guard Date() < deadline else { throw PanelError.timeout }
                    try await socket.send(MeterWire.wallpaper(0x10000044, flag: 0, body: archive.subdata(in: offset..<min(archive.count, offset + 65536))))
                    self.changed("正在传输壁纸 \(min(100, (offset + 65536) * 100 / archive.count))%…")
                }
                try await socket.send(MeterWire.wallpaper(0x10000045, flag: 1)); try await MeterWire.wallpaperAck(socket, expected: 0x80000045); try await MeterWire.wallpaperAck(socket, expected: 0x10000046)
                guard self.generation == epoch else { throw PanelError.cancelled }
                self.state = "acknowledged"; self.changed("已收到仪表最终校验确认，请现场查看壁纸是否显示。")
            } catch {
                guard self.generation == epoch else { return }
                self.state = "failed"; self.changed(began ? "传输已中断，仪表执行结果未知。请先查看仪表，避免重复推送。" : "无法连接仪表。请确认手动连上了车辆热点，并允许了局域网权限。")
            }
            self.controller?.isModalInPresentation = false
        }
    }
    func beginCast() throws {
        guard task == nil else { throw PanelError.invalid("已有仪表操作在进行。") }
        let epoch = generation
        task = Task { [weak self] in
            guard let self else { return }; defer { self.task = nil }
            do {
                try await self.cast.start(); guard self.generation == epoch else { self.cast.stop(); return }
                self.controller?.navigationController?.dismiss(animated: true)
                self.installStopButton()
            } catch { if self.generation == epoch { self.changed((error as? PanelError)?.errorDescription ?? "投屏启动未完成。") } }
        }
    }
    func stopCast() { cast.stop(); stopButton?.removeFromSuperview(); stopButton = nil; state = "idle"; controller?.setStatus("投屏已停止。") }
    private func changed(_ text: String) { state = cast.state == "casting" ? "casting" : state; controller?.setStatus(text) }
    private func installStopButton() {
        guard let host else { return }; stopButton?.removeFromSuperview()
        let button = UIButton(type: .system); button.setTitle("停止仪表投屏", for: .normal); button.setTitleColor(.white, for: .normal); button.backgroundColor = .systemRed; button.layer.cornerRadius = 12
        button.translatesAutoresizingMaskIntoConstraints = false; button.addAction(UIAction { [weak self] _ in self?.stopCast() }, for: .touchUpInside)
        host.view.addSubview(button); NSLayoutConstraint.activate([button.topAnchor.constraint(equalTo: host.view.safeAreaLayoutGuide.topAnchor, constant: 4), button.trailingAnchor.constraint(equalTo: host.view.trailingAnchor, constant: -12), button.widthAnchor.constraint(equalToConstant: 140), button.heightAnchor.constraint(equalToConstant: 44)]); stopButton = button
    }
}

@MainActor final class MeterViewController: UIViewController, UIDocumentPickerDelegate {
    private let mode: String, params: [String: Any]
    private unowned let coordinator: MeterCoordinator
    private let output = UILabel()
    private var first: Data?, second: Data?, choosing = 1
    private var firstButton: UIButton!, secondButton: UIButton!, startButton: UIButton!
    init(mode: String, params: [String: Any], coordinator: MeterCoordinator) { self.mode = mode; self.params = params; self.coordinator = coordinator; super.init(nibName: nil, bundle: nil) }
    required init?(coder: NSCoder) { fatalError("init(coder:) has not been implemented") }
    override func viewDidLoad() {
        super.viewDidLoad(); title = mode == "wallpaper" ? "仪表壁纸" : "仪表投屏"; view.backgroundColor = .systemBackground
        navigationItem.rightBarButtonItem = UIBarButtonItem(title: "关闭", style: .done, target: self, action: #selector(closePanel))
        let stack = UIStackView(); stack.axis = .vertical; stack.spacing = 16; stack.translatesAutoresizingMaskIntoConstraints = false; view.addSubview(stack)
        NSLayoutConstraint.activate([stack.topAnchor.constraint(equalTo: view.safeAreaLayoutGuide.topAnchor, constant: 24), stack.leadingAnchor.constraint(equalTo: view.leadingAnchor, constant: 24), stack.trailingAnchor.constraint(equalTo: view.trailingAnchor, constant: -24)])
        let guide = UILabel(); guide.numberOfLines = 0; guide.font = .preferredFont(forTextStyle: .body); guide.adjustsFontForContentSizeCategory = true
        guide.text = "先在 iPhone 系统设置中手动连接车辆热点。当前仅连接该 Wi-Fi 下的 192.168.0.1，不能通过 VIN 证明热点身份；请在自己的车辆旁确认。iOS 不支持通用 Wi-Fi Direct。"
        stack.addArrangedSubview(guide)
        if let profile = params["wifiAddress"] as? String, !profile.isEmpty {
            let info = UILabel(); info.numberOfLines = 0; info.font = .preferredFont(forTextStyle: .footnote); info.textColor = .secondaryLabel
            if let data = profile.data(using: .utf8), let object = (try? JSONSerialization.jsonObject(with: data)) as? [String: Any], let ssid = object["ssid"] as? String { info.text = "云端热点名称：\(String(ssid.prefix(64)))。请在系统 Wi-Fi 页面连接，不在本应用日志保存口令。" }
            else { info.text = "已收到云端配对资料。系统不能直接使用 Android Wi-Fi Direct 配对信息；请手动连接车辆热点。" }
            stack.addArrangedSubview(info)
        }
        if mode == "wallpaper" {
            let detail = UILabel(); detail.numberOfLines = 0; detail.font = .preferredFont(forTextStyle: .footnote)
            detail.text = "选择两张图片，替换网页中所选模板的两张壁纸。图片会在本机重新编码为 1.png 和 2.png，不上传到我们的服务器。"
            if let w = dimension("width"), let h = dimension("height") { detail.text! += " 输出尺寸 \(w)×\(h)，按比例裁剪填满。" }
            stack.addArrangedSubview(detail)
            firstButton = button("选择第一张壁纸") { [weak self] in self?.choose(1) }; secondButton = button("选择第二张壁纸") { [weak self] in self?.choose(2) }
            stack.addArrangedSubview(firstButton); stack.addArrangedSubview(secondButton)
        } else {
            let detail = UILabel(); detail.numberOfLines = 0; detail.font = .preferredFont(forTextStyle: .footnote); detail.text = "系统会请求录屏授权。本版本只传输几何面板自身画面；没有音频和触摸反控。切到后台立即停止。支持情况取决于仪表是否接受 iOS 协议握手。"; stack.addArrangedSubview(detail)
        }
        startButton = button(mode == "wallpaper" ? "确认热点后推送壁纸" : "授权并开始投屏") { [weak self] in self?.start() }; stack.addArrangedSubview(startButton)
        let stop = button("停止当前仪表操作") { [weak self] in self?.coordinator.stop() }; stack.addArrangedSubview(stop)
        output.numberOfLines = 0; output.font = .preferredFont(forTextStyle: .footnote); output.textColor = .secondaryLabel; stack.addArrangedSubview(output)
    }
    func setStatus(_ text: String) { output.text = text; startButton?.isEnabled = !["preparing", "transferring"].contains(coordinator.state) }
    private func button(_ title: String, action: @escaping () -> Void) -> UIButton {
        let button = UIButton(type: .system); var configuration = UIButton.Configuration.filled(); configuration.title = title; button.configuration = configuration
        button.addAction(UIAction { _ in action() }, for: .touchUpInside); return button
    }
    private func choose(_ index: Int) { choosing = index; let picker = UIDocumentPickerViewController(forOpeningContentTypes: [.image], asCopy: true); picker.delegate = self; present(picker, animated: true) }
    func documentPicker(_ controller: UIDocumentPickerViewController, didPickDocumentsAt urls: [URL]) {
        guard let url = urls.first else { return }
        let allowed = url.startAccessingSecurityScopedResource(); defer { if allowed { url.stopAccessingSecurityScopedResource() } }
        do {
            let values = try url.resourceValues(forKeys: [.fileSizeKey]); guard let size = values.fileSize, size > 0, size <= 16 * 1024 * 1024 else { throw PanelError.invalid("原图片须小于 16 MiB。") }
            let data = try Data(contentsOf: url, options: [.mappedIfSafe]), image = try normalizedPNG(data)
            if choosing == 1 { first = image; firstButton.setTitle("第一张已选择，点击更换", for: .normal) } else { second = image; secondButton.setTitle("第二张已选择，点击更换", for: .normal) }
            output.text = "已在本机重新编码，大小 \(image.count / 1024) KiB。"
        } catch { output.text = (error as? PanelError)?.errorDescription ?? "图片读取失败，请换一张图片。" }
    }
    private func dimension(_ key: String) -> Int? { guard let value = params[key] as? Int, (1...8192).contains(value) else { return nil }; return value }
    private func normalizedPNG(_ data: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, [kCGImageSourceShouldCache: false] as CFDictionary), let properties = CGImageSourceCopyPropertiesAtIndex(source, 0, nil) as? [CFString: Any], let width = properties[kCGImagePropertyPixelWidth] as? Int, let height = properties[kCGImagePropertyPixelHeight] as? Int,
              (1...8192).contains(width), (1...8192).contains(height), width * height <= 16777216 else { throw PanelError.invalid("图片尺寸超限或格式不能读取。") }
        let targetWidth = dimension("width") ?? width, targetHeight = dimension("height") ?? height
        guard targetWidth * targetHeight <= 16777216, let image = CGImageSourceCreateThumbnailAtIndex(source, 0, [kCGImageSourceCreateThumbnailFromImageAlways: true, kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: max(width, height)] as CFDictionary) else { throw PanelError.invalid("图片无法在本机解码。") }
        let format = UIGraphicsImageRendererFormat(); format.scale = 1; format.opaque = true
        let renderer = UIGraphicsImageRenderer(size: CGSize(width: CGFloat(targetWidth), height: CGFloat(targetHeight)), format: format)
        let output = renderer.pngData { context in
            UIColor.black.setFill(); context.fill(CGRect(x: 0, y: 0, width: CGFloat(targetWidth), height: CGFloat(targetHeight)))
            let factor = max(CGFloat(targetWidth) / CGFloat(image.width), CGFloat(targetHeight) / CGFloat(image.height))
            let size = CGSize(width: CGFloat(image.width) * factor, height: CGFloat(image.height) * factor)
            UIImage(cgImage: image).draw(in: CGRect(x: (CGFloat(targetWidth) - size.width) / 2, y: (CGFloat(targetHeight) - size.height) / 2, width: size.width, height: size.height))
        }
        guard output.count <= 16 * 1024 * 1024 else { throw PanelError.invalid("重新编码后的 PNG 过大，请选择更小的图片。") }; return output
    }
    private func start() {
        if mode == "wallpaper", first == nil || second == nil { output.text = "请先选择两张图片。"; return }
        let alert = UIAlertController(title: "确认当前车辆热点", message: mode == "wallpaper" ? "确认当前 Wi-Fi 是自己的仪表热点，车辆停稳且供电正常。推送后请查看仪表；中断时结果可能未知。" : "确认当前 Wi-Fi 是自己的仪表热点。系统授权后只采集本应用画面，可随时点击红色按钮停止。", preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "取消", style: .cancel)); alert.addAction(UIAlertAction(title: "确认", style: .default) { [weak self] _ in
            guard let self else { return }
            do { if self.mode == "wallpaper", let first = self.first, let second = self.second { try self.coordinator.beginWallpaper(first: first, second: second, params: self.params) } else { try self.coordinator.beginCast() } }
            catch { self.output.text = (error as? PanelError)?.errorDescription ?? "仪表操作未完成。" }
        }); present(alert, animated: true)
    }
    @objc private func closePanel() {
        if coordinator.state == "transferring" { output.text = "正在传输，若要中止请点“停止当前仪表操作”；中止后结果可能未知。"; return }
        dismiss(animated: true)
    }
}
