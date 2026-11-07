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
                    if (raw == null || raw.length() > 24576) return;
                    try {
                        JSONObject request = new JSONObject(raw);
                        String id = NativeJson.string(request, "id", 100), method = NativeJson.string(request, "method", 40);
                        if (!BridgeContract.validId(id) || requests.size() >= 16 || !requests.add(id)) return;
                        JSONObject params = request.optJSONObject("params");
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
                                    "meter", activity.getPackageManager().hasSystemFeature(PackageManager.FEATURE_WIFI_DIRECT)),
                            "limitations", NativeJson.list("BLE 协议已按旧包恢复，仍需实车核对；BLE2/3 钥匙配对不支持。", "靠近服务只提醒，不自动开锁；云授权过期会停止。", "低电量通知来自本机新读取的云车况；未实车核对的蓝牙读数不触发低电量通知，不进行后台云端轮询。", "仪表 Wi-Fi / 投屏协议需匹配车型；视频不含音频或反向触控。")), null); return;
                case "status": reply.finish(engine.status(), null); return;
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
            case "refresh_required": case "refresh_or_connect_required": return "请先重新读取并绑定当前车辆资料，云端钥匙授权有效期为五分钟。";
            case "permission_denied": return "系统权限未允许，请在设置中允许后重试。";
            case "bluetooth_off": return "请先打开手机蓝牙。";
            case "connect_first": return "请先连接当前车辆蓝牙。";
            case "authenticate_first": return "请先完成蓝牙认证。";
            case "ble_material_missing": return "云端没有提供完整蓝牙钥匙材料；可继续使用其它功能。";
            case "enable_inductive_in_cloud_first": return "请先在车辆设置中启用感应钥匙，再刷新资料。";
            case "pairing_generation_unsupported": return "当前只恢复了旧包支持的 2.0 BLE1 钥匙登记，其它代际不猜测写入。";
            case "busy": return "上一项操作尚未结束，请稍候。";
            default: return "本次操作未完成；若已发送车辆请求，请先观察实际状态，再决定是否重试。";
        }
    }
}
