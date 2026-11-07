package app.geometrypanel.mobile;
import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import org.junit.Test;
public class GeminiProtocolTest {
    @Test public void recoveredBigEndianFramesMatchGoldenAndSkipOnlyKnownExtraMessages() throws Exception {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream(); GeminiProtocol.send(bytes, 0x10000001, new byte[0]); assertEquals("00001000000100000000", BleProtocol.hex(bytes.toByteArray()));
        bytes.reset(); GeminiProtocol.send(bytes, 0x10000002, new byte[] {9}); GeminiProtocol.send(bytes, 0x10000004, new byte[] {1});
        assertArrayEquals(new byte[] {1}, GeminiProtocol.receive(new ByteArrayInputStream(bytes.toByteArray()), 0x10000004));
        assertThrows(Exception.class, () -> GeminiProtocol.receive(new ByteArrayInputStream(BleProtocol.hex("00011000000400000000", -1)), 0x10000004));
        assertThrows(Exception.class, () -> GeminiProtocol.receive(new ByteArrayInputStream(BleProtocol.hex("00001000000500000000", -1)), 0x10000004));
    }
    @Test public void firmwareFilenameHasNoPathOrControlAmbiguity() {
        assertTrue(GeminiProtocol.filename("instrument.bin")); assertFalse(GeminiProtocol.filename("../instrument.bin")); assertFalse(GeminiProtocol.filename("a\\b.bin")); assertFalse(GeminiProtocol.filename("a\nb.bin")); assertFalse(GeminiProtocol.filename("firmware.zip"));
    }
}
