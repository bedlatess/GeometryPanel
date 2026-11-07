package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;
import java.util.List;
import org.junit.Test;

public class BleProtocolTest {
    @Test public void recoveredSubscriptionFrameHasGoldenWireBytes() {
        assertEquals("abcd7c0200080187cf", BleProtocol.hex(BleProtocol.frame(0x7c, BleProtocol.number(1, 1))));
        assertEquals("abcd72020008007ccf", BleProtocol.hex(BleProtocol.frame(0x72, BleProtocol.number(1, 0))));
        assertThrows(IllegalArgumentException.class, () -> BleProtocol.frame(0x01, new byte[0]));
        assertThrows(IllegalArgumentException.class, () -> BleProtocol.frame(0x7c, new byte[241]));
    }
    @Test public void notificationsCanSplitAndResynchronizeWithoutAcceptingBadChecksums() {
        byte[] valid = BleProtocol.hex("abcd5d0200080067cf", -1);
        BleProtocol.Decoder decoder = new BleProtocol.Decoder();
        assertTrue(decoder.accept(Arrays.copyOf(valid, 4)).isEmpty());
        List<BleProtocol.Frame> frames = decoder.accept(Arrays.copyOfRange(valid, 4, valid.length));
        assertEquals(1, frames.size()); assertEquals(0x5d, frames.get(0).control);
        byte[] corrupted = valid.clone(); corrupted[corrupted.length - 2]++;
        assertEquals(1, decoder.accept(BleProtocol.join(corrupted, valid)).size());
        assertThrows(IllegalArgumentException.class, () -> decoder.accept(new byte[2049]));
    }
    @Test public void protobufRejectsDuplicateFieldsMalformedLengthsAndOversizedNumbers() {
        assertEquals(1L, BleProtocol.number(BleProtocol.parse(BleProtocol.hex("0801", -1)), 1, -1));
        for (String bad : new String[] {"08010802", "0a06ffff", "080080", "0b00", "088080808080808080808002", "8880808080800110"})
            assertThrows("Malformed protobuf accepted", IllegalArgumentException.class, () -> BleProtocol.parse(BleProtocol.hex(bad, -1)));
    }
    @Test public void challengeUsesIndependentOpenSslAesVectorAndReturnsAProtobufBytesField() throws Exception {
        // Fixture produced independently with Node/OpenSSL aes-128-ecb, not by the Java implementation.
        String cipher = "77b044f3a401b513a0c8a940c402b648d748bed0bfe5e3acc43f65fae3bf572d";
        byte[] challenge = BleProtocol.bytes(1, cipher.getBytes(StandardCharsets.UTF_8));
        byte[] expected = BleProtocol.bytes(1, "GeometryPanel challenge".getBytes(StandardCharsets.UTF_8));
        assertArrayEquals(expected, BleProtocol.challenge(challenge, "0123456789abcdef"));
        assertThrows(Exception.class, () -> BleProtocol.challenge(challenge, "incorrect-key-00"));
        assertThrows(Exception.class, () -> BleProtocol.challenge(BleProtocol.bytes(1, new byte[] {(byte)0xff}), "0123456789abcdef"));
    }
}
