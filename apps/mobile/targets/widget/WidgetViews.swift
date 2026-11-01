import SwiftUI
import UIKit
import WidgetKit

// Native mirrors of packages/shared/design-tokens.json, exposed by theme/tokens.ts
// as paper = bg, ink = text, inkMuted = muted, and accent. Keep both schemes in sync.
private enum WidgetStyle {
    static let paper = adaptive(light: 0xffffff, dark: 0x000000)
    static let ink = adaptive(light: 0x0a0a0a, dark: 0xf5f5f5)
    static let muted = adaptive(light: 0x6b6b6b, dark: 0xa8a8a8)
    static let accent = adaptive(light: 0x0a66c2, dark: 0x3797f0)
    static let line = adaptive(light: 0xe0e0e0, dark: 0x262626)
    // Shared space.1 / space.2 / space.3 and type.heading / reelTitle / caption.
    static let tight: CGFloat = 4
    static let gap: CGFloat = 8
    static let section: CGFloat = 12
    static let heading = Font.system(size: 20, weight: .semibold)
    static let reelTitle = Font.system(size: 15, weight: .semibold)
    static let caption = Font.system(size: 12)

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(uiColor: UIColor { traits in
            let hex = traits.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 255) / 255,
                green: CGFloat((hex >> 8) & 255) / 255,
                blue: CGFloat(hex & 255) / 255,
                alpha: 1
            )
        })
    }
}

enum WidgetCopy {
    static let signedOut = "Open CodeInsta to get started"
    static let empty = "Nothing new yet"
}

private func streakText(_ streak: Int) -> String {
    "\(streak) day streak"
}

private struct WidgetMasthead: View {
    var body: some View {
        Text("CodeInsta")
            .font(WidgetStyle.caption.weight(.semibold))
            .foregroundStyle(WidgetStyle.accent)
            .lineLimit(1)
            .widgetAccentable()
    }
}

private struct StreakLabel: View {
    let streak: Int

    var body: some View {
        Text(streakText(streak))
            .font(WidgetStyle.caption.weight(.medium))
            .monospacedDigit()
            .lineLimit(1)
    }
}

struct EmptyStateView: View {
    @Environment(\.widgetFamily) private var family
    let message: String

