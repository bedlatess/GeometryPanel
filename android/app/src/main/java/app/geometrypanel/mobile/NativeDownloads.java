package app.geometrypanel.mobile;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.net.URL;
import java.security.MessageDigest;
import java.util.Locale;
import org.json.JSONObject;

final class NativeDownloads {
    private NativeDownloads() { }
    static URI wallpaper(String raw) throws Exception {
        URI uri = new URI(raw); String host = uri.getHost();
        if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getUserInfo() != null || uri.getFragment() != null || uri.getPort() != -1 && uri.getPort() != 443
                || host == null || !host.equals("oss-cfmoto-private.zeehoev.com") && !host.equals("zeeho-user.oss-cn-hangzhou.aliyuncs.com")) throw new IOException("asset_origin_rejected");
        return uri;
    }
    static boolean github(URI uri) {
        String host = uri.getHost(); return "https".equals(uri.getScheme()) && uri.getUserInfo() == null && uri.getFragment() == null && (uri.getPort() == -1 || uri.getPort() == 443)
                && host != null && (host.equals("github.com") || host.equals("release-assets.githubusercontent.com") || host.equals("objects.githubusercontent.com") || host.equals("assets.githubusercontent.com"));
    }
    static String filename(String raw, String suffix) throws IOException { if (raw == null || raw.isEmpty() || raw.length() > 200 || !raw.toLowerCase(Locale.ROOT).endsWith(suffix) || raw.matches("(?s).*[\\/\\\\\\p{Cntrl}].*")) throw new IOException("invalid_filename"); return raw; }
    static String copy(String raw, File destination, long max, boolean wallpaper, NativeCloud.Guard guard) throws Exception {
        URI current = new URI(raw); long deadline = System.currentTimeMillis() + 120000; MessageDigest digest = MessageDigest.getInstance("MD5");
        for (int hop = 0; hop < 5; hop++) {
            if (wallpaper) wallpaper(current.toString()); else if (!github(current)) throw new IOException("update_origin_rejected"); guard.check();
            HttpURLConnection connection = (HttpURLConnection) current.toURL().openConnection(Proxy.NO_PROXY);
            try {
                connection.setInstanceFollowRedirects(false); connection.setUseCaches(false); connection.setConnectTimeout(10000); connection.setReadTimeout(15000); connection.setRequestProperty("Accept-Encoding", "identity"); connection.setRequestProperty("Cookie", ""); connection.setRequestProperty("Authorization", "");
                int status = connection.getResponseCode();
                if (status == 301 || status == 302 || status == 303 || status == 307 || status == 308) { String location = connection.getHeaderField("Location"); if (location == null) throw new IOException("redirect_missing"); current = current.resolve(location); continue; }
                if (status != 200 || connection.getContentLengthLong() > max) throw new IOException("download_rejected");
                String encoding = connection.getContentEncoding(); if (encoding != null && !encoding.equalsIgnoreCase("identity")) throw new IOException("encoding_rejected");
                long total = 0;
                try (InputStream input = connection.getInputStream(); FileOutputStream output = new FileOutputStream(destination)) {
                    byte[] block = new byte[65536]; int read;
                    while ((read = input.read(block)) != -1) { guard.check(); if (System.currentTimeMillis() > deadline || total + read > max) throw new IOException("download_limit"); output.write(block, 0, read); digest.update(block, 0, read); total += read; }
                    output.getFD().sync();
                }
                if (total <= 0 || connection.getContentLengthLong() >= 0 && connection.getContentLengthLong() != total) throw new IOException("download_truncated");
                return BleProtocol.hex(digest.digest());
            } finally { connection.disconnect(); }
        }
        throw new IOException("redirect_limit");
    }
    static void validateAsset(JSONObject options, File file, String actualMd5) throws Exception {
        filename(options.optString("fileName", "wallpaper.zip"), ".zip"); Object size = options.opt("fileSize");
        if (size != null && size != JSONObject.NULL && (!(size instanceof Number) || ((Number) size).doubleValue() != ((Number) size).longValue() || ((Number) size).longValue() < 1 || ((Number) size).longValue() > WallpaperArchive.MAX || file.length() != ((Number) size).longValue())) throw new IOException("asset_size_mismatch");
        String expected = options.optString("md5", ""); if (!expected.isEmpty() && (!expected.matches("[A-Fa-f0-9]{32}") || !expected.equalsIgnoreCase(actualMd5))) throw new IOException("asset_digest_mismatch");
        WallpaperArchive.validate(file, 0, 0);
    }
}
