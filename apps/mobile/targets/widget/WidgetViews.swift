import SwiftUI
import WidgetKit

// Placeholder layouts (Task 5.1/5.5). The final look comes in Task 5.6.

enum WidgetCopy {
    static let signedOut = "Open CodeInsta to get started"
    static let empty = "Nothing new yet"
}

private func streakText(_ streak: Int) -> String {
    "\(streak) day streak"
}

struct EmptyStateView: View {
    let message: String

    var body: some View {
        Text(message)
            .font(.footnote)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct SmallView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(newest.title).font(.headline).lineLimit(3)
            Text(newest.creator).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            Spacer(minLength: 0)
            Text(streakText(snapshot.streak)).font(.caption2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct MediumView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(newest.title).font(.headline).lineLimit(2)
            Text("\(newest.creator) / \(newest.category)")
                .font(.caption).foregroundStyle(.secondary).lineLimit(1)
            if let headline = snapshot.headline {
                Text(headline.title).font(.caption).lineLimit(1)
            }
            Spacer(minLength: 0)
            Text(streakText(snapshot.streak)).font(.caption2)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

struct RectangularView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(newest.title).font(.headline).lineLimit(2)
            Text(streakText(snapshot.streak)).font(.caption2)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
    }
}

struct InlineView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        Text("\(streakText(snapshot.streak)): \(newest.title)")
    }
}

struct CodeInstaWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    var body: some View {
        content.widgetURL(deepLink)
    }

    private var deepLink: URL? {
        guard let link = entry.snapshot?.newest?.deepLink else { return nil }
        return URL(string: link)
    }

    @ViewBuilder
    private var content: some View {
        if let snapshot = entry.snapshot, let newest = snapshot.newest {
            switch family {
            case .systemSmall:
                SmallView(snapshot: snapshot, newest: newest)
            case .systemMedium:
                MediumView(snapshot: snapshot, newest: newest)
            case .accessoryRectangular:
                RectangularView(snapshot: snapshot, newest: newest)
            case .accessoryInline:
                InlineView(snapshot: snapshot, newest: newest)
            default:
                SmallView(snapshot: snapshot, newest: newest)
            }
        } else if entry.snapshot != nil {
            EmptyStateView(message: WidgetCopy.empty)
        } else {
            EmptyStateView(message: WidgetCopy.signedOut)
        }
    }
}
