package app.geometrypanel.mobile;

import android.content.Context;
import android.content.Intent;
import org.json.JSONObject;

final class NativeEngine {
    private static NativeEngine instance;
    final Context context;
    final NativeVault vault;
    final BleClient ble;
    VehicleMaterial material;
    volatile long generation;
    private String persistedScope = "";
    private NativeEngine(Context context) {
        this.context = context.getApplicationContext(); vault = new NativeVault(this.context); ble = new BleClient(this.context, vault);
        // Never automatically resume a physical connection after process death. Fresh owner data is required.
        NativeNotifications.channels(this.context);
        try {
            String saved = vault.read("vehicle");
            if (saved != null) { JSONObject prior = new JSONObject(saved); persistedScope = prior.optString("uid") + "|" + prior.optString("vin") + "|" + prior.optString("credentialDigest"); }
        } catch (Exception ignored) { /* Never revive keys or a connection without fresh ownership verification. */ }
    }
    static synchronized NativeEngine get(Context context) { if (instance == null) instance = new NativeEngine(context); return instance; }
    void bind(JSONObject params) throws Exception {
        VehicleMaterial next = new VehicleMaterial(params, System.currentTimeMillis());
        vault.save("vehicle", next.data.toString());
        generation++;
        context.stopService(new Intent(context, ProximityService.class));
        context.stopService(new Intent(context, CastProjectionService.class));
        String scope = next.uid + "|" + next.vin + "|" + next.credentialDigest;
        if (!scope.equals(persistedScope)) { PanelWidget.clear(context); vault.forget("meter-profile"); }
        persistedScope = scope;
        ble.bind(next); material = next;
    }
    void forget() {
        generation++; material = null; persistedScope = "";
        ble.bind(null); vault.forget("vehicle"); vault.forget("meter-profile");
        context.stopService(new Intent(context, ProximityService.class)); context.stopService(new Intent(context, CastProjectionService.class));
        PanelWidget.clear(context);
        android.app.NotificationManager notifications = context.getSystemService(android.app.NotificationManager.class);
        notifications.cancel(501); notifications.cancel(502);
        NativeNotifications.preferences(context).edit().putBoolean("enabled", false).putBoolean("lowSent", false).apply();
    }
    JSONObject status() {
        JSONObject status = ble.status();
        try {
            status.put("uniqueIdentify", BleProtocol.hex(vault.identity())); status.put("bound", material != null); status.put("proximityEnabled", ProximityService.running);
            status.put("notificationsEnabled", NativeNotifications.preferences(context).getBoolean("enabled", false));
            status.put("notificationPermission", NativeNotifications.permission(context));
            status.put("meterState", CastProjectionService.phase);
        } catch (Exception ignored) { }
        return status;
    }
}
