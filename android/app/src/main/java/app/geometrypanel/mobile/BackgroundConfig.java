package app.geometrypanel.mobile;

import java.util.HashSet;
import org.json.JSONArray;
import org.json.JSONObject;

/** Explicit local permission to retain the selected account/vehicle set for native background work. */
final class BackgroundConfig {
    final JSONObject data;
    BackgroundConfig(JSONObject input) throws Exception {
        JSONArray source = input.optJSONArray("accounts");
        if (source == null || source.length() > 8) throw new IllegalArgumentException("invalid_background_accounts");
        JSONArray accounts = new JSONArray(); HashSet<String> accountIds = new HashSet<>(), vehicleIds = new HashSet<>();
        for (int i = 0; i < source.length(); i++) {
            JSONObject row = source.getJSONObject(i); String id = id(row, "id");
            if (!accountIds.add(id)) throw new IllegalArgumentException("duplicate_account");
            String token = NativeJson.string(row, "token", 8192), uid = id(row, "uid");
            if (token.isEmpty() || token.matches("(?s).*\\s.*")) throw new IllegalArgumentException("invalid_token");
            JSONArray vehicles = row.optJSONArray("vehicles");
            if (vehicles == null || vehicles.length() > 16) throw new IllegalArgumentException("invalid_vehicles");
            JSONArray clean = new JSONArray(); HashSet<String> vins = new HashSet<>();
            for (int n = 0; n < vehicles.length(); n++) {
                JSONObject vehicle = vehicles.getJSONObject(n); String key = id(vehicle, "id"), vin = id(vehicle, "vin");
                if (!vehicleIds.add(key) || !vins.add(vin)) throw new IllegalArgumentException("duplicate_vehicle");
                String label = NativeJson.string(vehicle, "label", 40);
                if (label.matches("(?s).*\\p{Cntrl}.*")) throw new IllegalArgumentException("invalid_label");
                clean.put(NativeJson.obj("id", key, "vin", vin, "label", label.isEmpty() ? "我的车辆" : label,
                        "epoch", epoch(vehicle), "enabled", vehicle.optBoolean("enabled", true)));
            }
            String accountLabel = row.optString("label", "账号"); if (accountLabel.length() > 40 || accountLabel.matches("(?s).*\\p{Cntrl}.*")) throw new IllegalArgumentException("invalid_label");
            accounts.put(NativeJson.obj("id", id, "epoch", epoch(row), "token", token, "uid", uid, "label", accountLabel, "enabled", row.optBoolean("enabled", true), "vehicles", clean));
        }
        String selected = input.optString("selectedVehicleId", "");
        if (!selected.isEmpty() && !vehicleIds.contains(selected)) throw new IllegalArgumentException("invalid_selection");
        JSONObject notifications = new JSONObject(), supplied = input.optJSONObject("notifications");
        for (String name : new String[] {"chargeStart", "chargeProgress", "chargeFull", "chargeStop", "message", "lowBattery", "offline", "tire"}) {
            boolean defaultOn = name.startsWith("charge") || name.equals("message");
            if (supplied != null && supplied.has(name) && !(supplied.opt(name) instanceof Boolean)) throw new IllegalArgumentException("invalid_notification");
            notifications.put(name, supplied == null ? defaultOn : supplied.optBoolean(name, defaultOn));
        }
        int threshold = input.optInt("lowBatteryThreshold", 20);
        if (threshold < 5 || threshold > 80) throw new IllegalArgumentException("invalid_threshold");
        data = NativeJson.obj("enabled", input.optBoolean("enabled", false), "accounts", accounts, "selectedVehicleId", selected,
                "notifications", notifications, "lowBatteryThreshold", threshold);
    }
    static String id(JSONObject row, String key) {
        String value = NativeJson.string(row, key, 64);
        if (!value.matches("[A-Za-z0-9_-]{1,64}")) throw new IllegalArgumentException("invalid_identity");
        return value;
    }
    private static long epoch(JSONObject row) {
        Object value = row.opt("epoch");
        if (!(value instanceof Number) || ((Number) value).doubleValue() < 0 || ((Number) value).doubleValue() > 9007199254740991d
                || ((Number) value).doubleValue() != ((Number) value).longValue()) throw new IllegalArgumentException("invalid_epoch");
        return ((Number) value).longValue();
    }
    JSONObject vehicle(String id) {
        JSONArray accounts = data.optJSONArray("accounts");
        for (int i = 0; i < accounts.length(); i++) {
            JSONObject account = accounts.optJSONObject(i); JSONArray vehicles = account.optJSONArray("vehicles");
            for (int n = 0; n < vehicles.length(); n++) if (id.equals(vehicles.optJSONObject(n).optString("id")))
                return NativeJson.obj("account", account, "vehicle", vehicles.optJSONObject(n));
        }
        return null;
    }
}
