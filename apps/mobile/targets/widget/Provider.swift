import WidgetKit

struct SnapshotEntry: TimelineEntry {
    let date: Date
    /// nil means no readable snapshot: the views show their empty state.
    let snapshot: Snapshot?
}

struct Provider: TimelineProvider {
    private static let refreshInterval: TimeInterval = 30 * 60

    func placeholder(in context: Context) -> SnapshotEntry {
        SnapshotEntry(date: Date(), snapshot: nil)
    }

    func getSnapshot(in context: Context, completion: @escaping (SnapshotEntry) -> Void) {
        completion(SnapshotEntry(date: Date(), snapshot: SnapshotReader.read()))
    }

    func getTimeline(in context: Context, completion: @escaping (Timeline<SnapshotEntry>) -> Void) {
        let now = Date()
        let entry = SnapshotEntry(date: now, snapshot: SnapshotReader.read())
        let next = now.addingTimeInterval(Provider.refreshInterval)
        completion(Timeline(entries: [entry], policy: .after(next)))
    }
}
