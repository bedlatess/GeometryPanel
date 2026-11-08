package app.geometrypanel.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.core.content.FileProvider;
import com.google.zxing.BinaryBitmap;
import com.google.zxing.DecodeHintType;
import com.google.zxing.MultiFormatReader;
import com.google.zxing.RGBLuminanceSource;
import com.google.zxing.common.HybridBinarizer;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import org.json.JSONObject;

/** Native tools own their file/permission/installation flows; no local file or QR payload is logged. */
public final class NativeToolActivity extends Activity {
    static final ExecutorService JOBS = Executors.newSingleThreadExecutor();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private volatile boolean closed, busy; private TextView status; private File pendingFile, cameraFile; private byte[] pendingBytes; private String scanText, tool; private JSONObject options;
    static void open(Activity activity, String tool, JSONObject options) { activity.startActivity(new Intent(activity, NativeToolActivity.class).putExtra("tool", tool).putExtra("options", options == null ? "{}" : options.toString())); }
    static void openPanelImage(Activity activity, String data, NativeJson.Result reply, java.util.function.BooleanSupplier current) {
        JOBS.execute(() -> { File file = null; try {
            byte[] png = PanelImage.decode(data); WallpaperArchive.validatePng(png,0,0);
            Bitmap decoded = BitmapFactory.decodeByteArray(png,0,png.length); if (decoded == null) throw new IOException(); decoded.recycle();
            File directory = new File(activity.getCacheDir(), "panel-image"); if (!directory.isDirectory() && !directory.mkdirs()) throw new IOException();
            file = File.createTempFile("status-", ".png", directory); try (FileOutputStream output = new FileOutputStream(file)) { output.write(png); }
            File ready = file;
            activity.runOnUiThread(() -> { if (!current.getAsBoolean()) { ready.delete(); return; } open(activity,"panelImage",NativeJson.obj("file",ready.getName())); reply.finish(NativeJson.obj("opened",true),null); });
        } catch (Exception error) { if (file != null) file.delete(); reply.finish(null,"invalid_panel_image"); } });
    }
    @Override public void onCreate(Bundle saved) {
        super.onCreate(saved); tool = getIntent().getStringExtra("tool");
        try { options = new JSONObject(getIntent().getStringExtra("options")); } catch (Exception ignored) { options = new JSONObject(); }
        ScrollView scroll = new ScrollView(this); LinearLayout content = new LinearLayout(this); content.setOrientation(LinearLayout.VERTICAL); content.setPadding(28, 48, 28, 32); scroll.addView(content); setContentView(scroll);
        status = new TextView(this); status.setTextSize(17); status.setPadding(0, 12, 0, 16); content.addView(status);
        if ("scanner".equals(tool)) {
            status.setText("扫描仪表上的配对码");
            button(content, "拍摄二维码", this::camera); button(content, "选择二维码图片", () -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"), 902));
            button(content, "复制扫码内容", () -> { if (scanText == null) return; new AlertDialog.Builder(this).setTitle("复制扫码内容").setMessage("配对码含车辆信息，请勿分享").setNegativeButton("返回", null).setPositiveButton("复制", (d,w) -> { getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("本机二维码", scanText)); status("已复制"); }).show(); });
        } else if ("wallpaperZip".equals(tool)) {
            status.setText("选择壁纸文件");
            button(content, "选择壁纸文件", () -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip"), 903));
        } else if ("asset".equals(tool)) {
            status.setText("下载并保存壁纸"); button(content, "下载并保存", this::asset);
        } else if ("panelImage".equals(tool)) {
            status.setText("保存车况图片");
            String name = options.optString("file", ""); if (!name.matches("status-[A-Za-z0-9-]+\\.png")) { finish(); return; }
            pendingFile = new File(new File(getCacheDir(),"panel-image"),name);
            button(content, "保存车况图片", () -> export("geometry-status.png", "image/png", pendingFile, null));
        } else if ("diagnostics".equals(tool)) {
            status.setText("导出排查记录，不含登录信息");
            button(content, "导出诊断信息", () -> execute(() -> export("GeometryPanel-diagnostics.json", "application/json", null, NativeExports.diagnostics(this))));
        } else if ("keepalive".equals(tool)) {
            status.setText("导出后，在系统管理工具中安装");
            button(content, "导出常驻模块", () -> execute(() -> export("GeometryPanel-keepalive.zip", "application/zip", NativeExports.keepalive(this), null)));
        } else if ("updates".equals(tool)) {
            status.setText("检查并安装新版几何面板");
            button(content, "检查更新", () -> execute(() -> { JSONObject result = NativeUpdates.check(); status(result.optBoolean("available") ? "发现版本 " + result.optString("version") + "，可下载核对。" : "已是最新版本"); }));
            button(content, "安装新版", () -> new AlertDialog.Builder(this).setTitle("下载本项目更新").setMessage("下载完成后，按系统提示安装").setNegativeButton("返回", null).setPositiveButton("继续", (d,w) -> execute(() -> install(NativeUpdates.download(this, this::check)))).show());
            button(content,"查看离线数据",() -> { JSONObject cache = PanelCache.status(this); status(cache.optBoolean("available") ? "本机完整快照：" + cache.optInt("files") + " 个静态文件，" + cache.optLong("bytes") + " 字节，更新时间 " + android.text.format.DateFormat.format("MM-dd HH:mm",cache.optLong("at")) + "。来源固定为本项目正式站点。" : "离线数据未就绪，请联网打开"); });
            button(content,"更新离线数据",() -> execute(() -> { PanelCache.refresh(this); status("离线数据已更新"); }));
            button(content,"清除离线数据",() -> new AlertDialog.Builder(this).setTitle("清除离线数据").setMessage("清除离线数据，保留账号和偏好").setNegativeButton("返回",null).setPositiveButton("清除",(d,w) -> { PanelCache.clear(this); status("离线数据已清除"); }).show());
        } else if ("officialLogin".equals(tool)) {
            status.setText("连接极核 App 后返回读取结果");
            button(content, "准备登录证书", () -> OfficialLogin.prepareCertificate(this));
            button(content, "开始连接", () -> OfficialLogin.start(this));
            button(content, "打开官方极核 App", () -> { Intent launch = getPackageManager().getLaunchIntentForPackage("com.cfmoto"); if (launch == null) status("未安装极核 App"); else startActivity(launch); });
            button(content, "停止连接", () -> { OfficialLogin.stop(this); status("已停止连接"); });
            button(content, "读取连接结果", () -> status(OfficialLogin.message(this)));
        } else { finish(); return; }
        button(content, "返回面板", this::finish);
    }
    private void button(LinearLayout content, String name, Runnable action) { Button button = new Button(this); button.setText(name); button.setOnClickListener(v -> { if (!closed && !busy) try { action.run(); } catch (RuntimeException error) { status("系统暂未提供此操作，请检查对应应用和权限。"); } }); content.addView(button); }
    private interface Work { void run() throws Exception; }
    private void execute(Work action) { if (busy) return; busy = true; worker.execute(() -> { try { check(); action.run(); } catch (Exception | OutOfMemoryError error) { status("未完成，请检查网络、文件或权限"); } finally { busy = false; } }); }
    private void check() throws IOException { if (closed || Thread.currentThread().isInterrupted()) throw new IOException("cancelled"); }
    private void status(String value) { runOnUiThread(() -> { if (!closed) status.setText(value); }); }
    private void export(String name, String mime, File file, byte[] bytes) { runOnUiThread(() -> { if (closed) { if (file != null) file.delete(); return; } if (pendingFile != null && !pendingFile.equals(file)) pendingFile.delete(); pendingFile = file; pendingBytes = bytes; startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType(mime).putExtra(Intent.EXTRA_TITLE, name), 901); }); }
    private void camera() {
        try { File folder = new File(getCacheDir(), "scanner"); if (!folder.isDirectory() && !folder.mkdirs()) throw new IOException(); cameraFile = File.createTempFile("qr-", ".jpg", folder); Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", cameraFile);
            Intent photo = new Intent(MediaStore.ACTION_IMAGE_CAPTURE).putExtra(MediaStore.EXTRA_OUTPUT, uri).addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION); photo.setClipData(ClipData.newRawUri("QR photo", uri)); startActivityForResult(photo, 904);
        } catch (Exception error) { status("系统相机不可用，可选择一张本机二维码图片。"); }
    }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data); if (OfficialLogin.onActivityResult(this, request, result, data)) return;
        if (result != RESULT_OK) return;
        if (request == 901 && data != null && data.getData() != null) { Uri uri = data.getData(); execute(() -> {
            try (OutputStream output = getContentResolver().openOutputStream(uri, "w")) { if (output == null) throw new IOException();
                if (pendingBytes != null) output.write(pendingBytes); else if (pendingFile != null) try (InputStream input = new java.io.FileInputStream(pendingFile)) { byte[] block = new byte[65536]; int read; while ((read = input.read(block)) != -1) { check(); output.write(block, 0, read); } }
                else throw new IOException();
            }
            if (pendingFile != null) pendingFile.delete(); pendingFile = null; pendingBytes = null; status("已交系统保存到你选择的位置。");
        }); }
        if ((request == 902 || request == 904) && (request == 904 && cameraFile != null || data != null && data.getData() != null)) {
            Uri uri = request == 904 ? Uri.fromFile(cameraFile) : data.getData(); execute(() -> decode(uri));
        }
        if (request == 903 && data != null && data.getData() != null) { Uri uri = data.getData(); execute(() -> {
            File file = File.createTempFile("checked-wallpaper-", ".zip", getCacheDir()); try (InputStream input = getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(file)) { if (input == null) throw new IOException(); output.write(WallpaperArchive.bounded(input, WallpaperArchive.MAX)); }
            try { String digest = WallpaperArchive.validate(file, 0, 0); status("壁纸文件可用，大小 " + file.length() + " 字节，校验码 " + digest + "。尚未向车辆发送。"); } finally { file.delete(); }
        }); }
    }
    private void decode(Uri uri) throws Exception {
        BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
        try (InputStream input = uri.getScheme().equals("file") ? new java.io.FileInputStream(cameraFile) : getContentResolver().openInputStream(uri)) { BitmapFactory.decodeStream(input, null, bounds); }
        if (bounds.outWidth < 1 || bounds.outHeight < 1 || bounds.outWidth > 32768 || bounds.outHeight > 32768) throw new IOException();
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inSampleSize = 1; while ((long)(bounds.outWidth / options.inSampleSize) * (bounds.outHeight / options.inSampleSize) > 4194304) options.inSampleSize *= 2;
        Bitmap image; try (InputStream input = uri.getScheme().equals("file") ? new java.io.FileInputStream(cameraFile) : getContentResolver().openInputStream(uri)) { image = BitmapFactory.decodeStream(input, null, options); }
        if (image == null) throw new IOException();
        try { int[] pixels = new int[image.getWidth() * image.getHeight()]; image.getPixels(pixels, 0, image.getWidth(), 0, 0, image.getWidth(), image.getHeight());
            String decoded = new MultiFormatReader().decode(new BinaryBitmap(new HybridBinarizer(new RGBLuminanceSource(image.getWidth(), image.getHeight(), pixels))), Map.of(DecodeHintType.TRY_HARDER, Boolean.TRUE)).getText();
            if (decoded == null || decoded.isEmpty() || decoded.length() > 8192) throw new IOException(); scanText = decoded;
            try { MeterProfile profile = new MeterProfile(decoded); NativeEngine engine = NativeEngine.get(this); if (engine.material == null || !engine.material.fresh(System.currentTimeMillis())) throw new IOException();
                engine.vault.save("meter-profile", NativeJson.obj("scope", engine.material.uid + "|" + engine.material.vin + "|" + engine.material.credentialDigest, "profile", profile.json).toString()); status("配对码已保存");
            } catch (Exception unsupported) { status("已识别，配对码不匹配，可复制查看"); }
        } finally { image.recycle(); if (cameraFile != null) cameraFile.delete(); }
    }
    private void asset() { execute(() -> { NativeDownloads.wallpaper(options.getString("url")); File file = File.createTempFile("wallpaper-download-", ".zip", getCacheDir());
        try { String md5 = NativeDownloads.copy(options.getString("url"), file, WallpaperArchive.MAX, true, this::check); NativeDownloads.validateAsset(options, file, md5); export(options.optString("fileName", "wallpaper.zip"), "application/zip", file, null); }
        catch (Exception error) { file.delete(); throw error; }
    }); }
    private void install(File apk) { runOnUiThread(() -> { if (closed) return; if (!getPackageManager().canRequestPackageInstalls()) { status("请在系统设置中允许安装更新"); startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); return; }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", apk); startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
    }); }
    @Override protected void onDestroy() { closed = true; worker.shutdownNow(); if (pendingFile != null) pendingFile.delete(); if (cameraFile != null) cameraFile.delete(); pendingBytes = null; scanText = null; super.onDestroy(); }
}
