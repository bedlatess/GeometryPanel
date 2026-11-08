package app.geometrypanel.mobile;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.Rect;
import android.media.projection.MediaProjectionManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.util.ArrayList;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;
import org.json.JSONObject;

/** Local selection/pairing/capture UI. The web page never receives file, Wi-Fi or projection secrets. */
public final class MeterActivity extends Activity {
    private NativeEngine engine;
    private long generation;
    private JSONObject options;
    private String mode;
    private MeterProfile profile;
    private EditText profileInput;
    private TextView status;
    private File archive;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private MeterConnection connection;
    private WallpaperTransfer transfer;
    private boolean destroyed, busy;
    private Runnable permissionContinuation;
    private final android.os.Handler handler = new android.os.Handler(android.os.Looper.getMainLooper());

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        engine = NativeEngine.get(this); generation = engine.generation;
        if (engine.material == null) { finish(); return; }
        mode = getIntent().getStringExtra("mode");
        try { options = new JSONObject(getIntent().getStringExtra("options")); } catch (Exception error) { finish(); return; }
        ScrollView scroll = new ScrollView(this); LinearLayout content = new LinearLayout(this);
        content.setOrientation(LinearLayout.VERTICAL); int padding = Math.round(20 * getResources().getDisplayMetrics().density); content.setPadding(padding, padding, padding, padding);
        if (Build.VERSION.SDK_INT >= 30) {
            getWindow().setDecorFitsSystemWindows(false);
            scroll.setOnApplyWindowInsetsListener((v, insets) -> { android.graphics.Insets bars = insets.getInsets(android.view.WindowInsets.Type.systemBars() | android.view.WindowInsets.Type.ime()); v.setPadding(bars.left, bars.top, bars.right, bars.bottom); return insets; });
        }
        scroll.addView(content); setContentView(scroll);
        text(content, "wallpaper".equals(mode) ? "仪表自选壁纸" : "手机画面投到仪表", 24);
        text(content, "请停车操作，并保持仪表供电", 16);
        profileInput = new EditText(this); profileInput.setHint("粘贴仪表配对码");
        profileInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        profileInput.setMaxLines(3); profileInput.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(4096) }); content.addView(profileInput);
        status = text(content, "正在检查配对资料", 16);
        try {
            String supplied = options.optString("wifiAddress", "");
            if (!supplied.isEmpty()) { profile = new MeterProfile(supplied); saveProfile(); }
            else { String saved = engine.vault.read("meter-profile"); if (saved != null) { JSONObject stored = new JSONObject(saved); if (scope().equals(stored.optString("scope"))) profile = new MeterProfile(stored.getJSONObject("profile").toString()); } }
        } catch (Exception ignored) { profile = null; }
        setStatus(profile == null ? "缺少配对码，请粘贴后继续" : "配对资料已就绪");
        if ("wallpaper".equals(mode)) {
            int width = options.optInt("width"), height = options.optInt("height");
            text(content, validTemplate() ? "模板分辨率 " + width + " × " + height + "，选择两张照片" : "模板不可用，请重新选择", 16);
            button(content, "选择两张照片", () -> choose(711));
            button(content, "导入壁纸文件", () -> choose(712));
            if (options.has("url")) button(content,"下载原始壁纸",this::downloadOriginal);
            button(content, "发送壁纸", this::confirmWallpaper);
            button(content, "停止本次传输", () -> cancelTransfer(true));
        } else {
            text(content, "允许录屏后开始，可在通知栏停止", 16);
            button(content, "开始投屏", () -> {
                if (!prepareProfile()) return;
                wifiPermission(() -> {
                    if (CastProjectionService.running) { setStatus("已有投屏会话，请先停止。"); return; }
                    MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
                    startActivityForResult(manager.createScreenCaptureIntent(), 713);
                });
            });
            button(content, "停止投屏", () -> { stopService(new Intent(this, CastProjectionService.class)); setStatus("已停止投屏"); });
            handler.post(new Runnable() { @Override public void run() {
                if (destroyed) return; if (CastProjectionService.running) setStatus("投屏状态：" + CastProjectionService.phase + "，请查看仪表画面"); handler.postDelayed(this, 1500);
            } });
        }
        button(content, "清除配对资料", () -> { cancelTransfer(false); stopService(new Intent(this, CastProjectionService.class)); engine.vault.forget("meter-profile"); profile = null; profileInput.setText(""); setStatus("已清除配对资料"); });
        button(content, "返回面板", this::finish);
    }
    private TextView text(LinearLayout parent, String value, int size) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setTextColor(0xff183125); view.setPadding(0, 10, 0, 10); parent.addView(view); return view; }
    private void button(LinearLayout parent, String label, Runnable action) { Button button = new Button(this); button.setText(label); button.setOnClickListener(view -> { if (current()) action.run(); else setStatus("车辆或账号已变化，请返回面板后重新打开。"); }); parent.addView(button); }
    private boolean current() { return !destroyed && generation == engine.generation && engine.material != null; }
    private void setStatus(String text) { runOnUiThread(() -> { if (!destroyed) status.setText(text); }); }
    private String scope() { return engine.material.uid + "|" + engine.material.vin + "|" + engine.material.credentialDigest; }
    private void saveProfile() throws Exception { engine.vault.save("meter-profile", NativeJson.obj("scope", scope(), "profile", profile.json).toString()); }
    private boolean prepareProfile() {
        if (!current() || busy) return false;
        try {
            String input = profileInput.getText().toString().trim();
            if (!input.isEmpty()) { profile = new MeterProfile(input); saveProfile(); profileInput.setText(""); }
            if (profile == null) throw new IllegalArgumentException();
            return true;
        } catch (Exception error) { setStatus("配对码不可用，请重新扫码"); return false; }
    }
    private boolean validTemplate() {
        int width = options.optInt("width"), height = options.optInt("height");
        return options.opt("wallpaperNum") instanceof String && !options.optString("wallpaperNum").trim().isEmpty()
                && options.opt("displayWallpaperSet") instanceof String && !options.optString("displayWallpaperSet").trim().isEmpty()
                && width > 0 && height > 0 && width <= 8192 && height <= 8192 && (long) width * height <= 16777216;
    }
    private void choose(int code) {
        if (busy || !validTemplate()) { setStatus("请先选择壁纸模板"); return; }
        Intent input = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(code == 711 ? "image/*" : "application/zip");
        if (code == 711) input.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(input, code);
    }
    private void downloadOriginal() {
        if (busy || !validTemplate()) return; busy = true; setStatus("正在下载壁纸");
        worker.execute(() -> { File next = null; try {
            next = File.createTempFile("geometry-original-", ".zip",getCacheDir());
            String digest = NativeDownloads.copy(options.getString("url"),next,WallpaperArchive.MAX,true,() -> { if (!current() || Thread.currentThread().isInterrupted()) throw new java.io.IOException("cancelled"); });
            NativeDownloads.validateAsset(options,next,digest); WallpaperArchive.validate(next,options.optInt("width"),options.optInt("height")); File ready = next;
            runOnUiThread(() -> { busy = false; if (!current()) { ready.delete(); return; } if (archive != null) archive.delete(); archive = ready; setStatus("壁纸已就绪，请确认后发送"); });
        } catch (Exception error) { if (next != null) next.delete(); runOnUiThread(() -> { busy = false; setStatus("壁纸下载失败，请重试"); }); } });
    }
    private void wifiPermission(Runnable action) {
        if (permissionContinuation != null) { setStatus("请先完成当前系统权限提示。"); return; }
        ArrayList<String> needed = new ArrayList<>();
        String permission = Build.VERSION.SDK_INT >= 33 ? Manifest.permission.NEARBY_WIFI_DEVICES : Manifest.permission.ACCESS_FINE_LOCATION;
        if (checkSelfPermission(permission) != PackageManager.PERMISSION_GRANTED) needed.add(permission);
        if (Build.VERSION.SDK_INT < 33 && checkSelfPermission(Manifest.permission.ACCESS_COARSE_LOCATION) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.ACCESS_COARSE_LOCATION);
        if (Build.VERSION.SDK_INT >= 33 && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) needed.add(Manifest.permission.POST_NOTIFICATIONS);
        if (needed.isEmpty()) action.run(); else { permissionContinuation = action; requestPermissions(needed.toArray(new String[0]), 714); }
    }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code != 714 || permissionContinuation == null) return;
        Runnable action = permissionContinuation; permissionContinuation = null;
        boolean granted = grants.length > 0; for (int value : grants) granted &= value == PackageManager.PERMISSION_GRANTED;
        if (granted && current()) action.run(); else setStatus("系统未允许附近 Wi-Fi 或通知权限，请允许后再试。");
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (result != RESULT_OK || data == null || !current()) return;
        if (request == 713) {
            if (profile == null) return;
            startForegroundService(new Intent(this, CastProjectionService.class).putExtra("profile", profile.json.toString()).putExtra("resultCode", result).putExtra("projection", data));
            setStatus("正在连接仪表"); return;
        }
        if (request != 711 && request != 712 || busy || !validTemplate()) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        if (uris.size() != (request == 711 ? 2 : 1)) { setStatus("请选择两张照片或壁纸文件"); return; }
        busy = true; setStatus("正在处理图片");
        worker.execute(() -> {
            File next = null;
            try {
                next = File.createTempFile("geometry-wallpaper-", ".zip", getCacheDir());
                if (request == 712) {
                    try (InputStream input = getContentResolver().openInputStream(uris.get(0)); FileOutputStream out = new FileOutputStream(next)) { out.write(WallpaperArchive.bounded(input, WallpaperArchive.MAX)); }
                } else {
                    try (ZipOutputStream out = new ZipOutputStream(new FileOutputStream(next))) {
                        for (int i = 0; i < 2; i++) {
                            Bitmap bitmap = image(uris.get(i), options.optInt("width"), options.optInt("height"));
                            try { out.putNextEntry(new ZipEntry((i + 1) + ".png")); if (!bitmap.compress(Bitmap.CompressFormat.PNG, 100, out)) throw new java.io.IOException(); out.closeEntry(); }
                            finally { bitmap.recycle(); }
                        }
                    }
                }
                WallpaperArchive.validate(next, options.optInt("width"), options.optInt("height"));
                File completed = next;
                runOnUiThread(() -> { busy = false; if (!current()) { completed.delete(); return; } if (archive != null) archive.delete(); archive = completed; setStatus("壁纸已就绪，大小 " + archive.length() + " 字节"); });
            } catch (Exception | OutOfMemoryError error) {
                if (next != null) next.delete(); runOnUiThread(() -> { busy = false; setStatus("图片无法处理，请换较小的图片"); });
            }
        });
    }
    private Bitmap image(Uri uri, int width, int height) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        try (InputStream input = getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(input, null, bounds); }
        if (bounds.outWidth < 1 || bounds.outHeight < 1 || bounds.outWidth > 32768 || bounds.outHeight > 32768) throw new java.io.IOException();
        BitmapFactory.Options decode = new BitmapFactory.Options(); decode.inSampleSize = 1;
        while ((long) (bounds.outWidth / decode.inSampleSize) * (bounds.outHeight / decode.inSampleSize) > 16777216L) decode.inSampleSize = decode.inSampleSize <= 1 ? 2 : decode.inSampleSize * 2;
        // BitmapFactory uses 1 when unset; make the calculation explicit before decoding.
        if (decode.inSampleSize < 1) decode.inSampleSize = 1;
        Bitmap source;
        try (InputStream input = getContentResolver().openInputStream(uri)) { source = BitmapFactory.decodeStream(input, null, decode); }
        if (source == null) throw new java.io.IOException();
        Bitmap target = null;
        try {
            target = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
            double ratio = Math.max((double) width / source.getWidth(), (double) height / source.getHeight());
            int cropWidth = Math.max(1, (int) Math.round(width / ratio)), cropHeight = Math.max(1, (int) Math.round(height / ratio));
            int left = (source.getWidth() - cropWidth) / 2, top = (source.getHeight() - cropHeight) / 2;
            new Canvas(target).drawBitmap(source, new Rect(left, top, left + cropWidth, top + cropHeight), new Rect(0, 0, width, height), new Paint(Paint.FILTER_BITMAP_FLAG));
            return target;
        } catch (RuntimeException | OutOfMemoryError error) { if (target != null) target.recycle(); throw error; }
        finally { source.recycle(); }
    }
    private void confirmWallpaper() {
        if (!prepareProfile()) return;
        if (!validTemplate() || archive == null) { setStatus("请先选择模板和壁纸文件"); return; }
        new AlertDialog.Builder(this).setTitle("确认发送仪表壁纸")
                .setMessage("将向当前车辆的仪表发送两幅 " + options.optInt("width") + " × " + options.optInt("height") + " 图片，请保持仪表供电")
                .setNegativeButton("返回", null).setPositiveButton("连接并发送", (dialog, which) -> wifiPermission(this::startWallpaper)).show();
    }
    private void startWallpaper() {
        if (!current() || busy) return;
        busy = true; setStatus("正在连接仪表");
        connection = new MeterConnection(this, profile, new MeterConnection.Listener() {
            @Override public void ready(MeterConnection ready) {
                if (!current() || !busy) { ready.close(); return; }
                transfer = new WallpaperTransfer(); WallpaperTransfer active = transfer;
                handler.postDelayed(() -> { if (transfer == active && busy) active.close(); }, 120000);
                worker.execute(() -> {
                    try { active.send(ready, archive, options, (sent, size) -> setStatus("正在发送壁纸：" + (sent * 100 / Math.max(1, size)) + "%")); setStatus("已发送，请查看仪表壁纸"); }
                    catch (Exception error) { setStatus(active.requestSent() ? "结果尚未确认，请查看仪表，勿重复发送" : "壁纸未发送，请检查连接和文件"); }
                    finally { ready.close(); runOnUiThread(() -> { if (transfer == active) { transfer = null; busy = false; } if (connection == ready) connection = null; }); }
                });
            }
            @Override public void failed(String reason) { busy = false; setStatus("连接失败，请检查仪表和附近设备权限"); }
        }); connection.connect();
    }
    private void cancelTransfer(boolean report) {
        boolean sent = transfer != null && transfer.requestSent();
        if (transfer != null) transfer.close(); if (connection != null) connection.close(); transfer = null; connection = null; busy = false;
        if (report) setStatus(sent ? "已停止，结果尚未确认，请查看仪表" : "已停止，壁纸未发送");
    }
    @Override protected void onDestroy() {
        destroyed = true; handler.removeCallbacksAndMessages(null); cancelTransfer(false); worker.shutdownNow();
        if (archive != null) archive.delete(); super.onDestroy();
    }
    @Override protected void onStop() {
        if ("wallpaper".equals(mode) && (transfer != null || connection != null)) cancelTransfer(true);
        super.onStop();
    }
}
