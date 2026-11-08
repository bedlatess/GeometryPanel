package app.geometrypanel.mobile;

import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import java.io.IOException;
import java.util.Collections;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Single-flight, encrypted multi-account polling independent of WebView lifetime. */
final class BackgroundMonitor {
    private static BackgroundMonitor instance;
    private final Context context; private final NativeVault vault;
    private final ExecutorService worker = Executors.newSingleThreadExecutor(); private final AtomicBoolean busy = new AtomicBoolean();
    private BackgroundConfig config; private JSONObject state = new JSONObject(); private volatile long generation;
    private long lastRun;
    private BackgroundMonitor(Context context) {
        this.context = context.getApplicationContext(); vault = new NativeVault(this.context);
        try { String raw = vault.read("background-config"); config = new BackgroundConfig(raw == null ? NativeJson.obj("accounts", new JSONArray()) : new JSONObject(raw));
            String saved = vault.read("background-state"); if (saved != null) state = new JSONObject(saved);
        } catch (Exception ignored) { try { config = new BackgroundConfig(NativeJson.obj("accounts", new JSONArray())); } catch (Exception impossible) { throw new IllegalStateException(); } }
    }
    static synchronized BackgroundMonitor get(Context context) { if (instance == null) instance = new BackgroundMonitor(context); return instance; }
    synchronized JSONObject configure(JSONObject input, boolean start) throws Exception {
        BackgroundConfig next = new BackgroundConfig(input); generation++;
        boolean changed = false; android.content.SharedPreferences.Editor widgetCache = context.getSharedPreferences("widget-snapshot",Context.MODE_PRIVATE).edit();
        JSONArray oldAccounts = config.data.getJSONArray("accounts");
        for (int i = 0; i < oldAccounts.length(); i++) { JSONObject oldAccount = oldAccounts.getJSONObject(i); JSONArray oldVehicles = oldAccount.getJSONArray("vehicles");
            for (int n = 0; n < oldVehicles.length(); n++) { JSONObject oldVehicle = oldVehicles.getJSONObject(n), replacement = next.vehicle(oldVehicle.getString("id"));
                if (replacement == null || !same(oldAccount,replacement.getJSONObject("account"),"id","epoch","token","uid","enabled") || !same(oldVehicle,replacement.getJSONObject("vehicle"),"id","epoch","vin","enabled")) { widgetCache.remove("vehicle-"+oldVehicle.getString("id")); changed = true; }
            }
        }
        widgetCache.apply(); if (changed) context.getSystemService(android.content.pm.ShortcutManager.class).removeAllDynamicShortcuts();
        JSONObject retained = new JSONObject(); JSONArray accounts = next.data.getJSONArray("accounts");
        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.getJSONObject(i); JSONArray vehicles = account.getJSONArray("vehicles");
            for (int n = 0; n < vehicles.length(); n++) {
                JSONObject vehicle = vehicles.getJSONObject(n), prior = config.vehicle(vehicle.getString("id"));
                if (prior != null && same(prior.getJSONObject("account"), account, "id", "epoch", "token", "uid")
                        && same(prior.getJSONObject("vehicle"), vehicle, "id", "epoch", "vin") && state.has(vehicle.getString("id"))) retained.put(vehicle.getString("id"), state.get(vehicle.getString("id")));
            }
        }
        vault.save("background-config", next.data.toString()); config = next; state = retained; persist();
        java.io.File marker = new java.io.File(context.getNoBackupFilesDir(), "background.enabled");
        if (enabled() && accounts.length() > 0) marker.createNewFile(); else marker.delete();
        PanelWidget.renderAll(context);
        BackgroundJob.schedule(context, enabled());
        if (!enabled()) context.stopService(new Intent(context, BackgroundService.class));
        else if (start) context.startForegroundService(new Intent(context, BackgroundService.class));
        return status();
    }
    synchronized JSONObject sync(JSONObject input) throws Exception {
        JSONObject next = new JSONObject(config.data.toString()); next.put("accounts", input.getJSONArray("accounts")); next.put("selectedVehicleId", input.optString("selectedVehicleId", ""));
        return configure(next, false);
    }
    synchronized JSONObject remove(String accountId) throws Exception {
        JSONArray accounts = new JSONArray(), previous = config.data.getJSONArray("accounts");
        for (int i = 0; i < previous.length(); i++) if (!accountId.equals(previous.getJSONObject(i).getString("id"))) accounts.put(previous.get(i));
        return sync(NativeJson.obj("accounts", accounts, "selectedVehicleId", ""));
    }
    private static boolean same(JSONObject left, JSONObject right, String... names) { for (String name : names) if (!String.valueOf(left.opt(name)).equals(String.valueOf(right.opt(name)))) return false; return true; }
    synchronized boolean enabled() { return config.data.optBoolean("enabled"); }
    synchronized JSONObject binding(String id) throws Exception { JSONObject value = config.vehicle(id); return value == null ? null : new JSONObject(value.toString()); }
    synchronized JSONObject selected() throws Exception { return binding(config.data.optString("selectedVehicleId", "")); }
    synchronized JSONObject snapshot(String id) throws Exception { JSONObject row = state.optJSONObject(id); return row == null || row.optJSONObject("snapshot") == null ? new JSONObject() : new JSONObject(row.getJSONObject("snapshot").toString()); }
    synchronized long generation() { return generation; }
    synchronized void cancelRun() { generation++; }
    synchronized JSONArray accounts() throws Exception { return new JSONArray(config.data.getJSONArray("accounts").toString()); }
    synchronized JSONObject status() {
        JSONArray vehicles = new JSONArray(), accounts = config.data.optJSONArray("accounts");
        for (int i = 0; i < accounts.length(); i++) { JSONObject account = accounts.optJSONObject(i); JSONArray list = account.optJSONArray("vehicles");
            for (int n = 0; n < list.length(); n++) { JSONObject vehicle = list.optJSONObject(n), saved = state.optJSONObject(vehicle.optString("id"));
                vehicles.put(NativeJson.obj("id", vehicle.optString("id"), "label", vehicle.optString("label"), "epoch", vehicle.optLong("epoch"),
                        "lastPoll", saved == null ? 0 : saved.optLong("lastPoll"), "error", saved == null ? "" : saved.optString("error", ""),
                        "snapshot", saved == null ? new JSONObject() : saved.optJSONObject("snapshot")));
            }
        }
        return NativeJson.obj("enabled", enabled(), "running", BackgroundService.running, "busy", busy.get(), "backgroundMode", BackgroundService.running ? "foreground-service" : "opportunistic",
                "jobScheduled", BackgroundJob.scheduled(context), "lastRun", lastRun, "vehicles", vehicles);
    }
    boolean run(String vehicleId, Runnable finished) {
        if (!busy.compareAndSet(false, true)) return false;
        context.getSharedPreferences("native-keepalive", Context.MODE_PRIVATE).edit().putLong("no_secret_heartbeat_at", System.currentTimeMillis()).apply();
        final long token; final BackgroundConfig snapshot;
        synchronized (this) { token = generation; snapshot = config; }
        worker.execute(() -> {
            try {
                JSONArray accounts = snapshot.data.optJSONArray("accounts");
                for (int i = 0; i < accounts.length(); i++) {
                    JSONObject account = accounts.optJSONObject(i); if (!account.optBoolean("enabled")) continue;
                    JSONArray vehicles = account.optJSONArray("vehicles");
                    for (int n = 0; n < vehicles.length(); n++) {
                        JSONObject vehicle = vehicles.optJSONObject(n); if (!vehicle.optBoolean("enabled") || vehicleId != null && !vehicleId.equals(vehicle.optString("id"))) continue;
                        if (generation != token) return;
                        poll(account, vehicle, snapshot, token);
                    }
                }
            } finally { synchronized (this) { lastRun = System.currentTimeMillis(); } busy.set(false); if (finished != null) finished.run(); }
        }); return true;
    }
    private void poll(JSONObject account, JSONObject vehicle, BackgroundConfig settings, long token) {
        NativeCloud client = new NativeCloud(); String id = vehicle.optString("id"), vin = vehicle.optString("vin"), credential = account.optString("token");
        NativeCloud.Guard guard = () -> { if (generation != token || Thread.currentThread().isInterrupted()) throw new IOException("cancelled"); };
        long requested = System.currentTimeMillis();
        try {
            synchronized (this) { JSONObject old = state.optJSONObject(id); if (old != null && ("auth_expired".equals(old.optString("error")) || requested - old.optLong("lastPoll") < 30000)) return; }
            JSONObject home = object(client.request(NativeCloud.APP + "/vehicleHomePageV2/" + vin, "GET", Collections.emptyMap(), null, credential, guard));
            JSONObject battery = null, tires = null, messages = null;
            try { battery = object(client.request(NativeCloud.APP + "/batteryInfo/" + vin, "GET", Collections.emptyMap(), null, credential, guard)); } catch (Exception error) { rethrowCritical(error); }
            JSONObject next = BackgroundRules.normalize(home, battery, System.currentTimeMillis());
            JSONObject toggles = settings.data.optJSONObject("notifications");
            if (toggles.optBoolean("tire")) try { tires = object(client.request(NativeCloud.APP + "/app/vehicle/tire/monitoring", "GET", Map.of("sensorType", "EXTERNAL", "vinNo", vin), null, credential, guard)); } catch (Exception error) { rethrowCritical(error); }
            if (toggles.optBoolean("message")) try { messages = object(client.request("/v1.0/mine/cfmotoservermine/app/Message/list_v2", "GET", Map.of("messageKind", "3", "page", "1", "pageSize", "20", "userId", account.optString("uid")), null, credential, guard)); } catch (Exception error) { rethrowCritical(error); }
            if (tires != null) addTires(next, tires);
            if (messages != null) {
                JSONArray rows = messages.optJSONArray("messageVOList");
                if (rows != null) for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); if (row == null) continue;
                    String target = row.optString("vinNo", row.optString("vin", "")); if (!target.isEmpty() && !target.equals(vin)) continue;
                    String messageId = row.optString("messageId", ""); if (messageId.matches("[A-Za-z0-9_-]{1,100}")) { next.put("messageId", messageId); break; }
                }
            }
            guard.check(); apply(id, vehicle.optString("label"), next, settings, token);
        } catch (Exception error) {
            if (generation != token) return;
            String reason = "auth_expired".equals(error.getMessage()) ? "auth_expired" : "cloud_unavailable";
            synchronized (this) { try { JSONObject record = record(id); boolean first = !reason.equals(record.optString("error")); record.put("error", reason); record.put("lastAttempt", requested); persist();
                if (first && reason.equals("auth_expired")) notifyEvent(id, vehicle.optString("label"), NativeJson.obj("kind", "auth", "title", "登录资料已失效", "body", "请打开面板重新连接此账号，后台请求已暂停。"));
            } catch (Exception ignored) { } }
        }
    }
    private static void rethrowCritical(Exception error) throws Exception { if ("auth_expired".equals(error.getMessage()) || "cancelled".equals(error.getMessage())) throw error; }
    private static JSONObject object(Object raw) throws IOException { if (!(raw instanceof JSONObject)) throw new IOException("cloud_format"); return (JSONObject) raw; }
    private static void addTires(JSONObject next, JSONObject input) throws Exception {
        JSONArray rows = input.optJSONArray("realTimeData"); if (rows == null) return;
        boolean known = false, warning = false;
        for (int i = 0; i < rows.length(); i++) { JSONObject row = rows.optJSONObject(i); if (row == null || row.optInt("sensorPosition") < 1 || row.optInt("sensorPosition") > 2) continue;
            double pressure = row.optDouble("tirePressure", -1); boolean valid = Double.isFinite(pressure) && pressure >= 0 && pressure <= 10;
            if (valid) next.put(row.optInt("sensorPosition") == 1 ? "tireFront" : "tireRear", pressure);
            known |= valid || row.has("warningType"); warning |= row.optInt("warningType") > 0 || valid && pressure < 1.899999976158142;
        }
        if (known) next.put("tireWarning", warning);
    }
    private synchronized JSONObject record(String id) throws Exception { JSONObject record = state.optJSONObject(id); if (record == null) { record = NativeJson.obj("battery", new JSONArray(), "charge", new JSONArray(), "events", new JSONArray(), "flags", new JSONObject()); state.put(id, record); } return record; }
    private synchronized void apply(String id, String label, JSONObject next, BackgroundConfig settings, long token) throws Exception {
        if (generation != token) return;
        JSONObject record = record(id), prior = record.optJSONObject("snapshot"); if (prior == null) prior = new JSONObject();
        boolean future = "future".equals(next.optString("reportState")) || "future".equals(next.optString("batteryReportState"));
        JSONObject flags = record.getJSONObject("flags"); JSONArray events = future ? new JSONArray() : BackgroundRules.events(prior, next, flags, settings.data.optInt("lowBatteryThreshold", 20));
        JSONArray battery = record.getJSONArray("battery"), charge = record.getJSONArray("charge"), storedEvents = record.getJSONArray("events");
        if (!future) { battery.put(historyPoint(next)); updateCharge(charge, prior, next); }
        for (int i = 0; i < events.length(); i++) {
            JSONObject event = events.getJSONObject(i); String kind = event.getString("type"); String title = title(kind);
            JSONObject saved = NativeJson.obj("id", UUID.randomUUID().toString(), "at", event.getLong("at"), "kind", kind, "title", title, "body", notificationBody(kind, next));
            storedEvents.put(saved); if (settings.data.getJSONObject("notifications").optBoolean(kind, false)) notifyEvent(id, label, saved);
        }
        record.put("battery", trim(battery, 500)); record.put("charge", trim(charge, 100)); record.put("events", trim(storedEvents, 200)); record.put("snapshot", next); record.put("lastPoll", next.getLong("receivedAt")); record.put("error", ""); persist();
        PanelWidget.renderAll(context);
    }
    static void updateCharge(JSONArray sessions, JSONObject prior, JSONObject next) throws Exception {
        long at = next.optLong("receivedAt"), previous = prior.optLong("receivedAt", 0); int state = next.optInt("charging", -1);
        if (at <= 0 || previous > 0 && at <= previous || "future".equals(next.optString("chargeReportState"))) return;
        JSONObject active = sessions.length() == 0 ? null : sessions.optJSONObject(sessions.length() - 1);
        if (active != null && active.optLong("endedAt", 0) != 0) active = null;
        boolean fresh = "fresh".equals(next.optString("chargeReportState"));
        boolean gap = previous <= 0 || at - previous > 300000 || !"fresh".equals(prior.optString("chargeReportState"));
        if (active != null && (gap || !fresh || state < 0)) { active.put("status", "unknown"); active.put("endedAt", previous > 0 ? previous : at); active = null; }
        if (!fresh || state < 0) return;
        if (state == 1) {
            if (active == null) { active = NativeJson.obj("id", UUID.randomUUID().toString(), "startedAt", at, "detectedAt", at, "estimated", gap || prior.optInt("charging", -1) < 0, "endedAt", JSONObject.NULL,
                    "startSoc", next.opt("soc") == null ? JSONObject.NULL : next.opt("soc"), "endSoc", JSONObject.NULL, "status", "charging", "sampleCount", 0); sessions.put(active); }
            active.put("sampleCount", active.optInt("sampleCount") + 1); active.put("endSoc", next.opt("soc") == null ? JSONObject.NULL : next.opt("soc"));
        } else if (active != null && state >= 0) { active.put("endedAt", at); active.put("endSoc", next.opt("soc") == null ? JSONObject.NULL : next.opt("soc")); active.put("status", state == 2 && !gap ? "full" : gap ? "unknown" : "interrupted"); }
    }
    static JSONObject historyPoint(JSONObject next) throws Exception {
        JSONObject point = new JSONObject(); for (String key : new String[] {"soc", "range", "voltage", "current", "power"}) point.put(key, next.has(key) ? next.get(key) : JSONObject.NULL);
        point.put("charging", next.has("charging") ? next.optInt("charging", -1) == 1 : JSONObject.NULL); point.put("online", next.has("online") ? next.optInt("online", -1) == 1 : JSONObject.NULL);
        point.put("at",next.getLong("receivedAt")); point.put("reportState",next.optString("reportState","unknown")); point.put("batteryReportState",next.optString("batteryReportState","unknown")); return point;
    }
    static JSONArray trim(JSONArray array, int max) { JSONArray clean = new JSONArray(); for (int i = Math.max(0, array.length() - max); i < array.length(); i++) clean.put(array.opt(i)); return clean; }
    private static String title(String kind) { switch (kind) { case "chargeStart": return "检测到开始充电"; case "chargeProgress": return "充电进度更新"; case "chargeFull": return "检测到已充满"; case "chargeStop": return "检测到充电停止"; case "lowBattery": return "车辆电量较低"; case "offline": return "车辆已离线"; case "tire": return "车辆胎压提醒"; case "message": return "收到新的车辆消息"; default: return "车况缺测区间"; } }
    private static String notificationBody(String kind, JSONObject snapshot) {
        switch(kind) {
            case "chargeStart": return "充电已开始";
            case "chargeFull": return "已充满";
            case "chargeStop": return "充电已停止";
            case "chargeProgress": return "充电中，电量 " + Math.round(snapshot.optDouble("soc")) + "%";
            case "lowBattery": return "电量 " + Math.round(snapshot.optDouble("soc")) + "%，请及时充电";
            case "offline": return "车辆离线";
            case "tire": return "胎压异常，请检查轮胎";
            case "message": return "收到车辆消息";
            default: return "车况记录中断";
        }
    }
    @android.annotation.SuppressLint("MissingPermission") private void notifyEvent(String id, String label, JSONObject event) {
        if (!NativeNotifications.permission(context)) return;
        context.getSystemService(NotificationManager.class).notify(6000 + Math.floorMod((id + event.optString("kind")).hashCode(), 1000000),
                NativeNotifications.builder(context, "geometry-reminders", label, event.optString("body")).setAutoCancel(true).build());
    }
    private synchronized void persist() throws Exception { vault.save("background-state", state.toString()); }
    synchronized JSONObject history(JSONObject params) throws Exception {
        String id = BackgroundConfig.id(params, "vehicleId"), kind = params.optString("kind"); if (config.vehicle(id) == null || !kind.matches("battery|charge|events")) throw new IllegalArgumentException("invalid_history");
        int limit = params.optInt("limit", 100); if (limit < 1 || limit > 500) throw new IllegalArgumentException("invalid_limit");
        long before = params.optLong("before", Long.MAX_VALUE); JSONObject stored = state.optJSONObject(id); JSONArray all = stored == null ? new JSONArray() : stored.optJSONArray(kind), items = new JSONArray();
        for (int i = all.length() - 1; i >= 0 && items.length() < limit; i--) { JSONObject row = all.optJSONObject(i); if (row != null && row.optLong(kind.equals("charge") ? "detectedAt" : "at") < before) {
            JSONObject clean = new JSONObject(row.toString());
            if (kind.equals("battery")) for (String key : new String[] {"charging", "online"}) { Object value = clean.opt(key); if (value instanceof Number) clean.put(key, ((Number)value).intValue() == 1); }
            if (kind.equals("charge")) { if (clean.optLong("startedAt",0) <= 0) { clean.put("startedAt",clean.optLong("detectedAt")); clean.put("estimated",true); } if (clean.optLong("endedAt",0) == 0) clean.put("endedAt",JSONObject.NULL); }
            items.put(clean);
        } }
        return NativeJson.obj("kind", kind, "items", items, "total", all.length());
    }
    synchronized JSONObject clear(JSONObject params) throws Exception {
        if (!params.optBoolean("confirmed")) throw new IllegalArgumentException("confirmation_required");
        String id = BackgroundConfig.id(params, "vehicleId"), kind = params.optString("kind"); if (config.vehicle(id) == null || !kind.matches("battery|charge|events|all")) throw new IllegalArgumentException("invalid_history");
        JSONObject row = record(id); for (String key : new String[] {"battery", "charge", "events"}) if (kind.equals(key) || kind.equals("all")) row.put(key, new JSONArray()); persist(); return NativeJson.obj("cleared", true);
    }
    synchronized long nextDelay() {
        long delay = 300000, now = System.currentTimeMillis();
        java.util.Iterator<String> keys = state.keys(); while (keys.hasNext()) { JSONObject row = state.optJSONObject(keys.next()); JSONObject sample = row.optJSONObject("snapshot"); if (sample != null) delay = Math.min(delay, BackgroundRules.interval(sample, now)); }
        return state.length() == 0 ? 60000 : delay;
    }
}
