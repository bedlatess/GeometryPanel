import Foundation
import Network

private final class CompletionGate<T> {
    private let lock = NSLock()
    private var continuation: CheckedContinuation<T, Error>?
    init(_ continuation: CheckedContinuation<T, Error>) { self.continuation = continuation }
    func finish(_ result: Result<T, Error>) {
        lock.lock(); let saved = continuation; continuation = nil; lock.unlock(); saved?.resume(with: result)
    }
}

final class MeterSocket {
    static let car = "192.168.0.1"
    let connection: NWConnection
    private let queue = DispatchQueue(label: "geometry.meter.tcp")
    static func parameters() -> NWParameters {
        let params = NWParameters.tcp; params.requiredInterfaceType = .wifi; params.prohibitedInterfaceTypes = [.cellular]
        params.allowLocalEndpointReuse = true; return params
    }
    init(port: UInt16) { connection = NWConnection(host: NWEndpoint.Host(Self.car), port: NWEndpoint.Port(rawValue: port)!, using: Self.parameters()) }
    init(accepted: NWConnection) throws {
        guard case .hostPort(let host, _) = accepted.endpoint, host.debugDescription == Self.car else { accepted.cancel(); throw PanelError.invalid("拒绝了非车辆地址的仪表连接。") }
        connection = accepted
    }
    func open() async throws {
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let gate = CompletionGate(continuation)
            connection.stateUpdateHandler = { state in
                switch state {
                case .ready: gate.finish(.success(()))
                case .failed, .cancelled: gate.finish(.failure(PanelError.disconnected))
                default: break
                }
            }
            connection.start(queue: queue)
            queue.asyncAfter(deadline: .now() + 8) { [weak self] in guard let self else { return }; if case .ready = self.connection.state { return }; gate.finish(.failure(PanelError.timeout)); self.close() }
        }
    }
    func read(_ count: Int, timeout: Double = 15) async throws -> Data {
        guard count > 0, count <= 262144 else { throw PanelError.invalid("仪表读取长度无效。") }
        return try await withCheckedThrowingContinuation { continuation in
            let gate = CompletionGate(continuation)
            let timeoutTask = DispatchWorkItem { [weak self] in gate.finish(.failure(PanelError.timeout)); self?.close() }
            queue.asyncAfter(deadline: .now() + timeout, execute: timeoutTask)
            connection.receive(minimumIncompleteLength: count, maximumLength: count) { data, _, _, error in
                timeoutTask.cancel()
                guard error == nil, let data, data.count == count else { gate.finish(.failure(PanelError.disconnected)); return }
                gate.finish(.success(data))
            }
        }
    }
    func send(_ data: Data) async throws {
        guard data.count <= 16 * 1024 * 1024 else { throw PanelError.invalid("仪表发送内容过长。") }
        try await withCheckedThrowingContinuation { (continuation: CheckedContinuation<Void, Error>) in
            let gate = CompletionGate(continuation)
            let timeoutTask = DispatchWorkItem { [weak self] in gate.finish(.failure(PanelError.timeout)); self?.close() }
            queue.asyncAfter(deadline: .now() + 20, execute: timeoutTask)
            connection.send(content: data, completion: .contentProcessed { error in
                timeoutTask.cancel(); gate.finish(error == nil ? .success(()) : .failure(PanelError.disconnected))
            })
        }
    }
    func close() { connection.cancel() }
}

