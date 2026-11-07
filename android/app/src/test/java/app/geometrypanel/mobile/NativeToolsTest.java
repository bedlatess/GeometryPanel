package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.Base64;
import java.util.zip.CRC32;
import java.util.zip.DeflaterOutputStream;
import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;

public class NativeToolsTest {
    private byte[] png(int width, int height) throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); output.write(new byte[] {(byte)137,80,78,71,13,10,26,10});
        byte[] header = ByteBuffer.allocate(13).putInt(width).putInt(height).put((byte)8).put((byte)6).put(new byte[3]).array(); chunk(output,"IHDR",header);
        ByteArrayOutputStream compressed = new ByteArrayOutputStream(); try (DeflaterOutputStream zip = new DeflaterOutputStream(compressed)) { zip.write(new byte[5]); }
        chunk(output,"IDAT",compressed.toByteArray()); chunk(output,"IEND",new byte[0]); return output.toByteArray();
    }
    private void chunk(ByteArrayOutputStream output, String type, byte[] data) throws Exception { byte[] kind = type.getBytes(java.nio.charset.StandardCharsets.US_ASCII); output.write(ByteBuffer.allocate(4).putInt(data.length).array()); output.write(kind); output.write(data); CRC32 crc = new CRC32(); crc.update(kind); crc.update(data); output.write(ByteBuffer.allocate(4).putInt((int)crc.getValue()).array()); }
    @Test public void panelImageRejectsOversizeDimensionsMalformedCrcAndDataUrls() throws Exception {
        byte[] valid = png(1,1); assertArrayEquals(valid,PanelImage.decode(Base64.getEncoder().encodeToString(valid)));
        assertThrows(Exception.class,() -> PanelImage.decode("data:image/png;base64,"+Base64.getEncoder().encodeToString(valid)));
        assertThrows(Exception.class,() -> PanelImage.decode(Base64.getEncoder().encodeToString(png(2049,1)))); valid[valid.length-1]^=1;
        assertThrows(Exception.class,() -> PanelImage.decode(Base64.getEncoder().encodeToString(valid)));
    }
    @Test public void downloadsAndSnapshotPathsStayWithinExplicitOrigins() throws Exception {
        assertEquals("oss-cfmoto-private.zeehoev.com",NativeDownloads.wallpaper("https://oss-cfmoto-private.zeehoev.com/template.zip").getHost());
        for (String url : new String[] {"http://oss-cfmoto-private.zeehoev.com/a.zip","https://evil.test/a.zip","https://oss-cfmoto-private.zeehoev.com@evil.test/a.zip","https://oss-cfmoto-private.zeehoev.com:8443/a.zip"}) assertThrows(Exception.class,() -> NativeDownloads.wallpaper(url));
        assertEquals("index.html",PanelCache.path("https://bedlatess.github.io/GeometryPanel/")); assertEquals("assets/index-123.js",PanelCache.path("https://bedlatess.github.io/GeometryPanel/assets/index-123.js"));
        for (String url : new String[] {"https://mirror.test/GeometryPanel/","https://bedlatess.github.io/GeometryPanel/%2e%2e/a.js","https://bedlatess.github.io/GeometryPanel/assets/a.js?token=synthetic","https://bedlatess.github.io/Other/index.html","https://bedlatess.github.io/GeometryPanel/user.json"}) assertNull(PanelCache.path(url));
    }
    @Test public void reportTimesAndHistoryDoNotInventChargeTransitionsForUnknownStaleOrFuture() throws Exception {
        long now = 1794016800000L; assertEquals(now,ReportTime.parse(now)); assertEquals(now,ReportTime.parse(now/1000));
        assertEquals(ReportTime.parse("2026-11-07 10:00:00"),ReportTime.parse("2026-11-07T02:00:00Z")); assertEquals(0,ReportTime.parse("2026-02-30 12:00:00"));
        assertEquals("unknown",ReportTime.state(0,now)); assertEquals("stale",ReportTime.state(now-1800001,now)); assertEquals("future",ReportTime.state(now+300001,now));
        JSONObject home = NativeJson.obj("refreshTime",now,"chargeState",1), battery = NativeJson.obj("refreshTime",now,"chargeState",1,"bmssoc",50);
        JSONObject first = BackgroundRules.normalize(home,battery,now); JSONArray sessions = new JSONArray(); BackgroundMonitor.updateCharge(sessions,new JSONObject(),first);
        assertTrue(sessions.getJSONObject(0).getBoolean("estimated")); assertTrue(BackgroundMonitor.historyPoint(first).getBoolean("charging")); assertTrue(BackgroundMonitor.historyPoint(first).isNull("online"));
        battery.put("refreshTime",now-1800001); battery.put("chargeStateStr","已充满"); JSONObject stale = BackgroundRules.normalize(home,battery,now+60000);
        assertEquals(0,BackgroundRules.events(first,stale,new JSONObject(),20).length()); BackgroundMonitor.updateCharge(sessions,first,stale); assertEquals("unknown",sessions.getJSONObject(0).getString("status"));
        battery.put("refreshTime",now+1000000); JSONObject future = BackgroundRules.normalize(home,battery,now+120000); assertEquals("future",future.getString("batteryReportState"));
        battery.remove("chargeStateStr"); battery.put("chargeState",99); assertFalse(BackgroundRules.normalize(home,battery,now).has("charging"));
    }
    @Test public void aWidgetBoundToAnotherVehicleNeverUsesTheCurrentPageSnapshot() throws Exception {
        JSONObject nativeSample = NativeJson.obj("soc",20,"receivedAt",1000), wrongCar = NativeJson.obj("vehicleId","local-b","soc",99,"receivedAt",3000);
        assertEquals(20,PanelWidget.chooseSnapshot("local-a",nativeSample,wrongCar).getInt("soc"));
        wrongCar.put("vehicleId","local-a"); assertEquals(99,PanelWidget.chooseSnapshot("local-a",nativeSample,wrongCar).getInt("soc"));
        wrongCar.put("receivedAt",500); assertEquals(20,PanelWidget.chooseSnapshot("local-a",nativeSample,wrongCar).getInt("soc"));
    }
    @Test public void updateSelectionIncludesPublishedPrereleasesAndRejectsDraftsOrForeignAssets() throws Exception {
        JSONObject stable = release("0.4.0",false,false,"https://github.com/bedlatess/GeometryPanel/releases/download/v0.4.0/GeometryPanel-0.4.0.apk");
        JSONObject beta = release("0.5.0",true,false,"https://github.com/bedlatess/GeometryPanel/releases/download/v0.5.0/GeometryPanel-0.5.0.apk");
        JSONObject draft = release("0.6.0",true,true,"https://github.com/bedlatess/GeometryPanel/releases/download/v0.6.0/GeometryPanel-0.6.0.apk");
        JSONObject foreign = release("0.7.0",true,false,"https://github.com/other/Other/releases/download/v0.7.0/GeometryPanel-0.7.0.apk");
        assertEquals("0.5.0",NativeUpdates.choose(new JSONArray().put(stable).put(beta).put(draft).put(foreign)).getString("version"));
        assertNull(NativeUpdates.choose(new JSONArray().put(draft).put(foreign)));
    }
    private JSONObject release(String version, boolean pre, boolean draft, String url) { return NativeJson.obj("tag_name","v"+version,"prerelease",pre,"draft",draft,"assets",new JSONArray().put(NativeJson.obj("name","GeometryPanel-"+version+".apk","size",1000,"browser_download_url",url))); }
    @Test public void inUseSnapshotFoldersSurviveRefreshAndClearUntilTheirLastSessionLeaves() throws Exception {
        String old = "shell-test-old"; PanelCache.Session first = PanelCache.pin(NativeJson.obj("folder",old)), second = PanelCache.pin(NativeJson.obj("folder",old));
        assertTrue(PanelCache.retained(old,"shell-new")); assertTrue(PanelCache.retained(old,"")); PanelCache.unpin(first); assertTrue(PanelCache.retained(old,""));
        PanelCache.unpin(second); assertFalse(PanelCache.retained(old,"shell-new")); assertTrue(PanelCache.retained(old,old)); PanelCache.unpin(second); assertFalse(PanelCache.retained(old,""));
    }
    @Test public void explicitFalseWriteResultsAreRejectedWhileReadBooleansRemainReadable() throws Exception {
        JSONObject result = NativeJson.obj("code","10000","data",false);
        for (String method : new String[] {"POST","PUT","DELETE"}) assertThrows(Exception.class,() -> NativeCloud.acceptedData(result,method));
        assertEquals(Boolean.FALSE,NativeCloud.acceptedData(result,"GET")); assertEquals(Boolean.TRUE,NativeCloud.acceptedData(NativeJson.obj("data",true),"POST"));
    }
}
