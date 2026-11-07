package app.geometrypanel.mobile;

import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.view.View;
import android.widget.RemoteViews;
import org.json.JSONObject;

public class PanelWidget extends AppWidgetProvider {
    static Class<?> provider(String style) { switch (style) { case "1x1": return Compact.class; case "2x2": return PanelWidget.class; case "4x2": return Wide.class; case "4x4": return Large.class; default: throw new IllegalArgumentException("invalid_style"); } }
    static String style(Class<?> type) { return type == Compact.class ? "1x1" : type == Wide.class ? "4x2" : type == Large.class ? "4x4" : "2x2"; }
    public static final class Compact extends PanelWidget { }
    public static final class Wide extends PanelWidget { }
    public static final class Large extends PanelWidget { }
    static JSONObject configure(Context context, JSONObject params) throws Exception {
        String vehicle = BackgroundConfig.id(params, "vehicleId"), style = params.getString("style"); Class<?> provider = provider(style);
        if (BackgroundMonitor.get(context).binding(vehicle) == null) throw new IllegalArgumentException("vehicle_not_configured");
        AppWidgetManager manager = AppWidgetManager.getInstance(context); int[] ids = manager.getAppWidgetIds(new ComponentName(context, provider)); int configured = 0;
        for (int id : ids) if (!params.has("widgetId") || params.optInt("widgetId", -1) == id) {
            context.getSharedPreferences("widget-bindings", Context.MODE_PRIVATE).edit().putString(String.valueOf(id), NativeJson.obj("vehicleId", vehicle, "style", style, "controls", params.optBoolean("controls", false)).toString()).apply(); render(context, manager, id); configured++;
        }
        context.getSharedPreferences("widget-bindings", Context.MODE_PRIVATE).edit().putString("default-" + style, NativeJson.obj("vehicleId", vehicle, "style", style, "controls", params.optBoolean("controls", false)).toString()).apply();
        return NativeJson.obj("configured", true, "count", configured);
    }
    static JSONObject pin(Context context, String style) {
        Class<?> type = provider(style); AppWidgetManager manager = AppWidgetManager.getInstance(context);
        boolean accepted = manager.isRequestPinAppWidgetSupported() && manager.requestPinAppWidget(new ComponentName(context, type), null, null);
        return NativeJson.obj("requested", accepted, "hint", accepted ? "请完成系统桌面确认" : "长按系统桌面，选择几何面板对应尺寸组件");
    }
    static void update(Context context, JSONObject input) throws Exception {
        String label = input.optString("vehicleLabel", "我的车辆");
        if (label.length() > 40 || label.matches("(?s).*\\p{Cntrl}.*")) throw new IllegalArgumentException("invalid_label");
        long time = input.optLong("receivedAt", 0);
        if (time <= 0 || time > System.currentTimeMillis() + 30000) throw new IllegalArgumentException("invalid_time");
        JSONObject snapshot = NativeJson.obj("vehicleLabel", label, "receivedAt", time);
        String vehicleId = input.has("vehicleId") ? BackgroundConfig.id(input,"vehicleId") : "";
        if (!vehicleId.isEmpty()) snapshot.put("vehicleId",vehicleId);
        for (String field : new String[] { "soc", "range", "voltage" }) {
            Object value = input.opt(field);
            if (value == null || value == JSONObject.NULL) { snapshot.put(field, JSONObject.NULL); continue; }
            if (!(value instanceof Number)) throw new IllegalArgumentException("invalid_reading");
            double number = ((Number) value).doubleValue();
            if (!Double.isFinite(number) || number < 0 || number > (field.equals("soc") ? 100 : field.equals("voltage") ? 200 : 2000)) throw new IllegalArgumentException("invalid_reading");
            snapshot.put(field, number);
        }
        context.getSharedPreferences("widget-snapshot", Context.MODE_PRIVATE).edit().putString(vehicleId.isEmpty() ? "snapshot" : "vehicle-" + vehicleId, snapshot.toString()).apply();
        renderAll(context); NativeNotifications.sample(context, snapshot, time);
    }
    static void clear(Context context) {
        context.getSharedPreferences("widget-snapshot", Context.MODE_PRIVATE).edit().clear().apply(); renderAll(context);
    }
    static void renderAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        for (Class<?> type : new Class<?>[] {PanelWidget.class, Compact.class, Wide.class, Large.class})
            for (int id : manager.getAppWidgetIds(new ComponentName(context, type))) render(context, manager, id);
    }
    private static void render(Context context, AppWidgetManager manager, int id) {
        RemoteViews view = new RemoteViews(context.getPackageName(), R.layout.panel_widget);
        JSONObject snapshot = new JSONObject();
        try { snapshot = new JSONObject(context.getSharedPreferences("widget-snapshot", Context.MODE_PRIVATE).getString("snapshot", "{}")); } catch (Exception ignored) { }
        String style = "2x2", vehicleId = ""; boolean controls = false, actionable = false;
        try {
            android.appwidget.AppWidgetProviderInfo info = manager.getAppWidgetInfo(id);
            if (info != null) { String name = info.provider.getClassName(); style = name.endsWith("$Compact") ? "1x1" : name.endsWith("$Wide") ? "4x2" : name.endsWith("$Large") ? "4x4" : "2x2"; }
            android.content.SharedPreferences bindings = context.getSharedPreferences("widget-bindings", Context.MODE_PRIVATE);
            JSONObject binding = new JSONObject(bindings.getString(String.valueOf(id), bindings.getString("default-" + style, "{}")));
            vehicleId = binding.optString("vehicleId", "");
            if (vehicleId.isEmpty()) { JSONObject selected = BackgroundMonitor.get(context).selected(); if (selected != null) vehicleId = selected.getJSONObject("vehicle").getString("id"); }
            JSONObject scope = BackgroundMonitor.get(context).binding(vehicleId);
            if (scope != null) {
                snapshot = BackgroundMonitor.get(context).snapshot(vehicleId);
                JSONObject web = new JSONObject(context.getSharedPreferences("widget-snapshot",Context.MODE_PRIVATE).getString("vehicle-" + vehicleId,"{}"));
                snapshot = chooseSnapshot(vehicleId,snapshot,web);
                snapshot.put("vehicleLabel", scope.getJSONObject("vehicle").optString("label")); controls = binding.optBoolean("controls", false);
                actionable = scope.getJSONObject("account").optBoolean("enabled") && scope.getJSONObject("vehicle").optBoolean("enabled");
            }
            else if (!vehicleId.isEmpty()) snapshot = new JSONObject();
        } catch (Exception ignored) { snapshot = new JSONObject(); }
        long time = snapshot.optLong("receivedAt", 0);
        boolean old = time <= 0 || System.currentTimeMillis() - time > 1800000;
        view.setTextViewText(R.id.widget_title, snapshot.optString("vehicleLabel", "几何面板"));
        view.setTextViewText(R.id.widget_soc, snapshot.opt("soc") instanceof Number ? Math.round(snapshot.optDouble("soc")) + "%" : "—");
        String details = (snapshot.opt("range") instanceof Number ? "续航 " + Math.round(snapshot.optDouble("range")) + " km" : "续航 —")
                + "  ·  " + (snapshot.opt("voltage") instanceof Number ? String.format(java.util.Locale.ROOT, "%.1f V", snapshot.optDouble("voltage")) : "电压 —");
        view.setTextViewText(R.id.widget_details, details);
        view.setTextViewText(R.id.widget_time, time <= 0 ? "打开面板读取车况" : (old ? "历史读数 · " : "上次读取 · ") + android.text.format.DateFormat.format("MM-dd HH:mm", time));
        view.setOnClickPendingIntent(R.id.widget_root, NativeNotifications.open(context));
        view.setViewVisibility(R.id.widget_details, style.equals("1x1") ? View.GONE : View.VISIBLE);
        view.setViewVisibility(R.id.widget_actions, style.equals("1x1") ? View.GONE : View.VISIBLE);
        int[] buttons = {R.id.widget_refresh, R.id.widget_unlock, R.id.widget_lock, R.id.widget_horn, R.id.widget_seat};
        String[] actions = {"refresh", "unlock", "lock", "horn", "seat"};
        for (int i = 0; i < buttons.length; i++) {
            boolean enabled = actionable && !vehicleId.isEmpty() && (i == 0 || controls);
            view.setViewVisibility(buttons[i], enabled ? View.VISIBLE : View.GONE);
            if (enabled) try { view.setOnClickPendingIntent(buttons[i], NativeActions.pending(context, vehicleId, actions[i])); } catch (Exception ignored) { view.setViewVisibility(buttons[i], View.GONE); }
        }
        manager.updateAppWidget(id, view);
    }
    static JSONObject chooseSnapshot(String vehicleId, JSONObject nativeSample, JSONObject webSample) throws Exception {
        return new JSONObject((vehicleId.equals(webSample.optString("vehicleId")) && webSample.optLong("receivedAt") > nativeSample.optLong("receivedAt") ? webSample : nativeSample).toString());
    }
    @Override public void onUpdate(Context context, AppWidgetManager manager, int[] ids) { for (int id : ids) render(context, manager, id); }
    @Override public void onReceive(Context context, Intent intent) { super.onReceive(context, intent); }
    @Override public void onDeleted(Context context, int[] ids) { android.content.SharedPreferences.Editor editor = context.getSharedPreferences("widget-bindings", Context.MODE_PRIVATE).edit(); for (int id : ids) editor.remove(String.valueOf(id)); editor.apply(); }
}
