package app.geometrypanel.mobile;

import android.content.Context;
import android.os.Build;
import java.io.File;
import java.io.FileOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeExports {
    private NativeExports() { }
    static byte[] diagnostics(Context context) throws Exception {
        JSONObject background = BackgroundMonitor.get(context).status(); JSONArray vehicles = background.getJSONArray("vehicles"), samples = new JSONArray();
        for (int i = 0; i < vehicles.length(); i++) { JSONObject row = vehicles.getJSONObject(i); samples.put(NativeJson.obj("index", i, "lastPoll", row.optLong("lastPoll"), "error", row.optString("error"))); }
        return NativeJson.obj("version", BuildConfig.VERSION_NAME, "androidApi", Build.VERSION.SDK_INT, "at", System.currentTimeMillis(), "backgroundEnabled", background.optBoolean("enabled"), "backgroundRunning", background.optBoolean("running"), "jobScheduled", background.optBoolean("jobScheduled"),
                "vehicleCount", vehicles.length(), "pollStates", samples, "notificationPermission", NativeNotifications.permission(context), "castRunning", CastProjectionService.running, "bleConnected", NativeEngine.get(context).ble.connected(),
                "redaction", "No tokens, user ids, VINs, MACs, account/vehicle labels, coordinates, messages, post text, raw HTTP, QR payload or key material.").toString(2).getBytes(StandardCharsets.UTF_8);
    }
    static File keepalive(Context context) throws Exception {
        File file = File.createTempFile("geometry-keepalive-", ".zip", context.getCacheDir());
        try (ZipOutputStream zip = new ZipOutputStream(new FileOutputStream(file))) { add(context, zip, "keepalive", ""); }
        return file;
    }
    private static void add(Context context, ZipOutputStream zip, String path, String prefix) throws Exception {
        String[] children = context.getAssets().list(path); if (children == null) return;
        for (String child : children) {
            String source = path + "/" + child, destination = prefix + child; String[] nested = context.getAssets().list(source);
            if (nested != null && nested.length > 0) { add(context, zip, source, destination + "/"); continue; }
            byte[] bytes; try (java.io.InputStream input = context.getAssets().open(source)) { bytes = WallpaperArchive.bounded(input, 262144); }
            if (destination.equals("module.prop")) bytes = new String(bytes, StandardCharsets.UTF_8).replace("version=0.5.0", "version=" + BuildConfig.VERSION_NAME).replace("versionCode=5000", "versionCode=" + BuildConfig.VERSION_CODE).getBytes(StandardCharsets.UTF_8);
            zip.putNextEntry(new ZipEntry(destination)); zip.write(bytes); zip.closeEntry();
        }
    }
}
