package app.geometrypanel.mobile;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;
import org.json.JSONObject;

public final class PanelWidget extends AppWidgetProvider {
    static void update(Context context, JSONObject input) throws Exception {
        String label = input.optString("vehicleLabel", "我的车辆");
        if (label.length() > 40 || label.matches("(?s).*\\p{Cntrl}.*")) throw new IllegalArgumentException("invalid_label");
        long time = input.optLong("receivedAt", 0);
        if (time <= 0 || time > System.currentTimeMillis() + 30000) throw new IllegalArgumentException("invalid_time");
        JSONObject snapshot = NativeJson.obj("vehicleLabel", label, "receivedAt", time);
        for (String field : new String[] { "soc", "range", "voltage" }) {
            Object value = input.opt(field);
            if (value == null || value == JSONObject.NULL) { snapshot.put(field, JSONObject.NULL); continue; }
            if (!(value instanceof Number)) throw new IllegalArgumentException("invalid_reading");
            double number = ((Number) value).doubleValue();
            if (!Double.isFinite(number) || number < 0 || number > (field.equals("soc") ? 100 : field.equals("voltage") ? 200 : 2000)) throw new IllegalArgumentException("invalid_reading");
            snapshot.put(field, number);
        }
        context.getSharedPreferences("widget-snapshot", Context.MODE_PRIVATE).edit().putString("snapshot", snapshot.toString()).apply();
        renderAll(context); NativeNotifications.sample(context, snapshot, time);
    }
    static void clear(Context context) {
        context.getSharedPreferences("widget-snapshot", Context.MODE_PRIVATE).edit().clear().apply(); renderAll(context);
    }
    static void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, PanelWidget.class));
        for (int id : ids) render(context, manager, id);
    }
    private static void render(Context context, AppWidgetManager manager, int id) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.panel_widget);
        JSONObject snapshot = new JSONObject();
        try { snapshot = new JSONObject(context.getSharedPreferences("widget-snapshot", Context.MODE_PRIVATE).getString("snapshot", "{}")); } catch (Exception ignored) { }
        long time = snapshot.optLong("receivedAt", 0);
        boolean old = time <= 0 || System.currentTimeMillis() - time > 1800000;
        view.setTextViewText(R.id.widget_title, snapshot.optString("vehicleLabel", "几何面板"));
        view.setTextViewText(R.id.widget_soc, snapshot.opt("soc") instanceof Number ? Math.round(snapshot.optDouble("soc")) + "%" : "—");
        String details = (snapshot.opt("range") instanceof Number ? "续航 " + Math.round(snapshot.optDouble("range")) + " km" : "续航 —")
                + "  ·  " + (snapshot.opt("voltage") instanceof Number ? String.format(java.util.Locale.ROOT, "%.1f V", snapshot.optDouble("voltage")) : "电压 —");
        view.setTextViewText(R.id.widget_details, details);
        view.setTextViewText(R.id.widget_time, time <= 0 ? "打开面板读取车况" : (old ? "历史读数 · " : "上次读取 · ") + android.text.format.DateFormat.format("MM-dd HH:mm", time));
        view.setOnClickPendingIntent(R.id.widget_root, NativeNotifications.open(context));
        manager.updateAppWidget(id, view);
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { for (int id : ids) render(context, manager, id); }
    @Override public void onReceive(Context context, Intent intent) { super.onReceive(context, intent); }
}
