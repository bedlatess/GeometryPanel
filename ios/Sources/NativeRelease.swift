import Foundation

struct NativeReleaseVersion: Comparable {
    let text: String
    private let core: [String], prerelease: [String]
    init?(_ tag: String) {
        guard tag.utf8.count <= 200, tag.range(of: "^v?(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)\\.(?:0|[1-9][0-9]*)(?:-[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*)?(?:\\+[A-Za-z0-9-]+(?:\\.[A-Za-z0-9-]+)*)?$", options: .regularExpression) != nil else { return nil }
        text = tag.hasPrefix("v") ? String(tag.dropFirst()) : tag
        let precedence = text.split(separator: "+", maxSplits: 1)[0], parts = precedence.split(separator: "-", maxSplits: 1)
        core = parts[0].split(separator: ".").map(String.init)
        prerelease = parts.count == 1 ? [] : parts[1].split(separator: ".").map(String.init)
        guard prerelease.allSatisfy({ !Self.numeric($0) || $0 == "0" || !$0.hasPrefix("0") }) else { return nil }
    }
    private static func numeric(_ value: String) -> Bool { value.utf8.allSatisfy { (48...57).contains($0) } }
    private static func numberLess(_ left: String, _ right: String) -> Bool { left.count == right.count ? left < right : left.count < right.count }
    static func == (left: Self, right: Self) -> Bool { left.core == right.core && left.prerelease == right.prerelease }
    static func < (left: Self, right: Self) -> Bool {
        for (a, b) in zip(left.core, right.core) where a != b { return numberLess(a, b) }
        if left.prerelease.isEmpty || right.prerelease.isEmpty { return !left.prerelease.isEmpty && right.prerelease.isEmpty }
        for (a, b) in zip(left.prerelease, right.prerelease) where a != b {
            let aNumeric = numeric(a), bNumeric = numeric(b)
            if aNumeric && bNumeric { return numberLess(a, b) }; if aNumeric != bNumeric { return aNumeric }; return a < b
        }
        return left.prerelease.count < right.prerelease.count
    }
}

enum NativeRelease {
    static let endpoint = URL(string: "https://api.github.com/repos/bedlatess/GeometryPanel/releases?per_page=20")!
    struct Candidate { let version: NativeReleaseVersion, url: URL; let prerelease: Bool }
    static func select(_ raw: Any) throws -> Candidate? {
        guard let rows = raw as? [[String:Any]], rows.count <= 20 else { throw PanelError.invalid("发布列表格式无效。") }
        var selected: Candidate?
        for row in rows {
            guard row["draft"] as? Bool == false, let published = row["published_at"] as? String, ISO8601DateFormatter().date(from: published) != nil,
                  let tag = row["tag_name"] as? String, let version = NativeReleaseVersion(tag), let rawURL = row["html_url"] as? String, let url = URL(string: rawURL),
                  url.scheme == "https", url.host == "github.com", url.user == nil, url.password == nil, url.port == nil, url.fragment == nil, url.query == nil,
                  url.path == "/bedlatess/GeometryPanel/releases/tag/" + tag else { continue }
            if selected == nil || selected!.version < version { selected = Candidate(version: version, url: url, prerelease: row["prerelease"] as? Bool ?? false) }
        }
        return selected
    }
}
