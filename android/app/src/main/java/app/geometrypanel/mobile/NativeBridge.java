package app.geometrypanel.mobile;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Build;
import android.webkit.WebView;
import androidx.webkit.JavaScriptReplyProxy;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Set;
import org.json.JSONObject;

/** Contract v1. Origin + main-frame + current document scope are all checked; no generic native API. */
final class NativeBridge {
    private final MainActivity activity;
    private final NativeEngine engine;
    private final WebView view;
    private final Set<String> requests = new HashSet<>();
    private int document;
    private boolean released;
    NativeBridge(MainActivity activity, WebView view) {
        this.activity = activity; this.view = view; engine = NativeEngine.get(activity);
        if (!WebViewFeature.isFeatureSupported(WebViewFeature.WEB_MESSAGE_LISTENER)) return;
        WebViewCompat.addWebMessageListener(view, "GeometryNative", java.util.Collections.singleton("https://bedlatess.github.io"),
                (source, message, origin, mainFrame, proxy) -> {
                    if (released || !mainFrame || !"https://bedlatess.github.io".equals(origin.toString()) || !NavigationPolicy.isPanel(source.getUrl())) return;
                    if (message.getType() != androidx.webkit.WebMessageCompat.TYPE_STRING) return;
                    String raw = message.getData();
                    if (raw == null || raw.length() > 1572864) return;
                    try {
                        JSONObject request = new JSONObject(raw);
                        String id = NativeJson.string(request, "id", 100), method = NativeJson.string(request, "method", 40);
                        if (!BridgeContract.validId(id) || requests.size() >= 16 || !requests.add(id)) return;
                        JSONObject params = request.optJSONObject("params");
                        boolean large = method.equals("accounts.sync") || method.equals("background.configure") || method.equals("tasks.configure");
                        boolean image = method.equals("asset.export") && params != null && "panel".equals(params.optString("kind"));
                        if (raw.length() > (image ? 1572864 : 262144) || params != null && params.toString().length() > (image ? 1572800 : large ? 262144 : 16384)) { requests.remove(id); return; }
                        int epoch = document;
                        NativeJson.Result reply = (result, error) -> activity.runOnUiThread(() -> {
                            requests.remove(id);
                            if (released || document != epoch || !NavigationPolicy.isPanel(view.getUrl())) return;
                            JSONObject response = error == null ? NativeJson.obj("id", id, "ok", true, "result", result == null ? new JSONObject() : result)
                                    : NativeJson.obj("id", id, "ok", false, "error", NativeJson.obj("code", error.matches("[a-z_]{1,80}") ? error : "operation_failed", "message", human(error)));
                            proxy.postMessage(response.toString());
                        });
                        dispatch(method, params == null ? new JSONObject() : params, reply, epoch);
                    } catch (Exception ignored) { /* Malformed messages never execute or echo their payload. */ }
                });
    }
    void navigation() { document++; requests.clear(); activity.cancelNativePermission(); if (!ProximityService.running) engine.ble.disconnect("document_changed"); }
    void close() { released = true; navigation(); }
    private boolean current(int epoch) { return !released && document == epoch && NavigationPolicy.isPanel(view.getUrl()); }
    private void dispatch(String method, JSONObject params, NativeJson.Result reply, int epoch) {
        try {
            switch (method) {
                case "capabilities":
                    boolean ble = engine.ble.supported();
                    reply.finish(NativeJson.obj("platform", "android", "version", 1,
                            "features", NativeJson.obj("ble", ble, "proximity", ble, "notifications", true, "widget", true,
                                    "meter", activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_WIFI_DIRECT), "background", true, "history", true, "multiAccount", true, "shortcuts", true, "tasks", true,
                                    "scanner", true, "ota", true, "diagnostics", true, "updates", true, "officialLogin", true, "keepalive", true, "wallpaperZip", true),
                            "limitations", NativeJson.list("此车型的蓝牙钥匙需在车旁确认", "车辆靠近时发送提醒", "后台提醒需允许系统通知", "仪表工具需使用兼容车型", "无法连接极核 App 时可用验证码登录")), null); return;
                case "haptic":
                    int feedback;
                    switch (params.optString("type")) {
                        case "light": feedback = android.view.HapticFeedbackConstants.CLOCK_TICK; break;
                        case "medium": feedback = android.view.HapticFeedbackConstants.LONG_PRESS; break;
                        case "selection": feedback = android.view.HapticFeedbackConstants.CLOCK_TICK; break;
                        case "success": feedback = Build.VERSION.SDK_INT >= 30
                                ? android.view.HapticFeedbackConstants.CONFIRM
                                : android.view.HapticFeedbackConstants.LONG_PRESS; break;
                        case "warning": feedback = Build.VERSION.SDK_INT >= 30
                                ? android.view.HapticFeedbackConstants.REJECT
                                : android.view.HapticFeedbackConstants.LONG_PRESS; break;
                        default: reply.finish(null, "invalid_parameters"); return;
                    }
                    view.performHapticFeedback(feedback);
                    reply.finish(NativeJson.obj("performed", true), null); return;
                case "status": reply.finish(engine.status(), null); return;
                case "accounts.sync": reply.finish(BackgroundMonitor.get(activity).sync(params), null); return;
                case "accounts.remove": reply.finish(BackgroundMonitor.get(activity).remove(BackgroundConfig.id(params, "accountId")), null); return;
                case "background.configure":
                    String[] backgroundPermissions = params.optBoolean("enabled") && Build.VERSION.SDK_INT >= 33 ? new String[] { Manifest.permission.POST_NOTIFICATIONS } : new String[0];
                    activity.nativePermission(backgroundPermissions, granted -> {
                        if (!current(epoch)) return;
                        try { reply.finish(BackgroundMonitor.get(activity).configure(params, granted), null); }
                        catch (Exception error) { reply.finish(null, "background_configuration_failed"); }
                    }); return;
                case "background.status": reply.finish(BackgroundMonitor.get(activity).status(), null); return;
                case "background.run":
                    String target = params.has("vehicleId") ? BackgroundConfig.id(params, "vehicleId") : null;
                    if (target != null && BackgroundMonitor.get(activity).binding(target) == null) { reply.finish(null, "vehicle_not_configured"); return; }
                    BackgroundMonitor.get(activity).run(target, null); reply.finish(BackgroundMonitor.get(activity).status(), null); return;
                case "background.history": reply.finish(BackgroundMonitor.get(activity).history(params), null); return;
                case "history.clear": reply.finish(BackgroundMonitor.get(activity).clear(params), null); return;
                case "widget.configure": reply.finish(PanelWidget.configure(activity, params), null); return;
                case "widget.pin": reply.finish(PanelWidget.pin(activity, params.getString("style")), null); return;
                case "shortcuts.configure": reply.finish(NativeActions.shortcuts(activity, params), null); return;
                case "tasks.configure": reply.finish(NativeTasks.get(activity).configure(params), null); return;
                case "tasks.status": reply.finish(NativeTasks.get(activity).status(), null); return;
                case "tasks.run":
                    NativeTasks.get(activity).run(params.has("accountId") ? BackgroundConfig.id(params, "accountId") : null, params.optBoolean("confirmed"), null);
                    reply.finish(NativeTasks.get(activity).status(), null); return;
                case "tools.open":
                    String tool = params.optString("tool");
                    if (!tool.matches("scanner|ota|wallpaperZip|diagnostics|updates")) throw new IllegalArgumentException("unsupported_tool");
                    if (tool.equals("ota")) activity.startActivity(new Intent(activity, GeminiOtaActivity.class)); else NativeToolActivity.open(activity, tool, null);
                    reply.finish(NativeJson.obj("opened", true), null); return;
                case "diagnostics.export": NativeToolActivity.open(activity, "diagnostics", null); reply.finish(NativeJson.obj("opened", true), null); return;
                case "keepalive.export": NativeToolActivity.open(activity, "keepalive", null); reply.finish(NativeJson.obj("opened", true), null); return;
                case "updates.check":
                    NativeToolActivity.JOBS.execute(() -> { try { reply.finish(NativeUpdates.check(), null); } catch (Exception error) { reply.finish(null, "update_check_failed"); } }); return;
                case "updates.install": NativeToolActivity.open(activity, "updates", null); reply.finish(NativeJson.obj("opened", true), null); return;
                case "officialLogin.start": NativeToolActivity.open(activity, "officialLogin", null); reply.finish(NativeJson.obj("opened", true), null); return;
                case "officialLogin.stop": OfficialLogin.stop(activity); reply.finish(OfficialLogin.status(activity), null); return;
                case "officialLogin.result":
                    if (params.optBoolean("importToPanel", false)) OfficialLogin.importToPanel(activity,reply,() -> current(epoch)); else reply.finish(OfficialLogin.status(activity), null); return;
                case "asset.export":
                    if ("panel".equals(params.optString("kind"))) {
                        if (!"geometry-status.png".equals(params.optString("fileName"))) throw new IllegalArgumentException("invalid_filename");
                        NativeToolActivity.openPanelImage(activity, params.getString("data"), reply, () -> current(epoch)); return;
                    }
                    if (!"wallpaper".equals(params.optString("kind"))) throw new IllegalArgumentException("unsupported_asset");
                    NativeDownloads.wallpaper(params.getString("url")); NativeDownloads.filename(params.optString("fileName", "wallpaper.zip"), ".zip");
                    NativeToolActivity.open(activity, "asset", params); reply.finish(NativeJson.obj("opened", true), null); return;
                case "bindVehicle": engine.bind(params); reply.finish(engine.status(), null); return;
                case "forgetVehicle": engine.forget(); reply.finish(NativeJson.obj("forgotten", true), null); return;
                case "ble.disconnect": engine.ble.disconnect("user_cancelled"); reply.finish(engine.status(), null); return;
                case "ble.scan": case "ble.connect": case "ble.command": case "ble.proximity":
                    ArrayList<String> permissions = new ArrayList<>();
                    if (Build.VERSION.SDK_INT >= 31) { permissions.add(Manifest.permission.BLUETOOTH_CONNECT); permissions.add(Manifest.permission.BLUETOOTH_SCAN); }
                    else { permissions.add(Manifest.permission.ACCESS_COARSE_LOCATION); permissions.add(Manifest.permission.ACCESS_FINE_LOCATION); }
                    if (method.equals("ble.proximity") && params.optBoolean("enabled") && Build.VERSION.SDK_INT >= 33) permissions.add(Manifest.permission.POST_NOTIFICATIONS);
                    if (method.equals("ble.proximity") && !params.optBoolean("enabled")) {
                        activity.stopService(new Intent(activity, ProximityService.class)); reply.finish(NativeJson.obj("enabled", false), null); return;
                    }
                    activity.nativePermission(permissions.toArray(new String[0]), granted -> {
                        if (!current(epoch)) return;
                        if (!granted) { reply.finish(null, "permission_denied"); return; }
                        switch (method) {
                            case "ble.scan": engine.ble.scan(reply); break;
                            case "ble.connect": engine.ble.connect(reply); break;
                            case "ble.command": engine.ble.command(params.optString("action"), reply); break;
                            default:
                                if (!engine.ble.fresh() || engine.material == null || engine.material.mac.isEmpty()) { reply.finish(null, "refresh_required"); return; }
                                Intent start = new Intent(activity, ProximityService.class).putExtra("threshold", params.optInt("threshold", -65));
                                activity.startForegroundService(start); reply.finish(NativeJson.obj("enabled", true, "automaticUnlock", false), null);
                        }
                    }); return;
                case "notifications.configure":
                    boolean enabled = params.optBoolean("enabled"); int threshold = params.optInt("lowBattery", 20);
                    String[] required = enabled && Build.VERSION.SDK_INT >= 33 ? new String[] { Manifest.permission.POST_NOTIFICATIONS } : new String[0];
                    activity.nativePermission(required, granted -> {
                        if (!current(epoch)) return;
                        if (!granted) { reply.finish(null, "permission_denied"); return; }
                        try { NativeNotifications.configure(activity, enabled, threshold); reply.finish(NativeJson.obj("enabled", enabled), null); }
                        catch (IllegalArgumentException error) { reply.finish(null, "invalid_threshold"); }
                    }); return;
                case "widget.update": PanelWidget.update(activity, params); reply.finish(NativeJson.obj("updated", true, "hint", "长按桌面并添加几何面板组件"), null); return;
                case "meter.open":
                    String mode = params.optString("mode");
                    if (!mode.equals("wallpaper") && !mode.equals("cast")) { reply.finish(null, "unsupported_mode"); return; }
                    if (engine.material == null || !engine.material.fresh(System.currentTimeMillis())) { reply.finish(null, "refresh_required"); return; }
                    JSONObject safeOptions = MeterOptions.sanitize(params);
                    Intent meter = new Intent(activity, MeterActivity.class).putExtra("mode", mode).putExtra("options", safeOptions.toString());
                    activity.startActivity(meter); reply.finish(NativeJson.obj("opened", true), null); return;
                default: reply.finish(null, "unsupported_method");
            }
        } catch (IllegalArgumentException error) { reply.finish(null, error.getMessage()); }
        catch (Exception error) { reply.finish(null, "operation_failed"); }
    }
    static String human(String code) {
        switch (code == null ? "" : code) {
            case "refresh_required": case "refresh_or_connect_required": return "资料已过期，请重新准备资料";
            case "permission_denied": return "系统权限未允许，请在设置中允许后重试。";
            case "bluetooth_off": return "请先打开手机蓝牙。";
            case "connect_first": return "请先连接当前车辆蓝牙。";
            case "authenticate_first": return "请先完成蓝牙认证。";
            case "ble_material_missing": return "钥匙资料不可用，请稍后刷新";
            case "enable_inductive_in_cloud_first": return "请先在车辆设置中启用感应钥匙，再刷新资料。";
            case "pairing_generation_unsupported": return "此车型暂不支持手机登记";
            case "busy": return "上一项尚未结束";
            default: return "结果尚未确认，请先查看车辆";
        }
    }
}
