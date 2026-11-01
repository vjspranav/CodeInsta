import Foundation

/// Mirrors packages/shared/src/widget-snapshot.ts (WidgetSnapshot, v 1).
struct SnapshotNewest: Codable, Equatable {
    let id: String
    let title: String
    let creator: String
    let category: String
    let deepLink: String
}

struct SnapshotHeadline: Codable, Equatable {
    let id: String
    let title: String
    let deepLink: String
}

struct Snapshot: Codable, Equatable {
    let v: Int
    let updatedAt: String
    let streak: Int
    let newest: SnapshotNewest?
    let headline: SnapshotHeadline?
}

enum SnapshotReader {
    /// App Group shared with the app (the widget-bridge module writes the same suite and key).
    static let suiteName = "group.dev.vjspranav.codeinsta"
    static let key = "snapshot"

    /// Returns nil when the App Group is unavailable (free Apple IDs may lack it), the key is
    /// missing, or the JSON is not a v1 snapshot. Never crashes.
    static func read() -> Snapshot? {
        guard let defaults = UserDefaults(suiteName: suiteName),
              let raw = defaults.string(forKey: key) else { return nil }
        return parse(raw)
    }

    static func parse(_ raw: String) -> Snapshot? {
        guard let data = raw.data(using: .utf8),
              let snapshot = try? JSONDecoder().decode(Snapshot.self, from: data),
              snapshot.v == 1 else { return nil }
        return snapshot
    }
}
