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
        text(content, "只通过当前车辆的 Wi-Fi Direct 连接。请在停车时操作，并保持仪表供电。协议已按旧版恢复，实际兼容性需要车辆确认。", 16);
        profileInput = new EditText(this); profileInput.setHint("没有配对资料时，在这里粘贴仪表配对码");
        profileInput.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_PASSWORD);
        profileInput.setMaxLines(3); profileInput.setFilters(new android.text.InputFilter[] { new android.text.InputFilter.LengthFilter(4096) }); content.addView(profileInput);
        status = text(content, "正在检查车辆配对资料…", 16);
        try {
            String supplied = options.optString("wifiAddress", "");
            if (!supplied.isEmpty()) { profile = new MeterProfile(supplied); saveProfile(); }
            else { String saved = engine.vault.read("meter-profile"); if (saved != null) { JSONObject stored = new JSONObject(saved); if (scope().equals(stored.optString("scope"))) profile = new MeterProfile(stored.getJSONObject("profile").toString()); } }
        } catch (Exception ignored) { profile = null; }
        setStatus(profile == null ? "缺少可识别的仪表配对码，请粘贴后继续。配对材料只保存在本机。" : "已准备当前车辆的仪表配对资料，不在页面展示口令。");
        if ("wallpaper".equals(mode)) {
            int width = options.optInt("width"), height = options.optInt("height");
            text(content, validTemplate() ? "模板分辨率 " + width + " × " + height + "。选择两张照片，将居中裁切并生成仪表要求的 1.png / 2.png。" : "车辆未提供完整模板编号、显示配置或分辨率。请返回网页选择当前车型的壁纸模板后重开。", 16);
            button(content, "选择两张照片并生成壁纸", () -> choose(711));
            button(content, "选择已有仪表 ZIP", () -> choose(712));
            if (options.has("url")) button(content,"下载此模板的原始壁纸 ZIP",this::downloadOriginal);
            button(content, "连接车辆并发送壁纸", this::confirmWallpaper);
            button(content, "停止本次传输", () -> cancelTransfer(true));
        } else {
            text(content, "投屏前会弹出 Android 系统录屏授权。只发送视频，没有音频或触控反向控制；停止可使用通知栏按钮。", 16);
            button(content, "连接仪表并申请屏幕投送", () -> {
                if (!prepareProfile()) return;
                wifiPermission(() -> {
                    if (CastProjectionService.running) { setStatus("已有投屏会话，请先停止。"); return; }
                    MediaProjectionManager manager = getSystemService(MediaProjectionManager.class);
                    startActivityForResult(manager.createScreenCaptureIntent(), 713);
                });
            });
            button(content, "停止投屏", () -> { stopService(new Intent(this, CastProjectionService.class)); setStatus("已请求停止投屏。"); });
            handler.post(new Runnable() { @Override public void run() {
                if (destroyed) return; if (CastProjectionService.running) setStatus("投屏状态：" + CastProjectionService.phase + "。状态就绪和实际收到画面分开判断。"); handler.postDelayed(this, 1500);
            } });
        }
        button(content, "忘记本机仪表配对资料", () -> { cancelTransfer(false); stopService(new Intent(this, CastProjectionService.class)); engine.vault.forget("meter-profile"); profile = null; profileInput.setText(""); setStatus("已删除本机配对资料，不删除车辆或系统 Wi-Fi 配置。"); });
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
        } catch (Exception error) { setStatus("配对码不完整或不受支持，请使用当前车辆的仪表投屏配对码。"); return false; }
    }
    private boolean validTemplate() {
        int width = options.optInt("width"), height = options.optInt("height");
        return options.opt("wallpaperNum") instanceof String && !options.optString("wallpaperNum").trim().isEmpty()
                && options.opt("displayWallpaperSet") instanceof String && !options.optString("displayWallpaperSet").trim().isEmpty()
                && width > 0 && height > 0 && width <= 8192 && height <= 8192 && (long) width * height <= 16777216;
    }
    private void choose(int code) {
        if (busy || !validTemplate()) { setStatus("请先准备当前车型的完整壁纸模板。"); return; }
        Intent input = new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(code == 711 ? "image/*" : "application/zip");
        if (code == 711) input.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
        startActivityForResult(input, code);
    }
    private void downloadOriginal() {
        if (busy || !validTemplate()) return; busy = true; setStatus("正在下载原始模板 ZIP 并校验，没有连接或发送仪表。");
        worker.execute(() -> { File next = null; try {
            next = File.createTempFile("geometry-original-", ".zip",getCacheDir());
            String digest = NativeDownloads.copy(options.getString("url"),next,WallpaperArchive.MAX,true,() -> { if (!current() || Thread.currentThread().isInterrupted()) throw new java.io.IOException("cancelled"); });
            NativeDownloads.validateAsset(options,next,digest); WallpaperArchive.validate(next,options.optInt("width"),options.optInt("height")); File ready = next;
            runOnUiThread(() -> { busy = false; if (!current()) { ready.delete(); return; } if (archive != null) archive.delete(); archive = ready; setStatus("原始模板 ZIP 校验通过。可继续连接并手动确认发送，尚未写入仪表。"); });
        } catch (Exception error) { if (next != null) next.delete(); runOnUiThread(() -> { busy = false; setStatus("原始 ZIP 下载或校验失败，没有发送仪表请求。"); }); } });
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
            setStatus("已获得本次系统授权，正在连接当前仪表。"); return;
        }
        if (request != 711 && request != 712 || busy || !validTemplate()) return;
        ArrayList<Uri> uris = new ArrayList<>();
        if (data.getClipData() != null) for (int i = 0; i < data.getClipData().getItemCount(); i++) uris.add(data.getClipData().getItemAt(i).getUri());
        else if (data.getData() != null) uris.add(data.getData());
        if (uris.size() != (request == 711 ? 2 : 1)) { setStatus("请选择两张照片，或一个仪表 ZIP。"); return; }
        busy = true; setStatus("正在本机处理并检查图片，不会上传到网页服务器。");
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
                runOnUiThread(() -> { busy = false; if (!current()) { completed.delete(); return; } if (archive != null) archive.delete(); archive = completed; setStatus("两幅 PNG 和 ZIP 结构检查通过，已准备 " + archive.length() + " 字节。尚未向车辆发送。"); });
            } catch (Exception | OutOfMemoryError error) {
                if (next != null) next.delete(); runOnUiThread(() -> { busy = false; setStatus("本地文件不符合模板或手机内存不足。可选两张较小照片重新生成；没有发送车辆请求。"); });
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
        if (!validTemplate() || archive == null) { setStatus("请先选择模板并生成或选择壁纸 ZIP。"); return; }
        new AlertDialog.Builder(this).setTitle("确认发送仪表壁纸")
                .setMessage("将向当前车辆的仪表发送两幅 " + options.optInt("width") + " × " + options.optInt("height") + " 图片。请保持停车和仪表供电；传输开始后取消可能留下结果未知。")
                .setNegativeButton("返回", null).setPositiveButton("连接并发送", (dialog, which) -> wifiPermission(this::startWallpaper)).show();
    }
    private void startWallpaper() {
        if (!current() || busy) return;
        busy = true; setStatus("正在连接与当前车辆配对信息匹配的 Wi-Fi Direct 仪表…");
        connection = new MeterConnection(this, profile, new MeterConnection.Listener() {
            @Override public void ready(MeterConnection ready) {
                if (!current() || !busy) { ready.close(); return; }
                transfer = new WallpaperTransfer(); WallpaperTransfer active = transfer;
                handler.postDelayed(() -> { if (transfer == active && busy) active.close(); }, 120000);
                worker.execute(() -> {
                    try { active.send(ready, archive, options, (sent, size) -> setStatus("正在发送壁纸：" + (sent * 100 / Math.max(1, size)) + "%")); setStatus("已收到仪表最终校验响应，请观察仪表是否换图；不把传输响应当作实车显示验收。"); }
                    catch (Exception error) { setStatus(active.requestSent() ? "传输已开始但未确认完成，结果未知。请先观察仪表，避免立即重复发送。" : "连接或文件检查未完成，没有开始发送壁纸。"); }
                    finally { ready.close(); runOnUiThread(() -> { if (transfer == active) { transfer = null; busy = false; } if (connection == ready) connection = null; }); }
                });
            }
            @Override public void failed(String reason) { busy = false; setStatus("未能建立匹配当前车辆的 Wi-Fi Direct 连接。请打开仪表连接页面、手机 Wi-Fi 和附近设备权限后重试。"); }
        }); connection.connect();
    }
    private void cancelTransfer(boolean report) {
        boolean sent = transfer != null && transfer.requestSent();
        if (transfer != null) transfer.close(); if (connection != null) connection.close(); transfer = null; connection = null; busy = false;
        if (report) setStatus(sent ? "已停止本机传输；车辆是否应用壁纸尚未确认，请先观察仪表。" : "已停止，未开始发送壁纸。");
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
