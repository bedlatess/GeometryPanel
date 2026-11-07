import XCTest
@testable import GeometryPanel

final class NativeParityTests: XCTestCase {
    private let png = Data(base64Encoded: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==")!
    func testIndependentAPPAndH5SignatureVectors() {
        let app = LegacyCloudSignature.sign(query: ["z":"2", "empty":"", "a":"1"], timestamp: 1700000000000, nonce: "synthetic-nonce")
        XCTAssertEqual(app.canonical, "a=1&z=2"); XCTAssertEqual(app.digest, "fb1fe0a14735936ab0fc828c2973b91f")
        let h5 = LegacyCloudSignature.sign(body: "{}", timestamp: 1700000000000, nonce: "synthetic-nonce", h5: true)
        XCTAssertEqual(h5.digest, "dcf3ebfec8680225564bd402262ba05c")
        XCTAssertNotEqual(h5.digest, LegacyCloudSignature.sign(timestamp: 1700000000000, nonce: "synthetic-nonce", h5: true).digest)
    }
    func testCloudRequestScopesHostsAndSignsLiteralBody() throws {
        let request = try NativeCloud.request(path: "/cfmotoservermine/H5/signin", token: "synthetic-token", timestamp: 1700000000000, nonce: "synthetic-nonce", method: "POST", body: "{}", h5: true)
        XCTAssertEqual(request.url?.host, "h5.zeehoev.com"); XCTAssertEqual(request.httpBody, Data("{}".utf8)); XCTAssertEqual(request.value(forHTTPHeaderField: "cfmoto-x-sign"), "dcf3ebfec8680225564bd402262ba05c")
        XCTAssertThrowsError(try NativeCloud.request(path: "https://evil.test/", token: "synthetic-token"))
        XCTAssertThrowsError(try NativeCloud.request(path: "/v1.0/app/test", token: "bad\r\nheader"))
        XCTAssertThrowsError(try NativeCloud.request(path: "/cfmotoservermine/H5/unknown", token: "synthetic-token", h5: true))
    }
    func testNumericBooleansAndUnknownReadingsRemainUnknown() {
        XCTAssertNil(NativeCloud.number(true, range: 0...100)); XCTAssertEqual(NativeCloud.number(NSNumber(value: 0), range: 0...100), 0); XCTAssertEqual(NativeCloud.number("1", range: 0...100), 1)
        let snapshot = NativeCloud.parse(home: ["bmssoc":65, "hmiRidableMile":42], battery: [:], tires: [:], inbox: [:], vin: "SYNTHETIC", partial: false)
        XCTAssertEqual(snapshot.sample.soc, 65); XCTAssertNil(snapshot.sample.voltage); XCTAssertNil(snapshot.sample.charging); XCTAssertNil(snapshot.sample.online)
        XCTAssertTrue(snapshot.sample.dictionary()["voltage"] is NSNull)
    }
    private func sample(_ at: Double, charging: Bool?, full: Bool? = nil, soc: Double? = nil) -> NativeHistorySample { NativeHistorySample(at: at, soc: soc, charging: charging, chargeFull: full) }
    func testMissingChargeDataCannotBecomeFull() {
        let sessions = NativeHistory.chargeSessions([sample(1000, charging: true, soc: 40), sample(2000, charging: true, soc: 80), sample(30_000_000, charging: false)])
        XCTAssertEqual(sessions.count, 1); XCTAssertFalse(sessions[0].completed); XCTAssertFalse(sessions[0].full); XCTAssertEqual(sessions[0].endSoc, 80)
        let full = NativeHistory.chargeSessions([sample(1000, charging: true), sample(2000, charging: false, full: true)])
        XCTAssertEqual(full.count, 1); XCTAssertTrue(full[0].full)
    }
    func testPNGAndStoredZIPRejectCRCAndHiddenTail() throws {
        XCTAssertNoThrow(try WallpaperArchive.png(png))
        let zip = try MeterWire.wallpaperArchive(first: png, second: png); XCTAssertNoThrow(try WallpaperArchive.validate(zip))
        var changed = zip; changed[40] ^= 1; XCTAssertThrowsError(try WallpaperArchive.validate(changed))
        XCTAssertThrowsError(try WallpaperArchive.validate(zip + Data([0])))
        var invalid = png; invalid[20] ^= 1; XCTAssertThrowsError(try WallpaperArchive.png(invalid))
    }
    func testDeflatedZIPFromPythonIndependentFixture() throws {
        let zip = Data(base64Encoded: "UEsDBBQAAAAIAPKOZ105YQprPwAAAEYAAAAFAAAAMS5wbmfrDPBz5+WS4mJgYOD19HAJAtKMIMzBBiTlRY90giVcHEMq5iT/OH/ggzwDKwPj/86ZtrJACQZPVz+XdU4JTQBQSwMEFAAAAAgA8o5nXTlhCms/AAAARgAAAAUAAAAyLnBuZ+sM8HPn5ZLiYmBg4PX0cAkC0owgzMEGJOVFj3SCJVwcQyrmJP84f+CDPAMrA+P/zpm2skAJBk9XP5d1TglNAFBLAQIUABQAAAAIAPKOZ105YQprPwAAAEYAAAAFAAAAAAAAAAAAAACAAQAAAAAxLnBuZ1BLAQIUABQAAAAIAPKOZ105YQprPwAAAEYAAAAFAAAAAAAAAAAAAACAAWIAAAAyLnBuZ1BLBQYAAAAAAgACAGYAAADEAAAAAAA=")!
        XCTAssertNoThrow(try WallpaperArchive.validate(zip))
    }
    func testAssetWhitelistRejectsCredentialsAndLookalikes() {
        XCTAssertTrue(NativeAsset.permitted(URL(string: "https://oss-cfmoto-private.zeehoev.com/a.zip?signature=synthetic")!))
        for value in ["http://oss-cfmoto-private.zeehoev.com/a.zip", "https://oss-cfmoto-private.zeehoev.com.evil.test/a.zip", "https://user@oss-cfmoto-private.zeehoev.com/a.zip", "https://zeeho-user.oss-cn-hangzhou.aliyuncs.com:444/a.zip", "https://zeeho-user.oss-cn-hangzhou.aliyuncs.com/a.zip#fragment"] { XCTAssertFalse(NativeAsset.permitted(URL(string: value)!)) }
    }
    func testGeminiHeaderUsesBigEndianAndLimitsPayload() throws {
        XCTAssertEqual(try GeminiOTA.frame(0x10000005, Data([1,2])), Data([0,0,0x10,0,0,5,0,0,0,2,1,2]))
        XCTAssertThrowsError(try GeminiOTA.frame(0x10000005, Data(repeating: 0, count: 65537)))
    }
    func testAccountEpochAndVehicleIsolation() throws {
        let vehicle: [String:Any] = ["id":"vehicle-local-1", "vin":"SYNTHETIC_VEHICLE", "epoch":1, "label":"合成车辆", "enabled":true]
        let first = try NativeVehicle(vehicle); var next = vehicle; next["vin"] = "SYNTHETIC_OTHER"
        XCTAssertNotEqual(first.scope(accountId: "a"), try NativeVehicle(next).scope(accountId: "a")); XCTAssertNotEqual(first.scope(accountId: "a"), first.scope(accountId: "b"))
        next["epoch"] = true; XCTAssertThrowsError(try NativeVehicle(next)); next["epoch"] = -1; XCTAssertThrowsError(try NativeVehicle(next))
    }
    func testTaskDefaultsDoNotAuthorizePostOrLegacyLike() throws {
        let initial = NativeTaskConfiguration(); XCTAssertFalse(initial.enabled); XCTAssertFalse(initial.legacyLikeConfirmed); XCTAssertTrue(initial.actions.values.allSatisfy { !$0 })
        var raw = initial.dictionary(); raw["actions"] = ["signin":true, "streakPrize":false, "like":false, "share":false, "post":true, "cleanup":true]
        XCTAssertThrowsError(try NativeTaskConfiguration(raw)); raw["postContent"] = "合成测试文字"; XCTAssertNoThrow(try NativeTaskConfiguration(raw))
        raw["requestIntervalMs"] = true; XCTAssertThrowsError(try NativeTaskConfiguration(raw))
    }
    func testExactCreatedPostProofNeverDeletesLatestByGuess() {
        let old = NativeTaskEvidence.Article(id: "old", author: "synthetic-user", content: "same", at: 1000), new = NativeTaskEvidence.Article(id: "new", author: "synthetic-user", content: "same", at: 10000)
        XCTAssertEqual(NativeTaskEvidence.created(before: [old], after: [old,new], uid: "synthetic-user", content: "same", started: 9500, ended: 10500).0, "new")
        let another = NativeTaskEvidence.Article(id: "new2", author: "synthetic-user", content: "same", at: 10001)
        XCTAssertFalse(NativeTaskEvidence.created(before: [old], after: [old,new,another], uid: "synthetic-user", content: "same", started: 9500, ended: 10500).1)
        let unknown = NativeTaskEvidence.Article(id: "unknown", author: "", content: nil, at: nil)
        XCTAssertFalse(NativeTaskEvidence.created(before: [old], after: [old,unknown], uid: "synthetic-user", content: "same", started: 9500, ended: 10500).1)
    }
}
