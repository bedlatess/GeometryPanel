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
            if WidgetSnapshot.sharedDefaults?.bool(forKey: "widget.controls") == true, let id = WidgetSnapshot.sharedDefaults?.string(forKey: "widget.vehicle") {
                HStack {
                    Link("刷新", destination: URL(string: "geometrypanel://action?action=refresh&vehicleId=" + id)!)
                    Link("寻车", destination: URL(string: "geometrypanel://action?action=horn&vehicleId=" + id)!)
                    Link("座桶", destination: URL(string: "geometrypanel://action?action=seat&vehicleId=" + id)!)
                }.font(.caption2)
                Text("控制需打开面板确认").font(.caption2).foregroundColor(.secondary)
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(12).widgetURL(URL(string: "geometrypanel://action?action=refresh"))
    }
}
@main struct GeometryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GeometryVehicle", provider: VehicleProvider()) { entry in VehicleWidgetView(entry: entry) }
            .configurationDisplayName("几何面板车况").description("显示最近车况；快捷操作打开面板确认，尺寸由系统决定。").supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
