import Foundation
import ImageIO

enum WallpaperArchive {
    static func validate(_ data: Data) throws {
        func fail() -> PanelError { PanelError.invalid("壁纸 ZIP 结构或 PNG 校验未通过。只允许根目录的 1.png 和 2.png。") }
        func uint(_ offset: Int, _ length: Int) throws -> Int { guard offset >= 0, offset <= data.count - length else { throw fail() }; return Int(try data.unsigned(offset, length)) }
        guard data.count >= 22, data.count <= 16 * 1024 * 1024 else { throw fail() }
        let end = data.count - 22
        guard try uint(end, 4) == 0x06054b50, try uint(end + 4, 2) == 0, try uint(end + 6, 2) == 0, try uint(end + 8, 2) == 2, try uint(end + 10, 2) == 2, try uint(end + 20, 2) == 0 else { throw fail() }
        let centralSize = try uint(end + 12, 4), centralOffset = try uint(end + 16, 4)
        guard centralOffset + centralSize == end else { throw fail() }
        var cursor = centralOffset, ranges: [(Int, Int)] = [], names: Set<String> = [], total = 0
        for _ in 0..<2 {
            guard try uint(cursor, 4) == 0x02014b50, try uint(cursor + 6, 2) <= 20 else { throw fail() }
            let flags = try uint(cursor + 8, 2), method = try uint(cursor + 10, 2), crc = try uint(cursor + 16, 4), packed = try uint(cursor + 20, 4), size = try uint(cursor + 24, 4)
            let nameSize = try uint(cursor + 28, 2), extra = try uint(cursor + 30, 2), comment = try uint(cursor + 32, 2), offset = try uint(cursor + 42, 4)
            let attributes = try uint(cursor + 38, 4), unixMode = (attributes >> 16) & 0xf000
            guard flags & ~0x808 == 0, [0, 8].contains(method), size > 0, packed > 0, size <= 16 * 1024 * 1024, packed <= 16 * 1024 * 1024, size <= packed * 200, [0, 0x8000].contains(unixMode), attributes & 0x10 == 0,
                  try uint(cursor + 34, 2) == 0, comment == 0, cursor + 46 + nameSize + extra <= end else { throw fail() }
            let nameBytes = data.subdata(in: cursor + 46..<cursor + 46 + nameSize)
            guard let name = String(data: nameBytes, encoding: .utf8), ["1.png", "2.png"].contains(name), names.insert(name).inserted else { throw fail() }
            try extraFields(data.subdata(in: cursor + 46 + nameSize..<cursor + 46 + nameSize + extra))
            guard offset >= 0, offset + 30 < centralOffset, try uint(offset, 4) == 0x04034b50, try uint(offset + 4, 2) <= 20, try uint(offset + 6, 2) == flags, try uint(offset + 8, 2) == method, try uint(offset + 26, 2) == nameSize else { throw fail() }
            let localExtra = try uint(offset + 28, 2), body = offset + 30 + nameSize + localExtra
            guard body <= centralOffset, body + packed <= centralOffset, data.subdata(in: offset + 30..<offset + 30 + nameSize) == nameBytes else { throw fail() }
            try extraFields(data.subdata(in: offset + 30 + nameSize..<body))
            let localCRC = try uint(offset + 14, 4), localPacked = try uint(offset + 18, 4), localSize = try uint(offset + 22, 4)
            var memberEnd = body + packed
            if flags & 8 == 0 { guard localCRC == crc, localPacked == packed, localSize == size else { throw fail() } }
            else {
                guard (localCRC == 0 || localCRC == crc), (localPacked == 0 || localPacked == packed), (localSize == 0 || localSize == size) else { throw fail() }
                if try uint(memberEnd, 4) == 0x08074b50 { memberEnd += 4 }
                guard try uint(memberEnd, 4) == crc, try uint(memberEnd + 4, 4) == packed, try uint(memberEnd + 8, 4) == size else { throw fail() }; memberEnd += 12
            }
            let compressed = data.subdata(in: body..<body + packed), clear = try method == 0 ? compressed : inflateRaw(compressed, size: size)
            guard clear.count == size, Int(MeterWire.crc(clear)) == crc else { throw fail() }
            try png(clear); total += size; guard total <= 32 * 1024 * 1024 else { throw fail() }
            ranges.append((offset, memberEnd)); cursor += 46 + nameSize + extra
        }
        ranges.sort { $0.0 < $1.0 }
        guard cursor == end, ranges[0].0 == 0, ranges[0].1 == ranges[1].0, ranges[1].1 == centralOffset else { throw fail() }
    }
    private static func extraFields(_ data: Data) throws {
        var at = 0
        while at < data.count {
            guard at + 4 <= data.count else { throw PanelError.invalid("ZIP 附加字段截断。") }
            let kind = try data.unsigned(at, 2), size = Int(try data.unsigned(at + 2, 2))
            guard kind != 1, kind != 0x7075, at + 4 + size <= data.count else { throw PanelError.invalid("不支持 ZIP64 或路径覆盖字段。") }; at += 4 + size
        }
    }
    private static func inflateRaw(_ data: Data, size: Int) throws -> Data {
        var stream = z_stream(), output = Data(count: size)
        guard inflateInit2_(&stream, -MAX_WBITS, ZLIB_VERSION, Int32(MemoryLayout<z_stream>.size)) == Z_OK else { throw PanelError.invalid("ZIP 解压器不可用。") }
        defer { inflateEnd(&stream) }
        let status = data.withUnsafeBytes { input in output.withUnsafeMutableBytes { result -> Int32 in
            stream.next_in = UnsafeMutablePointer<Bytef>(mutating: input.bindMemory(to: Bytef.self).baseAddress); stream.avail_in = uInt(data.count)
            stream.next_out = result.bindMemory(to: Bytef.self).baseAddress; stream.avail_out = uInt(size)
            return inflate(&stream, Z_FINISH)
        } }
        guard status == Z_STREAM_END, UInt64(stream.total_in) == UInt64(data.count), UInt64(stream.total_out) == UInt64(size) else { throw PanelError.invalid("ZIP 压缩长度不符。") }; return output
    }
    static func png(_ data: Data) throws {
        func fail() -> PanelError { PanelError.invalid("PNG 格式、尺寸、区块或校验码无效。") }
        guard data.count > 45, data.prefix(8) == Data([137,80,78,71,13,10,26,10]) else { throw fail() }
        var cursor = 8, count = 0, sawHeader = false, sawPalette = false, sawData = false, endedData = false, color: UInt8 = 0
        while cursor <= data.count - 12 {
            let size = Int(try data.unsigned(cursor, 4, little: false)); count += 1
            guard count <= 4096, size <= 16 * 1024 * 1024, cursor + 12 + size <= data.count else { throw fail() }
            let kindData = data.subdata(in: cursor + 4..<cursor + 8), kind = String(data: kindData, encoding: .ascii) ?? ""
            guard kindData.allSatisfy({ (65...90).contains($0) || (97...122).contains($0) }), kindData[2] & 32 == 0,
                  try data.unsigned(cursor + 8 + size, 4, little: false) == UInt64(MeterWire.crc(data.subdata(in: cursor + 4..<cursor + 8 + size))) else { throw fail() }
            if !sawHeader {
                guard kind == "IHDR", size == 13 else { throw fail() }
                let width = try data.unsigned(cursor + 8, 4, little: false), height = try data.unsigned(cursor + 12, 4, little: false), depth = data[cursor + 16]; color = data[cursor + 17]
                let depths: [UInt8: [UInt8]] = [0:[1,2,4,8,16],2:[8,16],3:[1,2,4,8],4:[8,16],6:[8,16]]
                guard width > 0, height > 0, width <= 8192, height <= 8192, width * height <= 16777216, depths[color]?.contains(depth) == true, data[cursor + 18] == 0, data[cursor + 19] == 0, data[cursor + 20] <= 1 else { throw fail() }; sawHeader = true
            } else if kind == "IHDR" { throw fail() }
            else if kind == "PLTE" { guard !sawPalette, !sawData, size > 0, size <= 768, size % 3 == 0, ![0,4].contains(color) else { throw fail() }; sawPalette = true }
            else if kind == "IDAT" { guard !endedData, color != 3 || sawPalette else { throw fail() }; sawData = true }
            else if kind == "IEND" { guard sawData, size == 0, cursor + 12 == data.count else { throw fail() }; return }
            else { guard kindData[0] & 32 != 0 else { throw fail() }; if sawData { endedData = true } }
            cursor += size + 12
        }
        throw fail()
    }
}
