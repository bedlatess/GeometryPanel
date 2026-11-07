import XCTest
@testable import GeometryPanel

final class ProtocolTests: XCTestCase {
    func testMainDocumentOriginAndPath() {
        XCTAssertTrue(TrustedPage.permits(URL(string: "https://bedlatess.github.io/GeometryPanel/")))
        XCTAssertTrue(TrustedPage.permits(URL(string: "https://bedlatess.github.io:443/GeometryPanel/index.html?a=1#test")))
        for value in ["http://bedlatess.github.io/GeometryPanel/", "https://bedlatess.github.io.evil.test/GeometryPanel/", "https://bedlatess.github.io/Other/", "https://bedlatess.github.io/GeometryPanel-evil/", "https://bedlatess.github.io:444/GeometryPanel/", "https://user@bedlatess.github.io/GeometryPanel/", "https://bedlatess.github.io/GeometryPanel/%2e%2e/Other/"] {
            XCTAssertFalse(TrustedPage.permits(URL(string: value)), value)
        }
    }
    func testBLEFrameFragmentAndChecksum() throws {
        let payload = KeyProtocol.bytes(1, Data([1,2,3])), frame = try KeyProtocol.frame(0x5a, payload)
        var buffer = Data(frame.prefix(4)); XCTAssertNil(try KeyProtocol.takeFrame(&buffer))
        buffer += frame.dropFirst(4); let decoded = try XCTUnwrap(KeyProtocol.takeFrame(&buffer))
        XCTAssertEqual(decoded.0, 0x5a); XCTAssertEqual(decoded.1, payload); XCTAssertTrue(buffer.isEmpty)
        buffer = frame; buffer[buffer.count - 2] ^= 1; XCTAssertThrowsError(try KeyProtocol.takeFrame(&buffer))
    }
    func testBLEFrameResyncAndWhitelist() throws {
        let frame = try KeyProtocol.frame(0x7f, KeyProtocol.number(1, 1)); var buffer = Data([0, 0xff, 0xab]) + frame
        XCTAssertEqual(try KeyProtocol.takeFrame(&buffer)?.0, 0x7f)
        XCTAssertThrowsError(try KeyProtocol.frame(0x01, Data()))
        XCTAssertThrowsError(try KeyProtocol.frame(0x5a, Data(repeating: 0, count: 241)))
    }
    func testProtoRejectsDuplicateAndTruncation() throws {
        XCTAssertEqual(try KeyProtocol.decode(KeyProtocol.number(1, 300))[1], .number(300))
        XCTAssertThrowsError(try KeyProtocol.decode(Data([8, 0, 8, 1])))
        XCTAssertThrowsError(try KeyProtocol.decode(Data([10, 10, 1])))
        XCTAssertThrowsError(try KeyProtocol.decode(Data([8] + Array(repeating: 255, count: 10))))
        XCTAssertThrowsError(try KeyProtocol.decode(Data([11])))
    }
    func testChallengeIndependentNodeVector() throws {
        let encoded = Data("d00fc91a26532bf4fe99f1fdf2f237dac081bfadbbadd67989fe319d2d73ee42".utf8)
        XCTAssertEqual(try KeyProtocol.decryptChallenge(encoded, key: Data("0123456789abcdef".utf8)), Data("synthetic-challenge".utf8))
        XCTAssertThrowsError(try KeyProtocol.decryptChallenge(Data("bad".utf8), key: Data(repeating: 0, count: 16)))
    }
    private func binding() -> [String: Any] {
        ["vin": "SYNTHETIC_VEHICLE_1", "uid": "synthetic-user", "ownerId": "synthetic-user", "bindingUserId": "synthetic-user", "sharedFlag": 0,
         "credentialDigest": String(repeating: "ab", count: 32), "fetchedAt": 1000000.0, "inductiveGeneration": "2.0", "cloudEnabled": true,
         "encryptInfo": ["encryptValue": String(repeating: "01", count: 64), "key": "0123456789abcdef"]]
    }
    func testOwnerScopeAndFreshnessGate() throws {
        XCTAssertNoThrow(try VehicleBinding(binding(), now: 1000001))
        for key in ["ownerId", "bindingUserId", "uid"] { var params = binding(); params[key] = "wrong-user"; XCTAssertThrowsError(try VehicleBinding(params, now: 1000001)) }
        var shared = binding(); shared["sharedFlag"] = 1; XCTAssertThrowsError(try VehicleBinding(shared, now: 1000001))
        XCTAssertThrowsError(try VehicleBinding(binding(), now: 1300000))
        XCTAssertThrowsError(try VehicleBinding(binding(), now: 994000))
    }
    func testNoSecretBindingStillSupportsMeter() throws {
        var params = binding(); params.removeValue(forKey: "encryptInfo"); params["fetchedAt"] = Date().timeIntervalSince1970 * 1000
        let result = try VehicleBinding(params); XCTAssertNoThrow(try result.requireFresh()); XCTAssertThrowsError(try result.requireKey())
    }
    func testMaterialCannotAuthorizeBLE3() throws {
        var params = binding(); params["inductiveGeneration"] = "3.0"; params["fetchedAt"] = Date().timeIntervalSince1970 * 1000
        XCTAssertThrowsError(try VehicleBinding(params).requireKey())
    }
    func testControlFramingAndTamper() throws {
        let packet = try MeterWire.control(0x70000010, Data([1,2,3])), header = Data(packet.prefix(16))
        let parsed = try MeterWire.controlHeader(header); XCTAssertEqual(parsed.0, 0x70000010); XCTAssertEqual(parsed.1, 3)
        var altered = header; altered[8] ^= 1; XCTAssertThrowsError(try MeterWire.controlHeader(altered))
    }
    func testWallpaperZipNarrowStructure() throws {
        let first = Data([1,2,3]), second = Data([4,5,6,7]), zip = try MeterWire.wallpaperArchive(first: first, second: second)
        XCTAssertEqual(try zip.unsigned(0, 4), 0x04034b50)
        XCTAssertEqual(try zip.unsigned(zip.count - 22, 4), 0x06054b50)
        XCTAssertEqual(try zip.unsigned(zip.count - 12, 2), 2)
        XCTAssertEqual(String(data: zip.subdata(in: 30..<35), encoding: .utf8), "1.png")
        XCTAssertEqual(try zip.unsigned(14, 4), UInt64(MeterWire.crc(first)))
        XCTAssertThrowsError(try MeterWire.wallpaperArchive(first: Data(), second: second))
        XCTAssertThrowsError(try MeterWire.wallpaperArchive(first: Data(repeating: 0, count: 16 * 1024 * 1024), second: second))
    }
    func testCRCAndMD5KnownVectors() {
        XCTAssertEqual(MeterWire.crc(Data("123456789".utf8)), 0xcbf43926)
        XCTAssertEqual(MeterWire.md5(Data("abc".utf8)), "900150983cd24fb0d6963f7d28e17f72")
    }
    func testWallpaperFrameIsBigEndian() throws {
        let frame = MeterWire.wallpaper(0x10000043, flag: 1, body: Data([3,4])); XCTAssertEqual(frame, Data([1,1,0x10,0,0,0x43,0,0,0,2,3,4]))
    }
}
