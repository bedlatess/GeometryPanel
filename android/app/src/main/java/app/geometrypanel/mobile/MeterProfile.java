package app.geometrypanel.mobile;

import java.net.URLDecoder;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONObject;

final class MeterProfile {
    final String mac, ssid, password, serial;
    final JSONObject json;
    MeterProfile(String raw) throws Exception {
        if (raw == null || raw.length() > 4096) throw new IllegalArgumentException("profile_size");
        JSONObject data;
        if (raw.trim().startsWith("{")) data = new JSONObject(raw);
        else {
            String query = raw.contains("?") ? raw.substring(raw.indexOf('?') + 1) : raw;
            Map<String, String> values = new HashMap<>();
            for (String part : query.split("&")) {
                String[] pair = part.split("=", 2); if (pair.length != 2) continue;
                String name = URLDecoder.decode(pair[0], "UTF-8"), value = URLDecoder.decode(pair[1], "UTF-8");
                if (values.put(name, value) != null) throw new IllegalArgumentException("profile_duplicate");
            }
            String version = first(values, "v", "version", "ver"), mode = first(values, "action", "mode");
            data = NativeJson.obj("version", version.isEmpty() ? 1 : Integer.parseInt(version), "mode", mode.isEmpty() ? "9" : mode,
                    "ssid", first(values, "ssid", "networkName"), "password", first(values, "password", "pwd"),
                    "p2pMac", first(values, "p2pMac", "mac", "p2pmac", "p2p_mac"), "serial", first(values, "sn", "serial"));
        }
        if (data.optInt("version", 1) != 1 || !"9".equals(data.optString("mode", "9"))) throw new IllegalArgumentException("profile_unsupported");
        mac = NativeJson.string(data, "p2pMac", 17).replace('-', ':').toUpperCase(Locale.ROOT);
        ssid = NativeJson.string(data, "ssid", 32); password = NativeJson.string(data, "password", 63); serial = data.optString("serial", "");
        if (!mac.matches("[0-9A-F]{2}(:[0-9A-F]{2}){5}") || ssid.isEmpty() || password.length() < 8 || serial.length() > 128) throw new IllegalArgumentException("profile_invalid");
        json = NativeJson.obj("version", 1, "mode", "9", "p2pMac", mac, "ssid", ssid, "password", password, "serial", serial);
    }
    private static String first(Map<String, String> values, String... keys) { for (String key : keys) if (values.containsKey(key)) return values.get(key); return ""; }
}
