package app.geometrypanel.mobile;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.hardware.display.DisplayManager;
import android.hardware.display.VirtualDisplay;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaFormat;
import android.media.projection.MediaProjection;
import android.media.projection.MediaProjectionManager;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.view.Surface;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.ServerSocket;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.UUID;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import javax.crypto.Cipher;
import org.json.JSONObject;

/** Recovered three-channel, vehicle-pull H.264 protocol. No audio, HID, touch or arbitrary TCP bridge. */
public final class CastProjectionService extends Service {
    static volatile boolean running;
    static volatile String phase = "idle";
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService workers = Executors.newFixedThreadPool(5);
    private final ArrayList<ServerSocket> listeners = new ArrayList<>();
    private final ArrayList<Socket> peers = new ArrayList<>();
    private final ArrayBlockingQueue<byte[]> frames = new ArrayBlockingQueue<>(4);
    private final AtomicInteger sequence = new AtomicInteger();
    private final Object encoderLock = new Object();
    private NativeEngine engine;
    private long generation, lastKeyRequest;
    private MeterProfile profile;
    private MeterConnection connection;
    private MediaProjection projection;
    private VirtualDisplay display;
    private MediaCodec encoder;
    private Surface surface;
    private byte[] codecConfig = new byte[0];
    private volatile boolean active, encoding, extended;
    private volatile int width = 800, height = 480, fps = 20, bitrate = 1500000;
    private volatile boolean configured;
    private final String phoneId = UUID.randomUUID().toString();
    private KeyPair keyPair;

