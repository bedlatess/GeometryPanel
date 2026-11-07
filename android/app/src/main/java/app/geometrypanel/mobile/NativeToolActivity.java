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
            status.setText("二维码扫描：拍摄清晰照片或选择本机图片，识别过程在本机完成。仪表配对码会保存到当前车辆的加密资料。");
            button(content, "拍摄二维码", this::camera); button(content, "选择二维码图片", () -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("image/*"), 902));
            button(content, "复制最近二维码内容", () -> { if (scanText == null) return; new AlertDialog.Builder(this).setTitle("复制本机二维码内容").setMessage("内容可能含车辆配对口令，请只粘贴到自己需要的应用。").setNegativeButton("返回", null).setPositiveButton("复制", (d,w) -> { getSystemService(ClipboardManager.class).setPrimaryClip(ClipData.newPlainText("本机二维码", scanText)); status("已复制到本机剪贴板。"); }).show(); });
        } else if ("wallpaperZip".equals(tool)) {
            status.setText("原壁纸 ZIP：可选择本地文件检查 1.png/2.png、PNG 尺寸、CRC 与容器边界。向仪表发送请在面板选择实际车型模板后进入仪表壁纸。");
            button(content, "选择本地仪表 ZIP 并检查", () -> startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/zip"), 903));
        } else if ("asset".equals(tool)) {
            status.setText("将从旧版白名单对象存储下载所选原壁纸 ZIP，校验大小、MD5 和 ZIP/PNG 后交系统保存。"); button(content, "下载、检查并保存", this::asset);
        } else if ("panelImage".equals(tool)) {
            status.setText("保存面板生成的车况 PNG，不读取网页截图或登录资料。");
            String name = options.optString("file", ""); if (!name.matches("status-[A-Za-z0-9-]+\\.png")) { finish(); return; }
            pendingFile = new File(new File(getCacheDir(),"panel-image"),name);
            button(content, "保存车况图片", () -> export("geometry-status.png", "image/png", pendingFile, null));
        } else if ("diagnostics".equals(tool)) {
            status.setText("诊断仅包含版本、Android API、后台状态、轮询时间与脱敏错误，不包含账号、车辆标识、位置、消息、二维码或钥匙材料。");
            button(content, "导出本机脱敏诊断", () -> execute(() -> export("GeometryPanel-diagnostics.json", "application/json", null, NativeExports.diagnostics(this))));
        } else if ("keepalive".equals(tool)) {
            status.setText("可选 Magisk/KernelSU 保活模块，只针对本包。导出不会安装或申请 root；需要自行在管理器安装。模块保留原手机策略的备份和卸载恢复。");
            button(content, "导出本包保活模块 ZIP", () -> execute(() -> export("GeometryPanel-keepalive.zip", "application/zip", NativeExports.keepalive(this), null)));
        } else if ("updates".equals(tool)) {
            status.setText("从本项目 GitHub 已发布 Release 检查 Android 更新，包含验收预发布版。下载后核对包名、版本和当前安装签名，再交系统安装器确认。");
            button(content, "检查最新已发布 APK", () -> execute(() -> { JSONObject result = NativeUpdates.check(); status(result.optBoolean("available") ? "发现版本 " + result.optString("version") + "，可下载核对。" : "当前已是最新可用版本。"); }));
            button(content, "下载并交系统安装", () -> new AlertDialog.Builder(this).setTitle("下载本项目更新").setMessage("只使用已核对的本仓库候选，下载完成后仍需系统安装确认。").setNegativeButton("返回", null).setPositiveButton("继续", (d,w) -> execute(() -> install(NativeUpdates.download(this, this::check)))).show());
            button(content,"查看正式网页本机快照",() -> { JSONObject cache = PanelCache.status(this); status(cache.optBoolean("available") ? "本机完整快照：" + cache.optInt("files") + " 个静态文件，" + cache.optLong("bytes") + " 字节，更新时间 " + android.text.format.DateFormat.format("MM-dd HH:mm",cache.optLong("at")) + "。来源固定为本项目正式站点。" : "暂无本机完整快照，首次打开需要联网。"); });
            button(content,"刷新正式网页本机快照",() -> execute(() -> { PanelCache.refresh(this); status("正式网页的完整静态文件已校验并保存，可在加载失败时回退；下次重新打开使用最新网页。"); }));
            button(content,"清除本机网页快照",() -> new AlertDialog.Builder(this).setTitle("清除静态网页快照").setMessage("只清原生容器保存的公开 HTML/JS/CSS/图标，不涉及面板账号和车辆。网页自己的离线缓存仍由网页更新管理。").setNegativeButton("返回",null).setPositiveButton("清除",(d,w) -> { PanelCache.clear(this); status("已清除原生静态网页快照。"); }).show());
        } else if ("officialLogin".equals(tool)) {
            status.setText("官方 App 登录捕获：仅在你主动开始后临时路由 com.cfmoto 的流量，解析极核 H5 登录资料；原始资料只保存在本机加密库，随时可停止。");
            button(content, "准备证书并查看系统信任说明", () -> OfficialLogin.prepareCertificate(this));
            button(content, "开始临时官方登录捕获", () -> OfficialLogin.start(this));
            button(content, "打开官方极核 App", () -> { Intent launch = getPackageManager().getLaunchIntentForPackage("com.cfmoto"); if (launch == null) status("未安装官方 com.cfmoto 应用。"); else startActivity(launch); });
            button(content, "停止捕获", () -> { OfficialLogin.stop(this); status("已请求停止临时捕获。"); });
            button(content, "查看捕获状态", () -> status(OfficialLogin.message(this)));
        } else { finish(); return; }
        button(content, "返回面板", this::finish);
    }
    private void button(LinearLayout content, String name, Runnable action) { Button button = new Button(this); button.setText(name); button.setOnClickListener(v -> { if (!closed && !busy) try { action.run(); } catch (RuntimeException error) { status("系统暂未提供此操作，请检查对应应用和权限。"); } }); content.addView(button); }
    private interface Work { void run() throws Exception; }
    private void execute(Work action) { if (busy) return; busy = true; worker.execute(() -> { try { check(); action.run(); } catch (Exception | OutOfMemoryError error) { status("操作没有完成；请检查网络、文件或系统权限。没有自动重试。"); } finally { busy = false; } }); }
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
            try { String digest = WallpaperArchive.validate(file, 0, 0); status("ZIP 与两幅 PNG 结构检查通过，大小 " + file.length() + " 字节，MD5 " + digest + "。尚未向车辆发送。"); } finally { file.delete(); }
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
                engine.vault.save("meter-profile", NativeJson.obj("scope", engine.material.uid + "|" + engine.material.vin + "|" + engine.material.credentialDigest, "profile", profile.json).toString()); status("已识别仪表配对码并保存到当前车辆的加密资料，未发起仪表连接。");
            } catch (Exception unsupported) { status("已在本机识别二维码。此内容不是当前可导入的仪表配对码，可按需复制；不会自动打开未知链接。"); }
        } finally { image.recycle(); if (cameraFile != null) cameraFile.delete(); }
    }
    private void asset() { execute(() -> { NativeDownloads.wallpaper(options.getString("url")); File file = File.createTempFile("wallpaper-download-", ".zip", getCacheDir());
        try { String md5 = NativeDownloads.copy(options.getString("url"), file, WallpaperArchive.MAX, true, this::check); NativeDownloads.validateAsset(options, file, md5); export(options.optString("fileName", "wallpaper.zip"), "application/zip", file, null); }
        catch (Exception error) { file.delete(); throw error; }
    }); }
    private void install(File apk) { runOnUiThread(() -> { if (closed) return; if (!getPackageManager().canRequestPackageInstalls()) { status("请在系统允许本应用安装更新，再返回点击下载并安装。"); startActivity(new Intent(android.provider.Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getPackageName()))); return; }
        Uri uri = FileProvider.getUriForFile(this, getPackageName() + ".files", apk); startActivity(new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive").addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION));
    }); }
    @Override protected void onDestroy() { closed = true; worker.shutdownNow(); if (pendingFile != null) pendingFile.delete(); if (cameraFile != null) cameraFile.delete(); pendingBytes = null; scanText = null; super.onDestroy(); }
}
