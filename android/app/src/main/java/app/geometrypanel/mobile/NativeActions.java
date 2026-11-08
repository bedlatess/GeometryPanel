package app.geometrypanel.mobile;

import android.app.PendingIntent;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ShortcutInfo;
import android.content.pm.ShortcutManager;
import android.graphics.drawable.Icon;
import android.net.Uri;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.Collections;
import javax.crypto.Cipher;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import org.json.JSONArray;
import org.json.JSONObject;

final class NativeActions {
    private NativeActions() { }
    static boolean allowed(String action) { return action != null && action.matches("refresh|unlock|lock|horn|seat"); }
    static String label(String action) { switch (action) { case "unlock": return "上电开锁"; case "lock": return "关机锁车"; case "horn": return "鸣笛寻车"; case "seat": return "打开座桶"; default: return "刷新车况"; } }
    private static synchronized byte[] key(Context context) throws Exception {
        NativeVault vault = new NativeVault(context); String saved = vault.read("action-secret");
        if (saved != null) return BleProtocol.hex(saved, 32);
        byte[] value = new byte[32]; new SecureRandom().nextBytes(value); vault.save("action-secret", BleProtocol.hex(value)); return value;
    }
    private static String signature(Context context, String id, String action, JSONObject binding) throws Exception {
        JSONObject account = binding.getJSONObject("account"), vehicle = binding.getJSONObject("vehicle");
        String text = id + "|" + action + "|" + account.getString("id") + "|" + account.getLong("epoch") + "|" + vehicle.getLong("epoch") + "|" + NativeCloud.digest(account.getString("token"), "SHA-256");
        Mac mac = Mac.getInstance("HmacSHA256"); mac.init(new SecretKeySpec(key(context), "HmacSHA256")); return BleProtocol.hex(mac.doFinal(text.getBytes(StandardCharsets.UTF_8)));
    }
    static Intent intent(Context context, String id, String action) throws Exception {
        JSONObject binding = BackgroundMonitor.get(context).binding(id); if (!allowed(action) || binding == null) throw new IllegalArgumentException("invalid_action_binding");
        Uri uri = new Uri.Builder().scheme("geometry-action").authority("v1").appendPath(id).appendPath(action).appendQueryParameter("permit", signature(context, id, action, binding)).build();
        return new Intent(context, NativeActionActivity.class).setAction(Intent.ACTION_VIEW).setData(uri).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    }
    static JSONObject verify(Context context, Uri uri) throws Exception {
        if (uri == null || !"geometry-action".equals(uri.getScheme()) || !"v1".equals(uri.getHost()) || uri.getPathSegments().size() != 2 || uri.getQueryParameterNames().size() != 1) throw new IOException("action_binding_expired");
        String id = uri.getPathSegments().get(0), action = uri.getPathSegments().get(1), permit = uri.getQueryParameter("permit");
        JSONObject binding = BackgroundMonitor.get(context).binding(id);
        if (!allowed(action) || binding == null || !binding.getJSONObject("account").optBoolean("enabled") || !binding.getJSONObject("vehicle").optBoolean("enabled") || permit == null
                || !MessageDigest.isEqual(permit.getBytes(StandardCharsets.US_ASCII), signature(context, id, action, binding).getBytes(StandardCharsets.US_ASCII))) throw new IOException("action_binding_expired");
        return binding;
    }
    static PendingIntent pending(Context context, String id, String action) throws Exception { return PendingIntent.getActivity(context, (id + action).hashCode(), intent(context, id, action), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE); }
    static JSONObject shortcuts(Context context, JSONObject params) throws Exception {
        String id = BackgroundConfig.id(params, "vehicleId"); JSONArray actions = params.getJSONArray("actions");
        if (actions.length() > 5) throw new IllegalArgumentException("invalid_actions");
        ArrayList<ShortcutInfo> shortcuts = new ArrayList<>(); java.util.HashSet<String> seen = new java.util.HashSet<>();
        for (int i = 0; i < actions.length(); i++) { String action = actions.getString(i); if (!allowed(action) || !seen.add(action)) throw new IllegalArgumentException("invalid_action");
            shortcuts.add(new ShortcutInfo.Builder(context, "geometry-" + action).setShortLabel(label(action)).setLongLabel("当前配置车辆 · " + label(action)).setIcon(Icon.createWithResource(context, R.drawable.ic_panel)).setIntent(intent(context, id, action)).build());
        }
        ShortcutManager manager = context.getSystemService(ShortcutManager.class); manager.removeAllDynamicShortcuts();
        int max = manager.getMaxShortcutCountPerActivity(); if (shortcuts.size() > max) shortcuts = new ArrayList<>(shortcuts.subList(0, max));
        boolean accepted = manager.setDynamicShortcuts(shortcuts); return NativeJson.obj("configured", accepted, "count", shortcuts.size());
    }
    @android.annotation.SuppressLint("GetInstance") // Required recovered wire protocol; local credentials use Keystore AES-GCM.
    static void execute(Context context, Uri permit, NativeCloud.Guard lifecycle) throws Exception {
        JSONObject binding = verify(context, permit), account = binding.getJSONObject("account"), vehicle = binding.getJSONObject("vehicle");
        String action = permit.getPathSegments().get(1), token = account.getString("token"), vin = vehicle.getString("vin");
        NativeCloud.Guard guard = () -> { lifecycle.check(); try { verify(context, permit); } catch (Exception error) { throw new IOException("action_binding_expired"); } };
        if (action.equals("refresh")) { BackgroundMonitor.get(context).run(vehicle.getString("id"), null); return; }
        NativeCloud cloud = new NativeCloud();
        if (action.equals("seat")) {
            cloud.request(NativeCloud.APP + "/vehicleSet/propertyTwo/one", "PUT", Collections.emptyMap(), NativeJson.obj("commond", "28", "commondParam", "1", "relatedFunctions", JSONObject.NULL, "vcu", vin, "version", "v2"), token, guard); return;
        }
        boolean power = action.equals("unlock") || action.equals("lock");
        JSONObject event = NativeJson.obj("eventId", 11631, "param", NativeJson.obj("vinNo", vin, "functionCode", power ? "ON_AND_OFF" : "LOUDLY_SEARCH_CAR", "type", power ? action.equals("unlock") ? "ON" : "OFF" : "LOW").toString(), "uuid", "", "zeehoParamTypeBO", JSONObject.NULL);
        Exception first = null;
        try { cloud.request(NativeCloud.APP + "/dbpoint/send", "POST", Collections.emptyMap(), event, token, guard); } catch (Exception error) { if ("cancelled".equals(error.getMessage()) || "action_binding_expired".equals(error.getMessage()) || "auth_expired".equals(error.getMessage())) throw error; first = error; }
        guard.check();
        if (power) {
            int flag = action.equals("unlock") ? 1 : 0;
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding"); cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec("9dbc2cbf2ec327699301b495010316ec".getBytes(StandardCharsets.US_ASCII), "AES"));
            String plain = "{\"lockFlag\":" + flag + ",\"vinNo\":\"" + vin + "\"}";
            String secret = android.util.Base64.encodeToString(cipher.doFinal(plain.getBytes(StandardCharsets.UTF_8)), android.util.Base64.NO_WRAP);
            cloud.request(NativeCloud.APP + "/vehicleSet/network/unlock", "POST", Collections.emptyMap(), NativeJson.obj("secret", secret, "vinNo", vin, "lockFlag", flag), token, guard);
        } else cloud.request(NativeCloud.APP + "/vehicleInfo/control/" + vin, "PUT", Collections.emptyMap(), null, token, guard);
        if (first != null) throw new IOException("command_result_unknown");
    }
}
