package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import org.json.JSONObject;
import org.junit.Test;

public class MeterProtocolTest {
    @Test public void encoderNalUnitsUseAnnexBAndRejectTruncatedLengthPrefixes() throws Exception {
        assertEquals("00000001670102000000016803", BleProtocol.hex(MeterProtocol.annexB(BleProtocol.hex("00000003670102000000026803", -1))));
        byte[] annex = BleProtocol.hex("0000016701", -1);
        assertArrayEquals(annex, MeterProtocol.annexB(annex));
        for (String broken : new String[] {"", "000001", "000000056701", "0000000267010000", "ffffffff01"})
            assertThrows(Exception.class, () -> MeterProtocol.annexB(BleProtocol.hex(broken, -1)));
    }
    @Test public void recoveredControlAndMediaHeadersMatchIndependentGoldenBytes() throws Exception {
        assertEquals("100000701200000002000070000000007b7d", BleProtocol.hex(MeterProtocol.control(0x70000010, "{}".getBytes(StandardCharsets.UTF_8))));
        assertEquals("3000000007000000", BleProtocol.hex(MeterProtocol.media(0x30, 7, new byte[0])));
        MeterProtocol.Frame frame = MeterProtocol.control(new ByteArrayInputStream(BleProtocol.hex("100000701200000002000070000000007b7d", -1)));
        assertEquals(0x70000010, frame.command); assertEquals("{}", new String(frame.payload, StandardCharsets.UTF_8));
        byte[] bad = MeterProtocol.control(0x70000010, new byte[0]); bad[8]++;
        assertThrows(Exception.class, () -> MeterProtocol.control(new ByteArrayInputStream(bad)));
    }
    @Test public void wallpaperHeadersUseBigEndianAndNeverAcceptWrongAckTypes() throws Exception {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); MeterProtocol.wallpaper(output, 0x10000043, true, new byte[0]);
        assertEquals("01011000004300000000", BleProtocol.hex(output.toByteArray()));
        WallpaperTransfer.validateAck("{\"code\":\"1\",\"message\":\"ok\"}");
        for (String text : new String[] {"{\"code\":1}", "{\"code\":\"1\",\"code\":\"1\"}", "{\"code\":\"1\",\"\\u0063ode\":\"1\"}", "{\"code\":\"0\"}", "{\"code\":\"1\"}x", "{\"nested\":{\"code\":\"1\"}}"})
            assertThrows("Invalid ACK accepted", Exception.class, () -> WallpaperTransfer.validateAck(text));
    }
    @Test public void realLegacyPairingAliasesAreSupportedButOtherModesAndHostsCannotSelectATcpTarget() throws Exception {
        MeterProfile profile = new MeterProfile("v=1&action=9&modelid=TEST&ssid=ZEEHO-test&pwd=12345678&mac=AA%3ABB%3ACC%3ADD%3AEE%3A01&sn=synthetic");
        assertEquals("AA:BB:CC:DD:EE:01", profile.mac); assertEquals("synthetic", profile.serial);
        assertThrows(Exception.class, () -> new MeterProfile("v=2&action=9&ssid=x&pwd=12345678&mac=AA:BB:CC:DD:EE:01"));
        assertThrows(Exception.class, () -> new MeterProfile("v=1&action=8&ssid=x&pwd=12345678&mac=AA:BB:CC:DD:EE:01"));
        assertThrows(Exception.class, () -> new MeterProfile("v=1&action=9&ssid=x&pwd=12345678&mac=127.0.0.1"));
    }
    @Test public void wallpaperTemplateCannotInventNumberResolutionOrPassAccountDataToNativeUi() {
        JSONObject fixture = NativeJson.obj("mode", "wallpaper", "wallpaperNum", "template-A", "displayWallpaperSet", "1,2", "width", 800, "height", 480, "token", "synthetic");
        assertFalse(MeterOptions.sanitize(fixture).has("token"));
        assertThrows(Exception.class, () -> MeterOptions.sanitize(NativeJson.obj("mode", "wallpaper")));
        assertThrows(Exception.class, () -> MeterOptions.sanitize(NativeJson.obj("mode", "wallpaper", "wallpaperNum", 1, "displayWallpaperSet", "1,2", "width", 800, "height", 480)));
        assertThrows(Exception.class, () -> MeterOptions.sanitize(NativeJson.obj("mode", "wallpaper", "wallpaperNum", "x", "displayWallpaperSet", "1,2", "width", 800.5, "height", 480)));
        assertEquals(1, MeterOptions.sanitize(NativeJson.obj("mode", "cast", "host", "127.0.0.1")).length());
    }
}
