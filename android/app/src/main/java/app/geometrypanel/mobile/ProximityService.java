package app.geometrypanel.mobile;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

/** Explicit, visible and time-bounded signal reminder. It never transmits a vehicle control. */
public final class ProximityService extends Service {
    static volatile boolean running;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private NativeEngine engine;
    private long generation;
    private boolean notified;
    private int nearSamples, threshold = -65;
    @Override public void onCreate() { super.onCreate(); engine = NativeEngine.get(this); }
    @SuppressLint("MissingPermission") @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || "stop".equals(intent.getAction()) || engine.material == null || !engine.ble.fresh()) { stopSelf(); return START_NOT_STICKY; }
        threshold = Math.max(-90, Math.min(-35, intent.getIntExtra("threshold", -65)));
        generation = engine.generation;
        PendingIntent stop = PendingIntent.getService(this, 3, new Intent(this, ProximityService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        startForeground(510, NativeNotifications.builder(this, "geometry-device", "车辆靠近提醒", "只检测绑定车辆的信号并提醒，不自动开锁。云授权过期后自动停止。")
                .setOngoing(true).addAction(new android.app.Notification.Action.Builder(null, "停止", stop).build()).build());
        running = true; handler.removeCallbacksAndMessages(null); tick(); return START_NOT_STICKY;
    }
    private void tick() {
        if (!running || generation != engine.generation || !engine.ble.fresh()) { stopSelf(); return; }
        if (engine.ble.connected()) {
            engine.ble.readRssi();
            sample(engine.ble.status().optInt("rssi", -127));
            handler.postDelayed(this::tick, 5000);
        } else engine.ble.scan((result, error) -> {
            if (!running || generation != engine.generation) return;
            sample(error == null && result.optBoolean("found") ? result.optInt("rssi", -127) : -127);
            handler.postDelayed(this::tick, 10000);
        });
    }
    private void sample(int value) {
        if (value >= threshold) {
            nearSamples++;
            if (nearSamples >= 2 && !notified) { notified = true; NativeNotifications.near(this); }
        } else if (value < threshold - 10) { nearSamples = 0; notified = false; }
    }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() { running = false; handler.removeCallbacksAndMessages(null); engine.ble.cancelScan(); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy(); }
}
