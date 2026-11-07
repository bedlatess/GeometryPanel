import SwiftUI
import WidgetKit

struct VehicleEntry: TimelineEntry { let date: Date; let snapshot: WidgetSnapshot? }
struct VehicleProvider: TimelineProvider {
    func placeholder(in context: Context) -> VehicleEntry { VehicleEntry(date: Date(), snapshot: nil) }
    func getSnapshot(in context: Context, completion: @escaping (VehicleEntry) -> Void) { completion(VehicleEntry(date: Date(), snapshot: WidgetSnapshot.read())) }
    func getTimeline(in context: Context, completion: @escaping (Timeline<VehicleEntry>) -> Void) {
        completion(Timeline(entries: [VehicleEntry(date: Date(), snapshot: WidgetSnapshot.read())], policy: .after(Date().addingTimeInterval(900))))
    }
}
struct VehicleWidgetView: View {
    let entry: VehicleEntry
    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(entry.snapshot?.vehicleLabel ?? "几何面板").font(.headline).lineLimit(1)
            if let snapshot = entry.snapshot {
                Text(snapshot.soc.map { String(format: "%.0f%%", $0) } ?? "—").font(.system(size: 36, weight: .semibold, design: .rounded))
                Text(snapshot.range.map { String(format: "预计 %.0f km", $0) } ?? "暂无续航读数").font(.caption)
                Text(Date(timeIntervalSince1970: snapshot.receivedAt / 1000), style: .relative).font(.caption2).foregroundColor(.secondary)
                Text("上次读取 · 打开面板刷新").font(.caption2).foregroundColor(.secondary)
            } else { Text("打开面板读取车况").font(.subheadline); Text("组件版需要有效 App Groups 签名").font(.caption2).foregroundColor(.secondary) }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(12).widgetURL(URL(string: "https://bedlatess.github.io/GeometryPanel/"))
    }
}
@main struct GeometryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GeometryVehicle", provider: VehicleProvider()) { entry in VehicleWidgetView(entry: entry) }
            .configurationDisplayName("几何面板车况").description("显示本机最近读取的电量和续航；打开面板刷新。").supportedFamilies([.systemSmall, .systemMedium])
    }
}
