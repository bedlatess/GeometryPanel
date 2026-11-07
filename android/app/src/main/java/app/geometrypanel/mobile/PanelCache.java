package app.geometrypanel.mobile;

import android.content.Context;
import android.util.AtomicFile;
import android.webkit.WebResourceResponse;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URI;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONObject;

/** Complete public shell snapshot from one fixed HTTPS origin. No mirror, page storage or account response. */
final class PanelCache {
    private static final String ROOT = "https://bedlatess.github.io/GeometryPanel/";
    private static final int MAX_FILE = 6 * 1024 * 1024, MAX_TOTAL = 12 * 1024 * 1024;
    private static final Pattern FILES = Pattern.compile("const FILES = (\\[[^;\\r\\n]{1,8192}\\])\\.map");
    private static final java.util.concurrent.ExecutorService WORKER = java.util.concurrent.Executors.newSingleThreadExecutor();
    private static final Object REFRESH_LOCK = new Object(); private static long epoch;
    private static final Map<String,Integer> USERS = new HashMap<>(); private static final java.util.Set<String> WRITING = new java.util.HashSet<>();
    static final class Session { private final JSONObject index; private boolean released; Session(JSONObject index) { this.index = index; } }
    private PanelCache() { }
    static String path(String raw) {
        try {
            URI uri = new URI(raw); if (!NavigationPolicy.isPanel(raw) || !ROOT.startsWith(uri.getScheme()+"://"+uri.getRawAuthority()+"/") || uri.getRawQuery() != null || uri.getRawPath().contains("%")) return null;
            String path = uri.getPath().substring("/GeometryPanel/".length()); if (path.isEmpty()) return "index.html";
            return member(path) ? path : null;
        } catch (Exception ignored) { return null; }
    }
    static boolean member(String path) {
        return path != null && (path.matches("(?:index\\.html|manifest\\.webmanifest|sw\\.js)") || path.matches("(?:assets|icons)/[A-Za-z0-9_.-]{1,160}\\.(?:js|css|png|svg|webp|woff2?)")) && !path.contains("..");
    }
    private static File directory(Context context) { return new File(context.getNoBackupFilesDir(),"panel-shell"); }
    private static JSONObject manifest(Context context) throws Exception {
        File file = new File(directory(context),"manifest.json"); if (!file.isFile() || file.length() > 131072) throw new IOException();
        JSONObject result = new JSONObject(new String(new AtomicFile(file).readFully(),StandardCharsets.UTF_8));
        if (!result.getString("folder").matches("shell-[a-f0-9-]{36}") || !result.getJSONObject("entries").has("index.html")) throw new IOException(); return result;
    }
    static synchronized JSONObject status(Context context) { try { JSONObject info = manifest(context); return NativeJson.obj("available",true,"at",info.getLong("at"),"files",info.getJSONObject("entries").length(),"bytes",info.getLong("bytes"),"source",ROOT); } catch (Exception ignored) { return NativeJson.obj("available",false,"source",ROOT); } }
    static synchronized Session acquire(Context context) {
        try { return pin(manifest(context)); }
        catch (Exception ignored) { return null; }
    }
    static synchronized void release(Context context, Session session) {
        unpin(session); cleanup(context,true);
    }
    static synchronized Session pin(JSONObject index) throws Exception { String folder = index.getString("folder"); USERS.put(folder,USERS.getOrDefault(folder,0)+1); return new Session(new JSONObject(index.toString())); }
    static synchronized void unpin(Session session) { if (session == null || session.released) return; session.released = true; String folder = session.index.optString("folder"); int remaining = USERS.getOrDefault(folder,0)-1; if (remaining <= 0) USERS.remove(folder); else USERS.put(folder,remaining); }
    static synchronized boolean retained(String folder, String current) { return folder.equals(current) || USERS.containsKey(folder) || WRITING.contains(folder); }
    static void warm(Context context) { if (System.currentTimeMillis()-status(context).optLong("at",0) < 900000) return; WORKER.execute(() -> { try { refresh(context); } catch (Exception ignored) { } }); }
    private static final class Download { byte[] bytes; String mime; Map<String,String> headers = new HashMap<>(); }
    private static Download fetch(String path) throws Exception {
        if (!member(path)) throw new IOException(); HttpURLConnection connection = (HttpURLConnection)new URL(ROOT+path).openConnection(Proxy.NO_PROXY);
        try {
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false); connection.setConnectTimeout(5000); connection.setReadTimeout(10000); connection.setRequestProperty("Accept-Encoding","identity"); connection.setRequestProperty("Cookie",""); connection.setRequestProperty("Authorization","");
            if (connection.getResponseCode() != 200 || connection.getContentLengthLong() > MAX_FILE) throw new IOException();
            String encoding = connection.getContentEncoding(); if (encoding != null && !encoding.equalsIgnoreCase("identity")) throw new IOException();
            Download item = new Download(); try (java.io.InputStream input = connection.getInputStream()) { item.bytes = WallpaperArchive.bounded(input,MAX_FILE); }
            if (item.bytes.length == 0 || connection.getContentLengthLong() >= 0 && connection.getContentLengthLong() != item.bytes.length) throw new IOException();
            String type = connection.getContentType(); item.mime = type == null ? "application/octet-stream" : type.split(";",2)[0].trim();
            String expected = path.endsWith(".html") ? "text/html" : path.endsWith(".css") ? "text/css" : path.endsWith(".js") ? "javascript" : "";
            if (!expected.isEmpty() && !item.mime.contains(expected)) throw new IOException();
            for (String name : new String[] {"Content-Security-Policy","Referrer-Policy","X-Content-Type-Options","Access-Control-Allow-Origin"}) { String value = connection.getHeaderField(name); if (value != null && value.length() < 16384 && !value.contains("\r") && !value.contains("\n")) item.headers.put(name,value); }
            item.headers.put("Cache-Control","no-store"); item.headers.put("X-Content-Type-Options","nosniff"); return item;
        } finally { connection.disconnect(); }
    }
    static JSONObject refresh(Context context) throws Exception { synchronized (REFRESH_LOCK) { return refreshLocked(context); } }
    private static JSONObject refreshLocked(Context context) throws Exception {
        final long started; synchronized (PanelCache.class) { started = epoch; }
        Download serviceWorker = fetch("sw.js"); Matcher match = FILES.matcher(new String(serviceWorker.bytes,StandardCharsets.UTF_8)); if (!match.find()) throw new IOException("shell_manifest_unavailable");
        JSONArray files = new JSONArray(match.group(1)); if (files.length() < 2 || files.length() > 64) throw new IOException();
        Map<String,Download> loaded = new HashMap<>(); loaded.put("sw.js",serviceWorker); long total = serviceWorker.bytes.length;
        for (int i = 0; i < files.length(); i++) { String path = files.getString(i); if (!member(path) || loaded.containsKey(path)) throw new IOException(); Download item = fetch(path); total += item.bytes.length; if (total > MAX_TOTAL) throw new IOException(); loaded.put(path,item); }
        if (!loaded.containsKey("index.html")) throw new IOException();
        String html = new String(loaded.get("index.html").bytes,StandardCharsets.UTF_8);
        Matcher references = Pattern.compile("(?:src|href)=[\"'](/GeometryPanel/(?:assets|icons)/[^\"']+)[\"']").matcher(html);
        while (references.find()) if (!loaded.containsKey(references.group(1).substring("/GeometryPanel/".length()))) throw new IOException("shell_generation_changed");
        File root = directory(context); if (!root.isDirectory() && !root.mkdirs()) throw new IOException(); String name = "shell-"+UUID.randomUUID(); File folder = new File(root,name); if (!folder.mkdir()) throw new IOException();
        synchronized (PanelCache.class) { WRITING.add(name); }
        try {
            JSONObject entries = new JSONObject();
            for (Map.Entry<String,Download> entry : loaded.entrySet()) { Download item = entry.getValue(); String hash = BleProtocol.hex(MessageDigest.getInstance("SHA-256").digest(item.bytes)); File file = new File(folder,hash);
                try (FileOutputStream output = new FileOutputStream(file)) { output.write(item.bytes); output.getFD().sync(); }
                entries.put(entry.getKey(),NativeJson.obj("file",hash,"size",item.bytes.length,"mime",item.mime,"headers",new JSONObject(item.headers)));
            }
            synchronized (PanelCache.class) {
            if (epoch != started) throw new IOException("cancelled");
            AtomicFile index = new AtomicFile(new File(root,"manifest.json")); FileOutputStream output = null;
            try { output = index.startWrite(); output.write(NativeJson.obj("at",System.currentTimeMillis(),"folder",name,"entries",entries,"bytes",total).toString().getBytes(StandardCharsets.UTF_8)); index.finishWrite(output); }
            catch (Exception error) { if (output != null) index.failWrite(output); throw error; }
            WRITING.remove(name); cleanup(context,true);
            return status(context);
            }
        } catch (Exception error) { synchronized (PanelCache.class) { WRITING.remove(name); remove(folder); } throw error; }
    }
    static synchronized WebResourceResponse response(Context context, Session session, String raw) {
        String path = path(raw); if (path == null) return null;
        try {
            if (session == null || session.released) throw new IOException(); JSONObject index = session.index, entry = index.getJSONObject("entries").getJSONObject(path); String hash = entry.getString("file"); if (!hash.matches("[a-f0-9]{64}")) throw new IOException();
            File file = new File(new File(directory(context),index.getString("folder")),hash); if (!file.isFile() || file.length() != entry.getLong("size") || file.length() > MAX_FILE) throw new IOException();
            byte[] bytes; try (java.io.InputStream input = new java.io.FileInputStream(file)) { bytes = WallpaperArchive.bounded(input,MAX_FILE); }
            if (!hash.equals(BleProtocol.hex(MessageDigest.getInstance("SHA-256").digest(bytes)))) throw new IOException();
            Map<String,String> headers = new HashMap<>(); JSONObject saved = entry.getJSONObject("headers"); for (java.util.Iterator<String> keys = saved.keys(); keys.hasNext();) { String key = keys.next(); headers.put(key,saved.getString(key)); }
            return new WebResourceResponse(entry.getString("mime"),"UTF-8",200,"OK",headers,new ByteArrayInputStream(bytes));
        } catch (Exception ignored) { return new WebResourceResponse("text/plain","UTF-8",503,"Snapshot unavailable",java.util.Collections.singletonMap("Cache-Control","no-store"),new ByteArrayInputStream("本机网页快照不可用，请联网重试。".getBytes(StandardCharsets.UTF_8))); }
    }
    static synchronized void clear(Context context) { epoch++; new AtomicFile(new File(directory(context),"manifest.json")).delete(); cleanup(context,false); }
    private static void cleanup(Context context, boolean keepCurrent) {
        String current = ""; if (keepCurrent) try { current = manifest(context).getString("folder"); } catch (Exception ignored) { }
        File[] folders = directory(context).listFiles(); if (folders != null) for (File folder : folders) if (folder.getName().matches("shell-[a-f0-9-]{36}") && !retained(folder.getName(),current)) remove(folder);
    }
    private static void remove(File file) { if (file.isDirectory() && !java.nio.file.Files.isSymbolicLink(file.toPath())) { File[] items = file.listFiles(); if (items != null) for (File item : items) remove(item); } file.delete(); }
}
