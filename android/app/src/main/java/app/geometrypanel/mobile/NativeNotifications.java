package app.geometrypanel.mobile;

import android.Manifest;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;
import org.json.JSONObject;

final class NativeNotifications {
    private NativeNotifications() { }
    static SharedPreferences preferences(Context context) { return context.getSharedPreferences("native-reminders", Context.MODE_PRIVATE); }
    static boolean permission(Context context) { return Build.VERSION.SDK_INT < 33 || context.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED; }
    static void channels(Context context) {
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("geometry-reminders", "车况提醒", NotificationManager.IMPORTANCE_DEFAULT));
        manager.createNotificationChannel(new NotificationChannel("geometry-device", "车辆连接服务", NotificationManager.IMPORTANCE_LOW));
        manager.createNotificationChannel(new NotificationChannel("geometry-cast", "仪表屏幕投送", NotificationManager.IMPORTANCE_LOW));
    }
    static PendingIntent open(Context context) {
        return PendingIntent.getActivity(context, 1, new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }
    static Notification.Builder builder(Context context, String channel, String title, String text) {
        channels(context);
        return new Notification.Builder(context, channel).setSmallIcon(R.drawable.ic_panel).setContentTitle(title).setContentText(text)
                .setContentIntent(open(context)).setVisibility(Notification.VISIBILITY_PRIVATE).setOnlyAlertOnce(true);
    }
    static void configure(Context context, boolean enabled, int threshold) {
        if (threshold < 5 || threshold > 80) throw new IllegalArgumentException("invalid_threshold");
        preferences(context).edit().putBoolean("enabled", enabled).putInt("lowBattery", threshold).putBoolean("lowSent", false).apply();
        if (!enabled) context.getSystemService(NotificationManager.class).cancel(501);
    }
    @android.annotation.SuppressLint("MissingPermission")
    static void sample(Context context, JSONObject reading, long receivedAt) {
        SharedPreferences preferences = preferences(context);
        if (!preferences.getBoolean("enabled", false) || !permission(context) || receivedAt <= 0 || System.currentTimeMillis() - receivedAt > 120000
                || receivedAt > System.currentTimeMillis() + 30000 || !(reading.opt("soc") instanceof Number)
                || Boolean.FALSE.equals(reading.opt("schemaVerified"))) return;
        double soc = reading.optDouble("soc", -1);
        if (!Double.isFinite(soc) || soc < 0 || soc > 100) return;
        int threshold = preferences.getInt("lowBattery", 20);
        if (soc > threshold + 5) { preferences.edit().putBoolean("lowSent", false).apply(); return; }
        if (soc > threshold || preferences.getBoolean("lowSent", false)) return;
        preferences.edit().putBoolean("lowSent", true).apply();
        context.getSystemService(NotificationManager.class).notify(501, builder(context, "geometry-reminders", "车辆电量较低", "刚读取到电量 " + Math.round(soc) + "% ，请留意补电。此提醒来自本机读取，并非云端后台监控。")
                .setAutoCancel(true).build());
    }
    @android.annotation.SuppressLint("MissingPermission")
    static void near(Context context) {
        if (permission(context)) context.getSystemService(NotificationManager.class).notify(502,
                builder(context, "geometry-reminders", "检测到车辆靠近", "已检测到绑定车辆的蓝牙信号。这里只提醒，不会自动开锁或上电。")
                        .setAutoCancel(true).build());
    }
}
