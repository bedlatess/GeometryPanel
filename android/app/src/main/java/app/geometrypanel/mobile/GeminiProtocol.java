package app.geometrypanel.mobile;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

final class GeminiProtocol {
    static final long MAX_FILE = 512L * 1024 * 1024;
    private GeminiProtocol() { }
    static void send(OutputStream output, int command, byte[] payload) throws IOException {
        if (payload.length > 65536) throw new IOException("gemini_frame_limit");
        output.write(ByteBuffer.allocate(10).order(ByteOrder.BIG_ENDIAN).putShort((short) 0).putInt(command).putInt(payload.length).array()); output.write(payload); output.flush();
    }
    static byte[] receive(InputStream input, int expected) throws IOException {
        for (int skipped = 0; skipped < 32; skipped++) {
            ByteBuffer header = ByteBuffer.wrap(MeterProtocol.read(input, 10, 10)).order(ByteOrder.BIG_ENDIAN);
            int marker = header.getShort() & 65535, command = header.getInt(), length = header.getInt();
            if (marker != 0 || length < 0 || length > 65536 || command != expected && command != 0x10000002) throw new IOException("gemini_response_invalid");
            byte[] body = MeterProtocol.read(input, length, 65536); if (command == expected) return body;
        }
        throw new IOException("gemini_unexpected_messages");
    }
    static boolean filename(String value) { return value != null && value.length() <= 200 && value.toLowerCase(java.util.Locale.ROOT).endsWith(".bin") && !value.matches("(?s).*[\\/\\\\\\p{Cntrl}].*"); }
}