    var body: some View {
        if family == .accessoryInline {
            Text(message).lineLimit(1).truncationMode(.tail)
        } else if family == .accessoryRectangular {
            Text(message)
                .font(.headline)
                .lineLimit(2)
                .frame(maxWidth: .infinity, alignment: .leading)
        } else {
            VStack(alignment: .leading, spacing: WidgetStyle.section) {
                WidgetMasthead()
                Spacer(minLength: 0)
                Text(message)
                    .font(WidgetStyle.reelTitle)
                    .foregroundStyle(WidgetStyle.ink)
                    .lineLimit(3)
                Spacer(minLength: 0)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        }
    }
}

struct SmallView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        VStack(alignment: .leading, spacing: WidgetStyle.gap) {
            WidgetMasthead()
            Text(newest.title)
                .font(WidgetStyle.heading)
                .foregroundStyle(WidgetStyle.ink)
                .lineLimit(3)
                .truncationMode(.tail)
                .layoutPriority(1)
            Spacer(minLength: 0)
            Text(newest.creator)
                .font(WidgetStyle.caption)
                .foregroundStyle(WidgetStyle.muted)
                .lineLimit(1)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct MediumView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        VStack(alignment: .leading, spacing: WidgetStyle.gap) {
            HStack(spacing: WidgetStyle.gap) {
                WidgetMasthead()
                Spacer(minLength: WidgetStyle.gap)
                StreakLabel(streak: snapshot.streak)
                    .foregroundStyle(WidgetStyle.muted)
            }
            VStack(alignment: .leading, spacing: WidgetStyle.tight) {
                Text(newest.title)
                    .font(WidgetStyle.heading)
                    .foregroundStyle(WidgetStyle.ink)
                    .lineLimit(2)
                    .truncationMode(.tail)
                HStack(spacing: WidgetStyle.tight) {
                    Text(newest.creator).layoutPriority(1)
                    Text("/").accessibilityHidden(true)
                    Text(newest.category)
                }
                .font(WidgetStyle.caption)
                .foregroundStyle(WidgetStyle.muted)
                .lineLimit(1)
            }
            .layoutPriority(1)
            Spacer(minLength: 0)
            if let headline = snapshot.headline {
                Rectangle().fill(WidgetStyle.line).frame(height: 1)
                    .accessibilityHidden(true)
                if let url = URL(string: headline.deepLink) {
                    Link(destination: url) { headlineRow(headline.title) }
                } else {
                    headlineRow(headline.title)
                }
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }

    private func headlineRow(_ title: String) -> some View {
        HStack(spacing: WidgetStyle.gap) {
            Image(systemName: "newspaper")
                .foregroundStyle(WidgetStyle.accent)
                .widgetAccentable()
                .accessibilityHidden(true)
            Text(title)
                .foregroundStyle(WidgetStyle.ink)
                .lineLimit(1)
                .truncationMode(.tail)
        }
        .font(WidgetStyle.caption)
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct RectangularView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        // Lock Screen text uses the system's monochrome/vibrant foreground.
        VStack(alignment: .leading, spacing: WidgetStyle.tight) {
            Text(newest.title)
                .font(.headline)
                .lineLimit(2)
                .truncationMode(.tail)
                .layoutPriority(1)
            StreakLabel(streak: snapshot.streak)
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityElement(children: .combine)
    }
}

struct InlineView: View {
    let snapshot: Snapshot
    let newest: SnapshotNewest

    var body: some View {
        Text("\(streakText(snapshot.streak)): \(newest.title)")
            .lineLimit(1)
            .truncationMode(.tail)
    }
}

struct CodeInstaWidgetView: View {
    @Environment(\.widgetFamily) private var family
    let entry: SnapshotEntry

    private var isAccessory: Bool {
        family == .accessoryRectangular || family == .accessoryInline
    }

    var body: some View {
        content
            .foregroundStyle(.primary)
            .containerBackground(for: .widget) {
                if !isAccessory { WidgetStyle.paper }
            }
            .widgetURL(deepLink)
    }

    private var deepLink: URL? {
        URL(string: entry.snapshot?.newest?.deepLink ?? "codeinsta://")
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
        } else {
            EmptyStateView(message: entry.snapshot == nil ? WidgetCopy.signedOut : WidgetCopy.empty)
        }
    }
}

#if DEBUG
private enum WidgetPreviewData {
    static let date = Date(timeIntervalSince1970: 1_793_577_600)
    static let populated = Snapshot(
        v: 1, updatedAt: "2026-11-02T00:00:00Z", streak: 12,
        newest: SnapshotNewest(
            id: "preview-reel", title: "Why virtual memory needs a page table",
            creator: "Claude", category: "Operating Systems",
            deepLink: "codeinsta://reel/preview-reel"
        ),
        headline: SnapshotHeadline(
            id: "preview-headline", title: "A new way to run models on your phone",
            deepLink: "codeinsta://reel/preview-headline"
        )
    )
    static let empty = Snapshot(
        v: 1, updatedAt: "2026-11-02T00:00:00Z", streak: 0, newest: nil, headline: nil
    )
}

struct CodeInstaWidgetView_Previews: PreviewProvider {
    static var previews: some View {
        Group {
            preview(.systemSmall, scheme: .light, name: "Small / Light")
            preview(.systemSmall, scheme: .dark, name: "Small / Dark")
            preview(.systemMedium, scheme: .light, name: "Medium / Light")
            preview(.systemMedium, scheme: .dark, name: "Medium / Dark")
            preview(.accessoryRectangular, scheme: .light, name: "Rectangular / Light")
            preview(.accessoryRectangular, scheme: .dark, name: "Rectangular / Dark")
            preview(.accessoryInline, scheme: .light, name: "Inline / Light")
            preview(.accessoryInline, scheme: .dark, name: "Inline / Dark")
        }
        Group {
            CodeInstaWidgetView(entry: SnapshotEntry(date: WidgetPreviewData.date, snapshot: nil))
                .containerBackground(.fill.tertiary, for: .widget)
                .previewContext(WidgetPreviewContext(family: .systemSmall))
                .previewDisplayName("No snapshot")
            CodeInstaWidgetView(entry: SnapshotEntry(date: WidgetPreviewData.date, snapshot: WidgetPreviewData.empty))
                .containerBackground(.fill.tertiary, for: .widget)
                .previewContext(WidgetPreviewContext(family: .systemMedium))
                .previewDisplayName("No reels")
        }
    }

    private static func preview(_ family: WidgetFamily, scheme: ColorScheme, name: String) -> some View {
        CodeInstaWidgetView(entry: SnapshotEntry(date: WidgetPreviewData.date, snapshot: WidgetPreviewData.populated))
            // Match the outer modifier in CodeInstaWidget, including background precedence.
            .containerBackground(.fill.tertiary, for: .widget)
            .environment(\.colorScheme, scheme)
            .previewContext(WidgetPreviewContext(family: family))
            .previewDisplayName(name)
    }
}
#endif