enum MeterWire {
    static func control(_ command: UInt32, _ body: Data = Data()) throws -> Data {
        guard body.count <= 262128 else { throw PanelError.invalid("仪表控制帧过长。") }
        let length = UInt32(body.count + 16); var frame = Data(); frame.appendLE(command); frame.appendLE(length); frame.appendLE(command ^ length); frame.appendLE(UInt32(0)); frame += body; return frame
    }
    static func controlHeader(_ data: Data) throws -> (UInt32, Int) {
        guard data.count == 16 else { throw PanelError.invalid("仪表控制头无效。") }
        let command = UInt32(try data.unsigned(0, 4)), length = UInt32(try data.unsigned(4, 4))
        guard (16...262144).contains(length), try data.unsigned(8, 4) == UInt64(command ^ length), try data.unsigned(12, 4) == 0 else { throw PanelError.invalid("仪表控制帧校验失败。") }
        return (command, Int(length) - 16)
    }
    static func readControl(_ socket: MeterSocket) async throws -> (UInt32, Data) {
        let (command, count) = try controlHeader(await socket.read(16)); return (command, count > 0 ? try await socket.read(count) : Data())
    }
    static func media(_ command: UInt16, _ sequence: UInt32, _ body: Data = Data()) throws -> Data {
        guard body.count <= 65535 else { throw PanelError.invalid("仪表媒体帧过长。") }
        var frame = Data(); frame.appendLE(command); frame.appendLE(UInt16(body.count)); frame.appendLE(sequence); frame += body; return frame
    }
    static func readMedia(_ socket: MeterSocket) async throws -> (UInt16, UInt32, Data) {
        let header = try await socket.read(8); let command = UInt16(try header.unsigned(0, 2)), size = Int(try header.unsigned(2, 2)), sequence = UInt32(try header.unsigned(4, 4))
        return (command, sequence, size > 0 ? try await socket.read(size) : Data())
    }
    static func wallpaper(_ command: UInt32, flag: UInt8, body: Data = Data()) -> Data {
        var frame = Data([1, flag]); frame.appendBE(command); frame.appendBE(UInt32(body.count)); frame += body; return frame
    }
    static func wallpaperAck(_ socket: MeterSocket, expected: UInt32) async throws {
        let header = try await socket.read(10)
        let command = try header.unsigned(2, 4, little: false), length = try header.unsigned(6, 4, little: false)
        guard header[0] == 1, header[1] == 2, command == expected, (1...65536).contains(length) else { throw PanelError.invalid("仪表壁纸回复格式不符。") }
        let data = try await socket.read(Int(length))
        guard let body = try JSONSerialization.jsonObject(with: data) as? [String: Any], let code = body["code"] as? String, code == "1" else { throw PanelError.invalid("仪表没有确认壁纸传输。") }
    }
    static func json(_ value: [String: Any]) throws -> Data { try JSONSerialization.data(withJSONObject: value, options: [.sortedKeys]) }
    static func crc(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xffffffff
        for byte in data { crc ^= UInt32(byte); for _ in 0..<8 { crc = crc & 1 == 1 ? (crc >> 1) ^ 0xedb88320 : crc >> 1 } }
        return ~crc
    }
    // Build a narrow stored ZIP ourselves: exactly two root files, no extras,
    // comments, descriptors or third-party archive input.
    static func wallpaperArchive(first: Data, second: Data) throws -> Data {
        guard !first.isEmpty, !second.isEmpty, first.count + second.count < 16 * 1024 * 1024 - 1024 else { throw PanelError.invalid("两张壁纸合计必须小于 16 MiB。") }
        var archive = Data(), central = Data()
        for (name, data) in [("1.png", first), ("2.png", second)] {
            let offset = UInt32(archive.count), filename = Data(name.utf8), checksum = crc(data), size = UInt32(data.count)
            archive.appendLE(UInt32(0x04034b50)); archive.appendLE(UInt16(20)); archive.appendLE(UInt16(0)); archive.appendLE(UInt16(0)); archive.appendLE(UInt16(0)); archive.appendLE(UInt16(0)); archive.appendLE(checksum); archive.appendLE(size); archive.appendLE(size); archive.appendLE(UInt16(filename.count)); archive.appendLE(UInt16(0)); archive += filename; archive += data
            central.appendLE(UInt32(0x02014b50)); central.appendLE(UInt16(20)); central.appendLE(UInt16(20)); central.appendLE(UInt16(0)); central.appendLE(UInt16(0)); central.appendLE(UInt16(0)); central.appendLE(UInt16(0)); central.appendLE(checksum); central.appendLE(size); central.appendLE(size); central.appendLE(UInt16(filename.count)); central.appendLE(UInt16(0)); central.appendLE(UInt16(0)); central.appendLE(UInt16(0)); central.appendLE(UInt16(0)); central.appendLE(UInt32(0)); central.appendLE(offset); central += filename
        }
        let offset = UInt32(archive.count); archive += central
        archive.appendLE(UInt32(0x06054b50)); archive.appendLE(UInt16(0)); archive.appendLE(UInt16(0)); archive.appendLE(UInt16(2)); archive.appendLE(UInt16(2)); archive.appendLE(UInt32(central.count)); archive.appendLE(offset); archive.appendLE(UInt16(0)); return archive
    }
    static func md5(_ data: Data) -> String {
        var digest = [UInt8](repeating: 0, count: Int(CC_MD5_DIGEST_LENGTH))
        _ = data.withUnsafeBytes { CC_MD5($0.baseAddress, CC_LONG(data.count), &digest) }
        return Data(digest).hex
    }
}
