package app.geometrypanel.mobile;

import android.content.Context;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.Signature;
import android.os.Build;
import java.io.File;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeUpdates {
    private static JSONObject candidate;
    private NativeUpdates() { }
    static synchronized JSONObject status() { return candidate == null ? NativeJson.obj("checked", false) : NativeJson.obj("checked", true, "available", candidate.optLong("versionCode") > BuildConfig.VERSION_CODE, "version", candidate.optString("version"), "size", candidate.optLong("size")); }
    static JSONObject check() throws Exception {
        HttpURLConnection connection = (HttpURLConnection) new URL("https://api.github.com/repos/bedlatess/GeometryPanel/releases?per_page=20").openConnection(Proxy.NO_PROXY);
        try {
            connection.setInstanceFollowRedirects(false); connection.setConnectTimeout(10000); connection.setReadTimeout(15000); connection.setUseCaches(false); connection.setRequestProperty("Accept", "application/vnd.github+json"); connection.setRequestProperty("User-Agent", "GeometryPanel-Android/" + BuildConfig.VERSION_NAME);
            if (connection.getResponseCode() != 200) throw new IOException("update_metadata_unavailable");
            byte[] raw; try (java.io.InputStream input = connection.getInputStream()) { raw = WallpaperArchive.bounded(input, 524288); }
            JSONObject chosen = choose(new JSONArray(new String(raw, StandardCharsets.UTF_8)));
            if (chosen == null) throw new IOException("release_apk_missing"); synchronized (NativeUpdates.class) { candidate = chosen; } return status();
        } finally { connection.disconnect(); }
    }
    static JSONObject choose(JSONArray releases) throws Exception {
        JSONObject best = null;
        for (int releaseIndex = 0; releaseIndex < Math.min(20,releases.length()); releaseIndex++) {
            JSONObject release = releases.optJSONObject(releaseIndex); if (release == null || release.optBoolean("draft")) continue;
            String version = release.optString("tag_name", "").replaceFirst("^v", ""); if (!version.matches("\\d{1,3}\\.\\d{1,3}\\.\\d{1,3}")) continue;
            String[] parts = version.split("\\."); long code = Long.parseLong(parts[0]) * 1000000 + Long.parseLong(parts[1]) * 1000 + Long.parseLong(parts[2]);
            JSONArray assets = release.optJSONArray("assets"); JSONObject chosen = null; boolean duplicate = false;
            if (assets != null) for (int i = 0; i < assets.length(); i++) { JSONObject asset = assets.optJSONObject(i); if (asset == null || !("GeometryPanel-" + version + ".apk").equals(asset.optString("name"))) continue;
                try { URI uri = new URI(asset.optString("browser_download_url")); long size = asset.optLong("size");
                    if (!NativeDownloads.github(uri) || !"github.com".equals(uri.getHost()) || !uri.getPath().startsWith("/bedlatess/GeometryPanel/releases/download/") || size < 1 || size > 128L * 1024 * 1024) continue;
                    if (chosen != null) duplicate = true;
                    chosen = NativeJson.obj("version", version, "versionCode", code, "size", size, "url", uri.toString(), "prerelease", release.optBoolean("prerelease"));
                } catch (java.net.URISyntaxException ignored) { }
            }
            if (!duplicate && chosen != null && (best == null || code > best.optLong("versionCode"))) best = chosen;
        }
        return best;
    }
    static File download(Context context, NativeCloud.Guard guard) throws Exception {
        final JSONObject selected; synchronized (NativeUpdates.class) { if (candidate == null) throw new IOException("check_update_first"); selected = new JSONObject(candidate.toString()); }
        if (selected.getLong("versionCode") <= BuildConfig.VERSION_CODE) throw new IOException("already_current");
        File folder = new File(context.getCacheDir(), "updates"); if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException(); File apk = new File(folder, "geometry-update.apk");
        NativeDownloads.copy(selected.getString("url"), apk, 128L * 1024 * 1024, false, guard);
        if (apk.length() != selected.getLong("size")) throw new IOException("update_size_mismatch");
        verify(context, apk, selected.getLong("versionCode")); return apk;
    }
    @SuppressWarnings("deprecation") static void verify(Context context, File apk, long expected) throws Exception {
        PackageManager manager = context.getPackageManager(); int flags = Build.VERSION.SDK_INT >= 28 ? PackageManager.GET_SIGNING_CERTIFICATES : PackageManager.GET_SIGNATURES;
        PackageInfo installed = manager.getPackageInfo(context.getPackageName(), flags), downloaded = manager.getPackageArchiveInfo(apk.getAbsolutePath(), flags);
        if (downloaded == null || !context.getPackageName().equals(downloaded.packageName) || (Build.VERSION.SDK_INT >= 28 ? downloaded.getLongVersionCode() : downloaded.versionCode) != expected) throw new IOException("update_package_mismatch");
        Signature[] current = Build.VERSION.SDK_INT >= 28 ? installed.signingInfo.getApkContentsSigners() : installed.signatures;
        Signature[] incoming = Build.VERSION.SDK_INT >= 28 ? downloaded.signingInfo.getApkContentsSigners() : downloaded.signatures;
        if (current == null || incoming == null || current.length != 1 || incoming.length != 1 || !MessageDigest.isEqual(current[0].toByteArray(), incoming[0].toByteArray())) throw new IOException("update_signer_mismatch");
    }
}
