package app.geometrypanel.mobile;

import java.nio.charset.StandardCharsets;
import org.json.JSONObject;

final class VehicleMaterial {
    final JSONObject data;
    final String vin, uid, ownerId, credentialDigest, mac, key, encryptedValue, broadcastType;
    final int generation;
    final long fetchedAt;
    final boolean cloudEnabled, materialReady;

    VehicleMaterial(JSONObject input, long now) {
        vin = NativeJson.string(input, "vin", 128);
        uid = NativeJson.string(input, "uid", 256);
        ownerId = NativeJson.string(input, "ownerId", 256);
        credentialDigest = NativeJson.string(input, "credentialDigest", 64);
        if (vin.isEmpty() || uid.isEmpty() || !uid.equals(ownerId) || !uid.equals(input.optString("bindingUserId"))
                || !(input.opt("sharedFlag") instanceof Number) || ((Number) input.opt("sharedFlag")).doubleValue() != 0
                || !credentialDigest.matches("[0-9a-fA-F]{64}")) throw new IllegalArgumentException("owner_not_verified");
        Object time = input.opt("fetchedAt");
        if (!(time instanceof Number) || ((Number) time).doubleValue() != ((Number) time).longValue()) throw new IllegalArgumentException("refresh_required");
        fetchedAt = ((Number) time).longValue();
        if (!fresh(now)) throw new IllegalArgumentException("refresh_required");
        mac = input.optString("bluetoothAddress", "").toUpperCase(java.util.Locale.ROOT);
        if (!mac.isEmpty() && !mac.matches("[0-9A-F]{2}(:[0-9A-F]{2}){5}")) throw new IllegalArgumentException("ble_address_invalid");
        generation = input.optInt("inductiveGeneration", -1);
        if (generation < -1 || generation > 3) throw new IllegalArgumentException("unsupported_generation");
        JSONObject info = input.optJSONObject("encryptInfo");
        encryptedValue = info == null ? "" : NativeJson.string(info, "encryptValue", 128);
        key = info == null ? "" : NativeJson.string(info, "key", 128);
        int bytes = key.getBytes(StandardCharsets.UTF_8).length;
        if (info != null && (!encryptedValue.matches("[0-9a-fA-F]{128}") || bytes != 16 && bytes != 24 && bytes != 32)) throw new IllegalArgumentException("material_invalid");
        materialReady = info != null && !mac.isEmpty();
        broadcastType = input.optString("broadcastType", "");
        cloudEnabled = Boolean.TRUE.equals(input.opt("cloudEnabled"));
        // Retain only the contract whitelist; raw account/home responses must never enter the vault.
        data = NativeJson.obj("vin", vin, "uid", uid, "ownerId", ownerId, "credentialDigest", credentialDigest,
                "bindingUserId", uid, "sharedFlag", 0, "fetchedAt", fetchedAt, "bluetoothAddress", mac,
                "hmiBluetoothAddress", input.optString("hmiBluetoothAddress", ""), "inductiveGeneration", generation,
                "broadcastType", broadcastType, "cloudEnabled", cloudEnabled,
                "encryptInfo", info == null ? JSONObject.NULL : NativeJson.obj("encryptValue", encryptedValue, "key", key));
    }
    boolean fresh(long now) { return fetchedAt > 0 && fetchedAt <= now + 30000 && now - fetchedAt < 300000; }
    boolean sameScope(VehicleMaterial other) {
        return other != null && vin.equals(other.vin) && uid.equals(other.uid) && credentialDigest.equals(other.credentialDigest);
    }
}