    @Override public void onCreate() { super.onCreate(); engine = NativeEngine.get(this); }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || "stop".equals(intent.getAction())) { stopSelf(); return START_NOT_STICKY; }
        if (active) return START_NOT_STICKY;
        try {
            if (engine.material == null) throw new IllegalArgumentException();
            profile = new MeterProfile(intent.getStringExtra("profile")); generation = engine.generation;
            Intent grant = intent.getParcelableExtra("projection");
            if (grant == null || intent.getIntExtra("resultCode", 0) != android.app.Activity.RESULT_OK) throw new IllegalArgumentException();
            PendingIntent stop = PendingIntent.getService(this, 8, new Intent(this, CastProjectionService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            startForeground(520, NativeNotifications.builder(this, "geometry-cast", "仪表屏幕投送", "正在连接仪表；通知栏可随时停止屏幕采集。")
                    .setOngoing(true).addAction(new Notification.Action.Builder(null, "停止投屏", stop).build()).build());
            projection = getSystemService(MediaProjectionManager.class).getMediaProjection(android.app.Activity.RESULT_OK, grant);
            projection.registerCallback(new MediaProjection.Callback() { @Override public void onStop() { stopSession("system_stopped"); } }, main);
            active = running = true; phase = "连接仪表";
            connection = new MeterConnection(this, profile, new MeterConnection.Listener() {
                @Override public void ready(MeterConnection ready) { workers.execute(() -> handshake(ready)); }
                @Override public void failed(String reason) { stopSession(reason); }
            });
            connection.connect();
            main.postDelayed(new Runnable() { @Override public void run() {
                if (!active) return;
                if (generation != engine.generation || engine.material == null) { stopSession("vehicle_changed"); return; }
                main.postDelayed(this, 1000);
            } }, 1000);
        } catch (Exception error) { stopSession("capture_permission_or_profile_failed"); }
        return START_NOT_STICKY;
    }
    private boolean valid() { return active && engine.generation == generation && connection != null && connection.valid(); }
    private void handshake(MeterConnection link) {
        try {
            try (Socket probe = link.socket(10930)) {
                probe.getOutputStream().write(MeterProtocol.control(0x70000010, NativeJson.obj("phoneType", "Android", "packageName", getPackageName()).toString().getBytes(StandardCharsets.UTF_8)));
                probe.getOutputStream().flush();
                MeterProtocol.Frame reply = MeterProtocol.control(probe.getInputStream());
                if (reply.command != 0x70000011 || !Boolean.TRUE.equals(new JSONObject(new String(reply.payload, StandardCharsets.UTF_8)).opt("status"))) throw new IOException("cast_probe_rejected");
            }
            if (!valid()) return;
            phase = "等待仪表媒体协商";
            listen(10920, this::frameChannel); listen(10921, this::mediaChannel); listen(10922, this::controlChannel);
            main.postDelayed(() -> { if (active && !encoding) stopSession("vehicle_did_not_start_capture"); }, 30000);
        } catch (Exception error) { stopSession("cast_handshake_failed"); }
    }
    private interface Channel { void run(Socket socket) throws Exception; }
    private void listen(int port, Channel channel) throws Exception {
        ServerSocket server = new ServerSocket(); server.setReuseAddress(true); server.bind(new java.net.InetSocketAddress(connection.local(), port), 2); server.setSoTimeout(30000);
        synchronized (listeners) { if (!valid()) { server.close(); return; } listeners.add(server); }
        workers.execute(() -> {
            try {
                while (valid()) {
                    Socket socket = server.accept();
                    if (!socket.getInetAddress().equals(connection.owner())) { socket.close(); continue; }
                    socket.setSoTimeout(30000); socket.setTcpNoDelay(true);
                    synchronized (peers) { if (!valid()) { socket.close(); return; } peers.add(socket); }
                    try { channel.run(socket); } finally { socket.close(); synchronized (peers) { peers.remove(socket); } }
                    if (valid()) stopSession("vehicle_channel_disconnected");
                    return;
                }
            } catch (Exception error) { if (active) stopSession("cast_channel_closed"); }
        });
    }
    private void controlChannel(Socket socket) throws Exception {
        InputStream input = socket.getInputStream(); OutputStream output = socket.getOutputStream();
        while (valid()) {
            MeterProtocol.Frame frame = MeterProtocol.control(input); int command = frame.command;
            switch (command) {
                case 0x00010000: case 0x000106d0: case 0x00020000: case 0x70000000: case 0x00010780:
                    output.write(MeterProtocol.control(command + 1, new byte[0])); break;
                case 0x00010010:
                    JSONObject request = new JSONObject(new String(frame.payload, StandardCharsets.UTF_8));
                    String huid = request.optString("HUID", request.optString("huid", ""));
                    if (huid.isEmpty() || huid.getBytes(StandardCharsets.UTF_8).length > 117) throw new IOException("huid_invalid");
                    KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA"); generator.initialize(1024); keyPair = generator.generateKeyPair();
                    Cipher cipher = Cipher.getInstance("RSA/ECB/PKCS1Padding"); cipher.init(Cipher.ENCRYPT_MODE, keyPair.getPrivate());
                    JSONObject info = NativeJson.obj("pxcVersion", "1.0.2", "phoneUUID", phoneId, "phoneBrand", Build.BRAND, "phoneModel", Build.MODEL,
                            "phoneOsVersion", Build.VERSION.RELEASE, "phoneOs", "Android", "package", getPackageName(), "packageName", getPackageName(),
                            "versionCode", BuildConfig.VERSION_CODE, "token", 0, "pubkey", android.util.Base64.encodeToString(keyPair.getPublic().getEncoded(), android.util.Base64.NO_WRAP),
                            "encryptedHUID", android.util.Base64.encodeToString(cipher.doFinal(huid.getBytes(StandardCharsets.UTF_8)), android.util.Base64.NO_WRAP),
                            "bluetoothName", "ZEEHO VehicleCast", "supportH264IFrame", true, "supportScreenTouch", false, "supportHID", false,
                            "supportFunction", 0, "appVersionFingerPrint", Build.FINGERPRINT);
                    output.write(MeterProtocol.control(0x00010011, info.toString().getBytes(StandardCharsets.UTF_8))); break;
                case 0x000103e0:
                    JSONObject serial = frame.payload.length == 0 ? new JSONObject() : new JSONObject(new String(frame.payload, StandardCharsets.UTF_8));
                    String sn = serial.optString("sn", "");
                    if (!profile.serial.isEmpty() && !profile.serial.equals(sn)) throw new IOException("meter_serial_mismatch");
                    output.write(MeterProtocol.control(0x000103e1, new byte[0]));
                    output.write(MeterProtocol.control(0x000201c0, NativeJson.obj("isOk", true, "errCode", 0, "errMsg", "", "id", sn, "sn", sn,
                            "client_set", serial.optString("client_set", "vehicle_cast")).toString().getBytes(StandardCharsets.UTF_8))); break;
                case 0x00030020: if (configured) startEncoder(); break;
                case 0x80000010: break;
                default: break; // No undocumented command is synthesized.
            }
            output.flush();
        }
    }
    private void mediaChannel(Socket socket) throws Exception {
        InputStream input = socket.getInputStream(); OutputStream output = socket.getOutputStream();
        while (valid()) {
            MeterProtocol.Frame frame = MeterProtocol.media(input); byte[] response;
            switch (frame.command) {
                case 0x10:
                    if (encoding || frame.payload.length < 30) throw new IOException("media_configuration_invalid");
                    ByteBuffer config = ByteBuffer.wrap(frame.payload).order(ByteOrder.LITTLE_ENDIAN);
                    int requestedWidth = config.getShort(0) & 65535, requestedHeight = config.getShort(2) & 65535;
                    int codec = config.getInt(8); if (codec != 0 && codec != 2 || requestedWidth < 16 || requestedHeight < 16 || requestedWidth > 4096 || requestedHeight > 4096) throw new IOException("media_codec_or_size_unsupported");
                    double scale = Math.min(1.0, Math.min(1280.0 / requestedWidth, 720.0 / requestedHeight));
                    width = Math.max(16, ((int) (requestedWidth * scale) / 16) * 16); height = Math.max(16, ((int) (requestedHeight * scale) / 16) * 16);
                    fps = Math.max(10, Math.min(30, config.getInt(4))); bitrate = Math.max(500000, Math.min(4000000, config.getInt(20)));
                    extended = frame.payload[29] != 0; configured = true;
                    response = ByteBuffer.allocate(9).order(ByteOrder.LITTLE_ENDIAN).putInt(2).putShort((short) width).putShort((short) height).put((byte) (extended ? 1 : 0)).array(); break;
                case 0x30: response = new byte[] {(byte)0x8a,0x13,0,0,1,0,0,0}; break;
                case 0x40: response = new byte[0]; break;
                case 0x60: response = "{\"viewAreaConfig\":{\"state\":0},\"supportFunction\":0}".getBytes(StandardCharsets.UTF_8); break;
                case 0x70: if (!configured) throw new IOException("media_config_missing"); startEncoder(); response = new byte[0]; break;
                default: continue;
            }
            output.write(MeterProtocol.media(frame.command + 1, frame.sequence, response)); output.flush();
        }
    }
    private void frameChannel(Socket socket) throws Exception {
        InputStream input = socket.getInputStream(); OutputStream output = socket.getOutputStream(); int empty = 0;
        while (valid()) {
            MeterProtocol.Frame request = MeterProtocol.media(input);
            if (request.command != 0x72) continue;
            byte[] frame = frames.poll();
            if (frame == null) { output.write(new byte[4]); if (++empty % 40 == 0) requestKeyFrame(); }
            else {
                empty = 0; int prefix = extended ? 4 : 0;
                output.write(ByteBuffer.allocate(4 + prefix).order(ByteOrder.LITTLE_ENDIAN).putInt(frame.length + prefix)
                        .put(extended ? ByteBuffer.allocate(4).order(ByteOrder.LITTLE_ENDIAN).putInt(sequence.incrementAndGet()).array() : new byte[0]).array());
                output.write(frame); phase = "视频帧已发出，待观察仪表画面";
            }
            output.flush();
        }
    }
    private void startEncoder() throws Exception {
        synchronized (encoderLock) {
            if (encoding) return;
            if (!valid() || projection == null) throw new IOException("projection_stopped");
            MediaFormat format = MediaFormat.createVideoFormat("video/avc", width, height);
            format.setInteger(MediaFormat.KEY_COLOR_FORMAT, MediaCodecInfo.CodecCapabilities.COLOR_FormatSurface);
            format.setInteger(MediaFormat.KEY_BIT_RATE, bitrate); format.setInteger(MediaFormat.KEY_FRAME_RATE, fps); format.setInteger(MediaFormat.KEY_I_FRAME_INTERVAL, 1);
            encoder = MediaCodec.createEncoderByType("video/avc"); encoder.configure(format, null, null, MediaCodec.CONFIGURE_FLAG_ENCODE);
            surface = encoder.createInputSurface(); encoder.start();
            if (display == null) display = projection.createVirtualDisplay("GeometryPanelMeter", width, height, getResources().getDisplayMetrics().densityDpi,
                    DisplayManager.VIRTUAL_DISPLAY_FLAG_AUTO_MIRROR, surface, null, main);
            else { display.resize(width, height, getResources().getDisplayMetrics().densityDpi); display.setSurface(surface); }
            if (display == null) throw new IOException("virtual_display_failed");
            encoding = true; phase = "屏幕采集中，等待仪表拉取视频";
            workers.execute(this::drainEncoder);
        }
    }
    private void drainEncoder() {
        MediaCodec codec = encoder; MediaCodec.BufferInfo info = new MediaCodec.BufferInfo();
        try {
            while (valid() && encoding && codec == encoder) {
                int index = codec.dequeueOutputBuffer(info, 10000);
                if (index < 0) continue;
                ByteBuffer output = codec.getOutputBuffer(index);
                if (output != null && info.size > 0 && info.size <= 2 * 1024 * 1024) {
                    output.position(info.offset); output.limit(info.offset + info.size); byte[] data = new byte[info.size]; output.get(data);
                    data = MeterProtocol.annexB(data);
                    if ((info.flags & MediaCodec.BUFFER_FLAG_CODEC_CONFIG) != 0) codecConfig = data;
                    else {
                        if ((info.flags & MediaCodec.BUFFER_FLAG_KEY_FRAME) != 0 && codecConfig.length > 0) data = BleProtocol.join(codecConfig, data);
                        if (!frames.offer(data)) { frames.poll(); frames.offer(data); requestKeyFrame(); }
                    }
                }
                codec.releaseOutputBuffer(index, false);
            }
        } catch (Exception error) { if (active) stopSession("video_encoder_failed"); }
    }
    private void requestKeyFrame() {
        synchronized (encoderLock) {
            long now = android.os.SystemClock.elapsedRealtime(); if (!encoding || encoder == null || now - lastKeyRequest < 300) return;
            lastKeyRequest = now;
            try { Bundle options = new Bundle(); options.putInt(MediaCodec.PARAMETER_KEY_REQUEST_SYNC_FRAME, 0); encoder.setParameters(options); } catch (RuntimeException ignored) { }
        }
    }
    private void stopSession(String reason) {
        main.post(() -> { if (active || running) { phase = "已停止：" + NativeBridge.human(reason); } stopSelf(); });
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() {
        active = running = encoding = false; main.removeCallbacksAndMessages(null);
        if (connection != null) connection.close();
        synchronized (listeners) { for (ServerSocket socket : listeners) try { socket.close(); } catch (IOException ignored) { } listeners.clear(); }
        synchronized (peers) { for (Socket socket : peers) try { socket.close(); } catch (IOException ignored) { } peers.clear(); }
        synchronized (encoderLock) {
            if (display != null) { display.release(); display = null; }
            if (encoder != null) { try { encoder.stop(); } catch (RuntimeException ignored) { } encoder.release(); encoder = null; }
            if (surface != null) { surface.release(); surface = null; }
            if (projection != null) { projection.stop(); projection = null; }
        }
        frames.clear(); workers.shutdownNow(); keyPair = null; codecConfig = new byte[0];
        stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy();
    }
}
