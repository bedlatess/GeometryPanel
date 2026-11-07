package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class BackgroundRulesTest {
    private JSONObject sample(long at, int charging, int soc) { return NativeJson.obj("receivedAt", at, "charging", charging, "soc", soc,"chargeReportState","fresh","reportState","fresh"); }
    @Test public void firstSampleAndLongGapsDoNotFabricateAChargeStartOrFull() throws Exception {
        JSONObject flags = new JSONObject();
        assertEquals(0, BackgroundRules.events(new JSONObject(), sample(1000000, 1, 50), flags, 20).length());
        JSONArray events = BackgroundRules.events(sample(1000000, 1, 50), sample(1500000, 2, 100), flags, 20);
        assertEquals(1, events.length()); assertEquals("gap", events.getJSONObject(0).getString("type"));
        JSONArray sessions = new JSONArray(); BackgroundMonitor.updateCharge(sessions, new JSONObject(), sample(1000000, 1, 50));
        assertEquals(1000000, sessions.getJSONObject(0).getLong("startedAt")); assertTrue(sessions.getJSONObject(0).getBoolean("estimated")); assertTrue(sessions.getJSONObject(0).isNull("endedAt"));
        BackgroundMonitor.updateCharge(sessions, sample(1000000, 1, 50), sample(1500000, 2, 100));
        assertEquals("unknown", sessions.getJSONObject(0).getString("status"));
    }
    @Test public void chargeTransitionsLowHysteresisAndMissingFieldsAreIndependent() throws Exception {
        JSONObject flags = new JSONObject();
        assertEquals("chargeStart", BackgroundRules.events(sample(1000000, 0, 50), sample(1060000, 1, 50), flags, 20).getJSONObject(0).getString("type"));
        assertEquals("chargeFull", BackgroundRules.events(sample(1060000, 1, 95), sample(1120000, 2, 100), flags, 20).getJSONObject(0).getString("type"));
        assertEquals("lowBattery", BackgroundRules.events(sample(1120000, 0, 21), sample(1180000, 0, 20), flags, 20).getJSONObject(0).getString("type"));
        assertEquals(0, BackgroundRules.events(sample(1180000, 0, 20), sample(1240000, 0, 19), flags, 20).length());
        BackgroundRules.events(sample(1240000, 0, 19), sample(1300000, 0, 25), flags, 20);
        assertEquals(1, BackgroundRules.events(sample(1300000, 0, 25), sample(1360000, 0, 19), flags, 20).length());
        JSONObject missing = BackgroundRules.normalize(new JSONObject(), null, 1000); assertFalse(missing.has("soc")); assertFalse(missing.has("charging"));
        assertEquals(150000, BackgroundRules.interval(sample(1000, 1, 20), 2000));
        assertEquals(300000, BackgroundRules.interval(NativeJson.obj("receivedAt", 1000, "lock", 1), 2000));
        assertEquals(60000, BackgroundRules.interval(new JSONObject(), 1000000));
    }
    @Test public void accountConfigurationIsWhitelistedAndRejectsDuplicateOrStaleIdentityShapes() throws Exception {
        JSONObject vehicle = NativeJson.obj("id", "local-car", "vin", "SYNTHETIC", "label", "测试车", "epoch", 1, "enabled", true);
        JSONObject account = NativeJson.obj("id", "local-account", "epoch", 1, "uid", "synthetic-user", "token", "synthetic-token", "vehicles", new JSONArray().put(vehicle), "unexpected", "discard");
        BackgroundConfig clean = new BackgroundConfig(NativeJson.obj("accounts", new JSONArray().put(account), "selectedVehicleId", "local-car"));
        assertFalse(clean.data.getJSONArray("accounts").getJSONObject(0).has("unexpected"));
        assertThrows(Exception.class, () -> new BackgroundConfig(NativeJson.obj("accounts", new JSONArray().put(account).put(account))));
        account.put("epoch", 1.5); assertThrows(Exception.class, () -> new BackgroundConfig(NativeJson.obj("accounts", new JSONArray().put(account))));
    }
    @Test public void javaCloudSignerMatchesIndependentRecoveredFixtureAndHistoryIsBounded() throws Exception {
        assertEquals("a=1&z=2", NativeCloud.canonical(Map.of("z", "2", "a", "1", "empty", "")));
        assertThrows(Exception.class, () -> NativeCloud.canonical(Map.of("x", "a&token=bad")));
        assertEquals("927b43450360a20cc1989ccd2e983d69", NativeCloud.signature("a=1", "{}", "appId=S7qPWPU1&nonce=fixture&timestamp=1700000000000"));
        JSONArray points = new JSONArray(); for (int i = 0; i < 600; i++) points.put(i);
        assertEquals(500, BackgroundMonitor.trim(points, 500).length()); assertEquals(100, BackgroundMonitor.trim(points, 500).getInt(0));
    }
}
