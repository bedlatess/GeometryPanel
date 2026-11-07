package app.geometrypanel.mobile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/** The only intercepted TLS name is proven from the ClientHello SNI; other bytes are opaque. */
final class CaptureTls {
    static final class Hello { final byte[] prefix; final boolean target; Hello(byte[] prefix, boolean target) { this.prefix = prefix; this.target = target; } }
    private CaptureTls() { }
    static Hello read(InputStream input) throws IOException {
        ByteArrayOutputStream prefix = new ByteArrayOutputStream(), handshake = new ByteArrayOutputStream();
        for (int record = 0; record < 4; record++) {
            byte[] header = exact(input, 5); prefix.write(header); int length = CapturePackets.u16(header,3);
            if (length < 1 || length > 18432) return new Hello(prefix.toByteArray(), false);
            byte[] body = exact(input,length); prefix.write(body);
            if (header[0] != 22 || header[1] != 3) return new Hello(prefix.toByteArray(), false);
            handshake.write(body); byte[] bytes = handshake.toByteArray();
            if (bytes.length < 4) continue; int size = (bytes[1]&255)*65536+(bytes[2]&255)*256+(bytes[3]&255);
            if (bytes[0] != 1 || size > 65532) return new Hello(prefix.toByteArray(), false);
            if (bytes.length >= size+4) return new Hello(prefix.toByteArray(), target(Arrays.copyOf(bytes,size+4)));
        }
        return new Hello(prefix.toByteArray(), false);
    }
    private static byte[] exact(InputStream input, int length) throws IOException { byte[] raw = new byte[length]; int at = 0, read; while (at < length && (read = input.read(raw,at,length-at)) != -1) at += read; if (at != length) throw new IOException(); return raw; }
    static boolean target(byte[] bytes) {
        try {
            if (bytes.length < 44 || bytes[0] != 1) return false;
            int cursor = 38, session = bytes[cursor]&255; cursor += 1+session;
            int cipher = CapturePackets.u16(bytes,cursor); cursor += 2+cipher;
            int compression = bytes[cursor]&255; cursor += 1+compression;
            int extensions = CapturePackets.u16(bytes,cursor); cursor += 2; int limit = cursor+extensions;
            if (limit > bytes.length) return false;
            while (cursor+4 <= limit) {
                int kind = CapturePackets.u16(bytes,cursor), length = CapturePackets.u16(bytes,cursor+2); cursor += 4;
                if (cursor+length > limit) return false;
                if (kind == 0) { int list = CapturePackets.u16(bytes,cursor), at = cursor+2, end = at+list; if (end != cursor+length) return false; boolean match = false;
                    while (at+3 <= end) { int type = bytes[at]&255, nameLength = CapturePackets.u16(bytes,at+1); at += 3; if (at+nameLength > end) return false;
                        if (type == 0) { if (match || !"h5.zeehoev.com".equalsIgnoreCase(new String(bytes,at,nameLength,StandardCharsets.US_ASCII))) return false; match = true; } at += nameLength; }
                    return match && at == end;
                }
                cursor += length;
            }
        } catch (RuntimeException ignored) { }
        return false;
    }
}
