import SwiftUI
import WidgetKit

struct CodeInstaWidget: Widget {
    let kind = "CodeInstaWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: Provider()) { entry in
            CodeInstaWidgetView(entry: entry)
                .containerBackground(.fill.tertiary, for: .widget)
        }
        .configurationDisplayName("CodeInsta")
        .description("The newest reel and your streak.")
        .supportedFamilies([.systemSmall, .systemMedium, .accessoryRectangular, .accessoryInline])
    }
}

@main
struct CodeInstaWidgetBundle: WidgetBundle {
    var body: some Widget {
        CodeInstaWidget()
    }
}
