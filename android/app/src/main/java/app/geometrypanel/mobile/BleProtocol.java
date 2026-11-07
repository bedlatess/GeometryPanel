package app.geometrypanel.mobile;

import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import javax.crypto.Cipher;
import javax.crypto.spec.SecretKeySpec;

/** Recovered framing and protobuf subset. Source: authorized APK e/zc/y6; no guessed car commands. */
final class BleProtocol {
    static final int[] REQUESTS = {0x5a, 0x5c, 0x77, 0x78, 0x7f, 0x7c, 0x72};
    private BleProtocol() { }
    static byte[] frame(int control, byte[] payload) {
        boolean allowed = false; for (int value : REQUESTS) allowed |= value == control;
        if (!allowed || payload.length > 240) throw new IllegalArgumentException("frame_invalid");
        byte[] frame = new byte[payload.length + 7];
        frame[0] = (byte) 0xab; frame[1] = (byte) 0xcd; frame[2] = (byte) control; frame[3] = (byte) payload.length;
        System.arraycopy(payload, 0, frame, 5, payload.length);
        int sum = control + payload.length; for (byte value : payload) sum += value & 255;
        frame[frame.length - 2] = (byte) sum; frame[frame.length - 1] = (byte) 0xcf;
        return frame;
    }
    static byte[] bytes(int field, byte[] value) {
        if (field < 1 || field > 31 || value.length > 230) throw new IllegalArgumentException("protobuf_limit");
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        writeVarint(out, field * 8L + 2); writeVarint(out, value.length); out.write(value, 0, value.length); return out.toByteArray();
    }
    static byte[] number(int field, long value) {
        if (field < 1 || field > 31 || value < 0) throw new IllegalArgumentException("protobuf_value");
        ByteArrayOutputStream out = new ByteArrayOutputStream(); writeVarint(out, field * 8L); writeVarint(out, value); return out.toByteArray();
    }
    static byte[] join(byte[] a, byte[] b) { byte[] value = Arrays.copyOf(a, a.length + b.length); System.arraycopy(b, 0, value, a.length, b.length); return value; }
    private static void writeVarint(ByteArrayOutputStream out, long value) {
        do { int item = (int) value & 127; value >>>= 7; out.write(item | (value != 0 ? 128 : 0)); } while (value != 0);
    }
    static final class Field {
        final int wire; final Object value;
        Field(int wire, Object value) { this.wire = wire; this.value = value; }
    }
    static Map<Integer, Field> parse(byte[] payload) {
        if (payload.length > 240) throw new IllegalArgumentException("protobuf_limit");
        ByteBuffer buffer = ByteBuffer.wrap(payload).order(ByteOrder.LITTLE_ENDIAN);
        Map<Integer, Field> fields = new LinkedHashMap<>();
        while (buffer.hasRemaining()) {
            long tag = varint(buffer);
            if ((tag >>> 3) > 0x1fffffff) throw new IllegalArgumentException("protobuf_field");
            int id = (int) (tag >>> 3), wire = (int) (tag & 7);
            if (id < 1 || id > 0x1fffffff || fields.containsKey(id) || fields.size() >= 64) throw new IllegalArgumentException("protobuf_field");
            Object value;
            switch (wire) {
                case 0: value = varint(buffer); break;
                case 1: if (buffer.remaining() < 8) throw new IllegalArgumentException("protobuf_truncated"); value = buffer.getLong(); break;
                case 2:
                    long length = varint(buffer);
                    if (length < 0 || length > buffer.remaining()) throw new IllegalArgumentException("protobuf_length");
                    byte[] bytes = new byte[(int) length]; buffer.get(bytes); value = bytes; break;
                case 5: if (buffer.remaining() < 4) throw new IllegalArgumentException("protobuf_truncated"); value = buffer.getFloat(); break;
                default: throw new IllegalArgumentException("protobuf_wire");
            }
            fields.put(id, new Field(wire, value));
        }
        return fields;
    }
    private static long varint(ByteBuffer buffer) {
        long result = 0;
        for (int i = 0; i < 10; i++) {
            if (!buffer.hasRemaining()) throw new IllegalArgumentException("protobuf_truncated");
            int value = buffer.get() & 255;
            if (i == 9 && (value & 254) != 0) throw new IllegalArgumentException("protobuf_varint");
            result |= (long) (value & 127) << (7 * i);
            if ((value & 128) == 0) return result;
        }
        throw new IllegalArgumentException("protobuf_varint");
    }
    static long number(Map<Integer, Field> fields, int field, long fallback) {
        Field value = fields.get(field); return value == null ? fallback : value.wire == 0 ? (Long) value.value : Long.MIN_VALUE;
    }
    // The recovered vehicle challenge protocol specifically requires ECB decryption. Storage uses GCM.
    @android.annotation.SuppressLint("GetInstance")
    static byte[] challenge(byte[] payload, String key) throws Exception {
        Field challenge = parse(payload).get(1);
        if (challenge == null || challenge.wire != 2) throw new IllegalArgumentException("challenge_invalid");
        String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT)
                .decode(ByteBuffer.wrap((byte[]) challenge.value)).toString();
        byte[] encrypted = hex(text, -1), keyBytes = key.getBytes(StandardCharsets.UTF_8);
        try {
            if (encrypted.length < 16 || encrypted.length % 16 != 0 || encrypted.length > 192) throw new IllegalArgumentException("challenge_invalid");
            Cipher cipher = Cipher.getInstance("AES/ECB/PKCS5Padding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(keyBytes, "AES"));
            byte[] plain = cipher.doFinal(encrypted);
            try { return bytes(1, plain); } finally { Arrays.fill(plain, (byte) 0); }
        } finally { Arrays.fill(encrypted, (byte) 0); Arrays.fill(keyBytes, (byte) 0); }
    }
    static byte[] hex(String value, int length) {
        if (value == null || value.length() % 2 != 0 || value.length() > 4096 || !value.matches("[0-9a-fA-F]*") || length >= 0 && value.length() != length * 2)
            throw new IllegalArgumentException("hex_invalid");
        byte[] bytes = new byte[value.length() / 2]; for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) Integer.parseInt(value.substring(i * 2, i * 2 + 2), 16); return bytes;
    }
    static String hex(byte[] bytes) { StringBuilder out = new StringBuilder(); for (byte value : bytes) out.append(String.format(java.util.Locale.ROOT, "%02x", value & 255)); return out.toString(); }
    static final class Frame { final int control; final byte[] payload; Frame(int control, byte[] payload) { this.control = control; this.payload = payload; } }
    static final class Decoder {
        private byte[] pending = new byte[0];
        List<Frame> accept(byte[] bytes) {
            if (bytes.length > 2048 || pending.length + bytes.length > 2048) { pending = new byte[0]; throw new IllegalArgumentException("notification_limit"); }
            pending = join(pending, bytes); List<Frame> frames = new ArrayList<>(); int offset = 0;
            while (pending.length - offset >= 7) {
                if ((pending[offset] & 255) != 0xab || (pending[offset + 1] & 255) != 0xcd) { offset++; continue; }
                int length = (pending[offset + 3] & 255) | (pending[offset + 4] & 255) << 8;
                if (length > 240) { offset++; continue; }
                if (pending.length - offset < length + 7) break;
                int control = pending[offset + 2] & 255, sum = control + length;
                for (int i = 0; i < length; i++) sum += pending[offset + 5 + i] & 255;
                if ((sum & 255) == (pending[offset + length + 5] & 255) && (pending[offset + length + 6] & 255) == 0xcf) {
                    frames.add(new Frame(control, Arrays.copyOfRange(pending, offset + 5, offset + 5 + length))); offset += length + 7;
                } else offset++;
            }
            pending = Arrays.copyOfRange(pending, offset, pending.length); return frames;
        }
    }
}
