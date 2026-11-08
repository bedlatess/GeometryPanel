package app.geometrypanel.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.database.Cursor;
import android.net.ConnectivityManager;
import android.net.LinkAddress;
import android.net.LinkProperties;
import android.net.Network;
import android.net.NetworkCapabilities;
import android.net.Uri;
import android.os.Bundle;
import android.provider.OpenableColumns;
import android.widget.Button;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.json.JSONObject;

/** Local AE5I/Sunplus Gemini protocol only. Selecting a file never starts firmware writes. */
public final class GeminiOtaActivity extends Activity {
    private final ScheduledExecutorService worker = Executors.newScheduledThreadPool(2);
    private volatile Socket socket; private volatile boolean closed, busy, requestSent; private File firmware; private String fileName, md5; private TextView status;
    private volatile long operation; private volatile boolean resumed;
    @Override public void onCreate(Bundle state) {
        super.onCreate(state); getWindow().addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ScrollView scroll = new ScrollView(this); LinearLayout column = new LinearLayout(this); column.setOrientation(LinearLayout.VERTICAL); column.setPadding(28, 48, 28, 32); scroll.addView(column); setContentView(scroll);
        text(column, "AE5I · 5寸仪表升级", 22);
        text(column, "仅适用于这款仪表，请连接自己的车辆热点", 16);
        text(column, "请确认固件来源，停车并保持车辆供电", 15);
        status = text(column, "请选择固件文件", 16);
        button(column, "打开系统 Wi-Fi 设置", () -> startActivity(new Intent(android.provider.Settings.ACTION_WIFI_SETTINGS)));
        button(column, "选择本地 .bin 固件", () -> { if (!busy) startActivityForResult(new Intent(Intent.ACTION_OPEN_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/octet-stream"), 812); });
        button(column, "读取仪表版本并核对", this::query);
        button(column, "停止本次连接", () -> cancel(true)); button(column, "返回面板", this::finish);
    }
    private TextView text(LinearLayout column, String value, int size) { TextView view = new TextView(this); view.setText(value); view.setTextSize(size); view.setPadding(0, 10, 0, 10); column.addView(view); return view; }
    private void button(LinearLayout column, String value, Runnable action) { Button button = new Button(this); button.setText(value); button.setOnClickListener(v -> { if (!closed) action.run(); }); column.addView(button); }
    private void status(String value) { runOnUiThread(() -> { if (!closed) status.setText(value); }); }
    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data); if (request != 812 || result != RESULT_OK || data == null || busy) return;
        Uri uri = data.getData(); if (uri == null || !"content".equals(uri.getScheme())) return;
        String name = ""; try (Cursor cursor = getContentResolver().query(uri, new String[] {OpenableColumns.DISPLAY_NAME}, null, null, null)) { if (cursor != null && cursor.moveToFirst()) name = cursor.getString(0); }
        catch (Exception ignored) { }
        if (!GeminiProtocol.filename(name)) { status("请选择名称合法且以 .bin 结尾的本地文件。"); return; }
        String chosenName = name; long copyEpoch = operation; busy = true; status("正在准备固件文件");
        worker.execute(() -> {
            File next = null;
            try {
                next = File.createTempFile("gemini-ota-", ".bin", getCacheDir()); MessageDigest digest = MessageDigest.getInstance("MD5"); long size = 0;
                try (InputStream input = getContentResolver().openInputStream(uri); FileOutputStream output = new FileOutputStream(next)) { if (input == null) throw new IOException(); byte[] block = new byte[65536]; int read;
                    while ((read = input.read(block)) != -1) { if (closed || copyEpoch != operation || size + read > GeminiProtocol.MAX_FILE) throw new IOException(); output.write(block, 0, read); digest.update(block, 0, read); size += read; }
                    output.getFD().sync();
                }
                if (size <= 0 || copyEpoch != operation) throw new IOException(); if (firmware != null) firmware.delete(); firmware = next; fileName = chosenName; md5 = BleProtocol.hex(digest.digest()); status("固件已就绪");
            } catch (Exception error) { if (next != null) next.delete(); status("文件复制或校验失败，未发送升级请求。"); }
            finally { busy = false; }
        });
    }
    private Socket connect(long epoch) throws Exception {
        if (closed || !resumed || operation != epoch) throw new IOException("cancelled");
        ConnectivityManager connectivity = getSystemService(ConnectivityManager.class); Network chosen = null; InetAddress source = null, peer = InetAddress.getByName("192.168.0.1");
        for (Network network : connectivity.getAllNetworks()) { NetworkCapabilities caps = connectivity.getNetworkCapabilities(network); LinkProperties links = connectivity.getLinkProperties(network);
            if (caps == null || links == null || !caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) || caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)) continue;
            if (chosen != null) throw new IOException("multiple_wifi_networks"); chosen = network;
            for (LinkAddress address : links.getLinkAddresses()) if (MeterRoute.source(address.getAddress(), address.getPrefixLength(), peer)) { if (source != null) throw new IOException("ambiguous_source"); source = address.getAddress(); }
        }
        if (chosen == null || source == null) throw new IOException("meter_wifi_not_selected"); Socket next = chosen.getSocketFactory().createSocket(); socket = next;
        try { if (closed || !resumed || operation != epoch) throw new IOException("cancelled"); next.bind(new InetSocketAddress(source, 0)); next.connect(new InetSocketAddress(peer, 10086), 5000); next.setSoTimeout(5000); if (!source.equals(next.getLocalAddress()) || operation != epoch || !resumed) throw new IOException(); return next; }
        catch (Exception error) { next.close(); throw error; }
    }
    private void query() {
        if (busy || firmware == null) { status("请先选择并检查本地固件。"); return; }
        busy = true; requestSent = false; long epoch = operation; status("正在连接当前仪表热点并查询版本…");
        worker.execute(() -> {
            try { Socket link = connect(epoch); write(link, 0x10000001, new byte[0]); String version = new String(GeminiProtocol.receive(link.getInputStream(), 0x10000001), StandardCharsets.UTF_8).trim();
                if (version.isEmpty() || version.length() > 2048 || version.matches("(?s).*\\p{Cntrl}.*")) throw new IOException();
                runOnUiThread(() -> { if (closed || socket != link || !hasWindowFocus()) { cancel(false); return; }
                    new AlertDialog.Builder(this).setTitle("最后确认 Gemini 升级").setMessage("当前热点仪表版本：" + version + "\n文件：" + fileName + "\nMD5：" + md5 + "\n当前热点不一定是面板所选车辆。确认硬件和固件来源，并保持供电。").setNegativeButton("取消", (d,w) -> cancel(true)).setOnCancelListener(d -> cancel(true)).setPositiveButton("确认发送固件", (d,w) -> worker.execute(() -> transfer(link))).show();
                });
            } catch (Exception error) { cancel(false); status("仪表不兼容或连接未完成，请检查车辆热点"); }
        });
    }
    private void write(Socket link, int command, byte[] body) throws Exception {
        java.util.concurrent.ScheduledFuture<?> deadline = worker.schedule(() -> { try { link.close(); } catch (IOException ignored) { } }, 20, TimeUnit.SECONDS);
        try { if (closed || !resumed || socket != link) throw new IOException(); GeminiProtocol.send(link.getOutputStream(), command, body); }
        finally { deadline.cancel(false); }
    }
    private void transfer(Socket link) {
        try {
            if (closed || socket != link || firmware == null) throw new IOException(); long size = firmware.length();
            JSONObject meta = NativeJson.obj("size", size, "md5", md5, "name", fileName, "type", "gemini"); requestSent = true;
            link.setSoTimeout(15000); write(link, 0x10000003, meta.toString().getBytes(StandardCharsets.UTF_8)); GeminiProtocol.receive(link.getInputStream(), 0x10000004);
            MessageDigest digest = MessageDigest.getInstance("MD5"); long sent = 0;
            try (InputStream input = new FileInputStream(firmware)) { byte[] block = new byte[4096]; int read;
                while ((read = input.read(block)) != -1) { if (sent + read > size) throw new IOException(); byte[] piece = java.util.Arrays.copyOf(block, read); digest.update(piece); write(link, 0x10000005, piece); sent += read; status("固件发送 " + (sent * 100 / size) + "%；请保持仪表供电。"); }
            }
            if (sent != size || !md5.equals(BleProtocol.hex(digest.digest()))) throw new IOException();
            write(link, 0x10000007, new byte[0]); link.setSoTimeout(60000); GeminiProtocol.receive(link.getInputStream(), 0x10000006);
            status("传输结束，请保持供电并核对仪表版本");
        } catch (Exception error) { status(requestSent ? "升级请求已经发出但未确认完成，结果未知。保持供电，先观察仪表状态，避免直接重试。" : "没有开始发送升级请求。"); }
        finally { closeSocket(); busy = false; }
    }
    private void closeSocket() { Socket old = socket; socket = null; if (old != null) try { old.close(); } catch (IOException ignored) { } }
    private void cancel(boolean report) { operation++; closeSocket(); busy = false; if (report) status(requestSent ? "本机连接已停止；升级结果未知，请保持供电并先观察仪表。" : "已停止，没有发送升级请求。"); }
    @Override protected void onResume() { super.onResume(); resumed = true; }
    @Override protected void onStop() { resumed = false; cancel(true); super.onStop(); }
    @Override protected void onDestroy() { closed = true; closeSocket(); worker.shutdownNow(); if (firmware != null) firmware.delete(); super.onDestroy(); }
}
