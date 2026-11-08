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
            HStack { Image("BrandMark").resizable().frame(width: 28, height: 28); Text(entry.snapshot?.vehicleLabel ?? "几何面板").font(.headline).lineLimit(1) }
            if let snapshot = entry.snapshot {
                Text(snapshot.soc.map { String(format: "%.0f%%", $0) } ?? "—").font(.system(size: 44, weight: .semibold, design: .rounded))
                Text(snapshot.range.map { String(format: "预计 %.0f km", $0) } ?? "— km").font(.caption)
                Text(Date(timeIntervalSince1970: snapshot.receivedAt / 1000), style: .relative).font(.caption2).foregroundColor(Color(red: 0.604, green: 0.635, blue: 0.667))
                Text("更新于").font(.caption2).foregroundColor(Color(red: 0.604, green: 0.635, blue: 0.667))
            } else { Text("打开面板读取车况").font(.subheadline) }
            if WidgetSnapshot.sharedDefaults?.bool(forKey: "widget.controls") == true, let id = WidgetSnapshot.sharedDefaults?.string(forKey: "widget.vehicle") {
                HStack {
                    Link("刷新", destination: URL(string: "geometrypanel://action?action=refresh&vehicleId=" + id)!)
                    Link("寻车", destination: URL(string: "geometrypanel://action?action=horn&vehicleId=" + id)!)
                    Link("座桶", destination: URL(string: "geometrypanel://action?action=seat&vehicleId=" + id)!)
                }.font(.caption2)
                Text("控制需打开面板确认").font(.caption2).foregroundColor(Color(red: 0.604, green: 0.635, blue: 0.667))
            }
        }.frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading).padding(16).foregroundColor(Color(red: 0.949, green: 0.957, blue: 0.965)).background(Color(red: 0.043, green: 0.051, blue: 0.063)).clipShape(RoundedRectangle(cornerRadius: 22)).widgetURL(URL(string: "geometrypanel://action?action=refresh"))
    }
}
@main struct GeometryWidget: Widget {
    var body: some WidgetConfiguration {
        StaticConfiguration(kind: "GeometryVehicle", provider: VehicleProvider()) { entry in VehicleWidgetView(entry: entry) }
            .configurationDisplayName("几何面板车况").description("电量、续航和更新时间。").supportedFamilies([.systemSmall, .systemMedium, .systemLarge])
    }
}
