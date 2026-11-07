package app.geometrypanel.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.net.VpnService;
import android.widget.Toast;
import java.io.IOException;
import java.io.OutputStream;
import java.util.Collections;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;
import org.json.JSONArray;
import org.json.JSONObject;

/** Local encrypted capture/import coordinator. Ordinary status never returns captured credentials. */
final class OfficialLogin {
    private static final AtomicBoolean validating = new AtomicBoolean();
    private static volatile long generation; static volatile String phase = "idle";
    private OfficialLogin() { }
    static void prepareCertificate(Activity activity) {
        NativeToolActivity.JOBS.execute(() -> { try { CaptureCertificate.material(activity); activity.runOnUiThread(() -> new AlertDialog.Builder(activity)
            .setTitle("本机临时登录证书")
            .setMessage("下一步导出本机生成的公开 CA 证书。需在 Android 设置的安全/凭据中手动安装为 CA 证书，供官方 H5 登录识别。捕获结束后可移除。若官方应用拒绝用户证书，此方式无法读取登录，请继续使用面板验证码登录。证书私钥只保存在本机加密库。")
            .setNegativeButton("返回", null).setPositiveButton("导出公开证书", (d,w) -> activity.startActivityForResult(new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE).setType("application/x-x509-ca-cert").putExtra(Intent.EXTRA_TITLE, "GeometryPanel-local-login-ca.cer"), 915)).show());
        } catch (Exception error) { toast(activity, "本机证书准备失败。"); } });
    }
    static void start(Activity activity) {
        new AlertDialog.Builder(activity).setTitle("临时捕获自己的官方登录")
                .setMessage("仅路由官方 com.cfmoto 应用；只解析 h5.zeehoev.com 的 /H5/baseInfo 登录身份，其它 TLS 原样转发。期间会阻止 QUIC/加密 DNS 以使用 TCP。不会保存流量或启动车辆操作。系统还会要求 VPN 授权，最长运行 10 分钟，通知栏可随时停止。")
                .setNegativeButton("返回", null).setPositiveButton("开始", (d,w) -> {
                    try { activity.getPackageManager().getPackageInfo("com.cfmoto", 0); Intent permission = VpnService.prepare(activity); if (permission == null) launch(activity); else activity.startActivityForResult(permission, 916); }
                    catch (Exception error) { toast(activity, "未安装官方应用或系统未提供 VPN 权限。"); }
                }).show();
    }
    private static void launch(Activity activity) { if (OfficialCaptureService.running) { toast(activity,"已有临时捕获，请先结束再开始。"); return; } generation++; phase = "starting"; new NativeVault(activity).forget("capture-pending"); activity.startForegroundService(new Intent(activity, OfficialCaptureService.class).putExtra("generation", generation)); toast(activity, "请打开官方 App 的个人资料或签到 H5 页面，然后返回查看捕获状态。"); }
    static synchronized void captureStopped(long epoch) { if (epoch == generation && !phase.equals("captured") && !phase.equals("imported")) generation++; }
    static boolean onActivityResult(Activity activity, int request, int result, Intent data) {
        if (request == 916) { if (result == Activity.RESULT_OK) launch(activity); return true; }
        if (request != 915) return false;
        if (result == Activity.RESULT_OK && data != null && data.getData() != null) NativeToolActivity.JOBS.execute(() -> {
            try (OutputStream output = activity.getContentResolver().openOutputStream(data.getData(), "w")) { if (output == null) throw new IOException(); output.write(CaptureCertificate.publicCa(activity)); toast(activity, "已保存公开 CA；请在系统安全/凭据设置中安装，捕获后可移除。"); }
            catch (Exception error) { toast(activity, "证书没有保存成功。"); }
        }); return true;
    }
    static void stop(Context context) { generation++; context.stopService(new Intent(context, OfficialCaptureService.class)); if (!phase.equals("captured") && !phase.equals("imported")) phase = "stopped"; }
    static long generation() { return generation; }
    static void offer(Context context, long epoch, String token, String uid) {
        if (epoch != generation || !CaptureHttp.validToken(token) || !CaptureHttp.validUid(uid) || !validating.compareAndSet(false, true)) return;
        phase = "verifying";
        NativeToolActivity.JOBS.execute(() -> {
            try {
                NativeCloud.Guard guard = () -> { if (epoch != generation) throw new IOException("cancelled"); };
                Object raw = new NativeCloud().request(NativeCloud.APP + "/vehicle/list", "GET", Collections.emptyMap(), null, token, guard);
                if (!(raw instanceof JSONArray list) || list.length() > 128) throw new IOException();
                JSONArray vehicles = new JSONArray();
                for (int i = 0; i < list.length(); i++) { JSONObject row = list.optJSONObject(i); if (row == null) continue; String vin = row.optString("vinNo", "").trim(); if (!vin.matches("[A-Za-z0-9_-]{1,64}")) continue;
                    vehicles.put(NativeJson.obj("vin", vin, "name", safeLabel(row.optString("vehicleName", "我的极核")), "type", safeLabel(row.optString("vehicleType", "")), "plate", safeLabel(row.optString("licensePlate", "")))); }
                if (vehicles.length() == 0 || vehicles.length() > 16) throw new IOException();
                synchronized (OfficialLogin.class) { guard.check(); new NativeVault(context).save("capture-pending", NativeJson.obj("at", System.currentTimeMillis(), "accountId", "capture-" + UUID.randomUUID(), "token", token, "uid", uid, "vehicles", vehicles).toString()); phase = "captured"; }
                context.stopService(new Intent(context, OfficialCaptureService.class));
            } catch (Exception ignored) { if (epoch == generation) phase = "verification_failed"; }
            finally { validating.set(false); }
        });
    }
    private static String safeLabel(String input) { return input.replaceAll("\\p{Cntrl}", "").substring(0, Math.min(40, input.replaceAll("\\p{Cntrl}", "").length())); }
    static synchronized JSONObject status(Context context) {
        try { String text = new NativeVault(context).read("capture-pending"); if (text != null) { JSONObject pending = new JSONObject(text); if (System.currentTimeMillis() - pending.optLong("at") <= 600000) return NativeJson.obj("state", "captured", "captured", true, "accountId", pending.getString("accountId")); new NativeVault(context).forget("capture-pending"); } }
        catch (Exception ignored) { }
        return NativeJson.obj("state", phase, "captured", false, "running", OfficialCaptureService.running);
    }
    static void importToPanel(Activity activity, NativeJson.Result reply, java.util.function.BooleanSupplier current) {
        if (!status(activity).optBoolean("captured")) { reply.finish(status(activity), null); return; }
        new AlertDialog.Builder(activity).setTitle("将自己的登录资料交给本机面板")
            .setMessage("只交给当前正式面板页面一次，由面板加密保存并进入车辆选择。不会输出到日志或诊断。")
            .setNegativeButton("取消", (d,w) -> reply.finish(null, "cancelled"))
            .setOnCancelListener(d -> reply.finish(null, "cancelled"))
            .setPositiveButton("导入本机面板", (d,w) -> {
                if (!current.getAsBoolean()) return;
                try { JSONObject pending; synchronized (OfficialLogin.class) { NativeVault vault = new NativeVault(activity); String raw = vault.read("capture-pending"); if (raw == null) throw new IOException(); pending = new JSONObject(raw); if (System.currentTimeMillis() - pending.optLong("at") > 600000) { vault.forget("capture-pending"); throw new IOException(); }
                    vault.forget("capture-pending"); phase = "imported"; }
                    reply.finish(NativeJson.obj("imported", true, "accountId", pending.getString("accountId"), "session", NativeJson.obj("token", pending.getString("token"), "uid", pending.getString("uid"), "vehicles", pending.getJSONArray("vehicles"))), null);
                } catch (Exception error) { reply.finish(null, "capture_expired"); }
            }).show();
    }
    static String message(Context context) { JSONObject state = status(context); return state.optBoolean("captured") ? "已取得且核对本机登录资料。返回面板选择导入；资料 10 分钟后失效。" : "当前状态：" + state.optString("state") + "。官方应用可能拒绝用户证书，此时请用面板验证码登录。"; }
    private static void toast(Activity activity, String text) { activity.runOnUiThread(() -> { if (!activity.isFinishing() && !activity.isDestroyed()) Toast.makeText(activity, text, Toast.LENGTH_LONG).show(); }); }
}
