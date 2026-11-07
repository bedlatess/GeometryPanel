package app.geometrypanel.mobile;

import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;

public final class BackgroundService extends Service {
    static volatile boolean running;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private BackgroundMonitor monitor;
    @Override public void onCreate() { super.onCreate(); monitor = BackgroundMonitor.get(this); }
    @Override public int onStartCommand(Intent intent, int flags, int id) {
        if (intent == null || "stop".equals(intent.getAction()) || !monitor.enabled()) { stopSelf(); return START_NOT_STICKY; }
        try {
            PendingIntent stop = PendingIntent.getService(this, 31, new Intent(this, BackgroundService.class).setAction("stop"), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            startForeground(530, NativeNotifications.builder(this, "geometry-device", "车况后台监控", "按当前账号与车辆轮询车况；系统仍可能延迟后台任务。")
                    .setOngoing(true).addAction(new android.app.Notification.Action.Builder(null, "停止本次服务", stop).build()).build());
            running = true; handler.removeCallbacksAndMessages(null); tick();
        } catch (RuntimeException error) { stopSelf(); }
        return START_NOT_STICKY;
    }
    private void tick() {
        if (!running || !monitor.enabled()) { stopSelf(); return; }
        monitor.run(null, null); handler.postDelayed(this::tick, monitor.nextDelay());
    }
    @Override public void onTimeout(int startId, int fgsType) { stopSelf(); }
    @Override public IBinder onBind(Intent intent) { return null; }
    @Override public void onDestroy() { running = false; handler.removeCallbacksAndMessages(null); stopForeground(STOP_FOREGROUND_REMOVE); super.onDestroy(); }
}
