package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import org.json.JSONObject;
import org.junit.Test;

public class VehicleMaterialTest {
    private static final long NOW = 1700000000000L;
    private JSONObject fixture() {
        return NativeJson.obj("vin", "SYNTHETIC-VEHICLE", "uid", "test-owner", "ownerId", "test-owner", "credentialDigest", "a".repeat(64),
                "bindingUserId", "test-owner", "sharedFlag", 0, "fetchedAt", NOW, "bluetoothAddress", "AA:BB:CC:DD:EE:01",
                "inductiveGeneration", 2, "cloudEnabled", true, "broadcastType", "1",
                "encryptInfo", NativeJson.obj("encryptValue", "ab".repeat(64), "key", "0123456789abcdef"));
    }
    @Test public void ownershipFreshnessAndMaterialAreCheckedBeforeAnyGattOperation() throws Exception {
        assertTrue(new VehicleMaterial(fixture(), NOW).materialReady);
        for (String field : new String[] {"uid", "ownerId", "bindingUserId"}) {
            JSONObject invalid = fixture().put(field, "other-owner");
            assertThrows(IllegalArgumentException.class, () -> new VehicleMaterial(invalid, NOW));
        }
        for (Object shared : new Object[] { 1, "0", 0.2 }) {
            JSONObject invalid = fixture().put("sharedFlag", shared);
            assertThrows(IllegalArgumentException.class, () -> new VehicleMaterial(invalid, NOW));
        }
        assertFalse(new VehicleMaterial(fixture(), NOW).fresh(NOW + 300000));
        assertThrows(IllegalArgumentException.class, () -> new VehicleMaterial(fixture().put("fetchedAt", NOW - 300000), NOW));
        assertThrows(IllegalArgumentException.class, () -> new VehicleMaterial(fixture().put("fetchedAt", NOW + 30001), NOW));
    }
    @Test public void basicBindingDoesNotRequireBleKeysButDoesNotPretendTheyExist() throws Exception {
        JSONObject input = fixture(); input.remove("encryptInfo"); input.remove("bluetoothAddress");
        VehicleMaterial material = new VehicleMaterial(input, NOW);
        assertFalse(material.materialReady); assertEquals("", material.mac);
    }
    @Test public void keyByteLengthIsUtf8AndVaultOutputIsAWhitelist() throws Exception {
        JSONObject input = fixture(); input.put("Authorization", "synthetic-not-a-real-token");
        input.put("encryptInfo", NativeJson.obj("encryptValue", "ab".repeat(64), "key", "汉".repeat(8), "unknown", "discard-me"));
        VehicleMaterial material = new VehicleMaterial(input, NOW);
        assertTrue(material.materialReady); assertFalse(material.data.has("Authorization")); assertFalse(material.data.getJSONObject("encryptInfo").has("unknown"));
        input.put("encryptInfo", NativeJson.obj("encryptValue", "ab".repeat(63), "key", "0123456789abcdef"));
        assertThrows(IllegalArgumentException.class, () -> new VehicleMaterial(input, NOW));
    }
}
