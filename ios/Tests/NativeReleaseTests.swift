import XCTest
@testable import GeometryPanel

final class NativeReleaseTests: XCTestCase {
    private func release(_ tag: String, prerelease: Bool = false, draft: Bool = false, url: String? = nil) -> [String:Any] {
        ["tag_name":tag, "prerelease":prerelease, "draft":draft, "published_at":"2026-11-07T00:00:00Z", "html_url":url ?? "https://github.com/bedlatess/GeometryPanel/releases/tag/" + tag]
    }
    func testOnlyPublishedAcceptanceReleasesStillProduceUpdateCandidate() throws {
        let candidate = try XCTUnwrap(NativeRelease.select([release("v0.4.0", prerelease:true), release("v0.5.0", prerelease:true)]))
        XCTAssertEqual(candidate.version.text, "0.5.0"); XCTAssertTrue(candidate.prerelease)
        XCTAssertEqual(candidate.url.absoluteString, "https://github.com/bedlatess/GeometryPanel/releases/tag/v0.5.0")
        XCTAssertEqual(NativeRelease.endpoint.absoluteString, "https://api.github.com/repos/bedlatess/GeometryPanel/releases?per_page=20")
    }
    func testDraftsForeignURLsAndNonVersionsCannotWinSelection() throws {
        let candidate = try XCTUnwrap(NativeRelease.select([release("v999.0.0", draft:true), release("v200.0.0", url:"https://github.com/another/repository/releases/tag/v200.0.0"), release("v300.0.0", url:"https://github.com.evil.test/bedlatess/GeometryPanel/releases/tag/v300.0.0"), release("latest"), release("v0.5.0", prerelease:true)]))
        XCTAssertEqual(candidate.version.text, "0.5.0"); XCTAssertNil(try NativeRelease.select([]))
    }
    func testSemanticPrecedenceOrdersNumericPrereleaseAndStableCorrectly() throws {
        XCTAssertGreaterThan(try XCTUnwrap(NativeReleaseVersion("v0.6.0-rc.10")), try XCTUnwrap(NativeReleaseVersion("v0.6.0-rc.2")))
        XCTAssertGreaterThan(try XCTUnwrap(NativeReleaseVersion("v0.6.0")), try XCTUnwrap(NativeReleaseVersion("v0.6.0-rc.99")))
        XCTAssertEqual(NativeReleaseVersion("v0.6.0+build.1"), NativeReleaseVersion("0.6.0+build.2"))
        XCTAssertNil(NativeReleaseVersion("v01.2.3")); XCTAssertNil(NativeReleaseVersion("v1.2.3-rc.01"))
        let candidate = try XCTUnwrap(NativeRelease.select([release("v0.5.9"), release("v0.6.0-rc.2", prerelease:true), release("v0.6.0-rc.10", prerelease:true)]))
        XCTAssertEqual(candidate.version.text, "0.6.0-rc.10")
    }
}
