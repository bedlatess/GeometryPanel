package app.geometrypanel.mobile;

import java.io.EOFException;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;

final class MeterProtocol {
    private MeterProtocol() { }
    static byte[] annexB(byte[] input) throws IOException {
        if (input.length < 4 || input.length > 2 * 1024 * 1024) throw new IOException("avc_length");
        if (input[0] == 0 && input[1] == 0 && (input[2] == 1 || input[2] == 0 && input[3] == 1)) return input;
        java.io.ByteArrayOutputStream output = new java.io.ByteArrayOutputStream(); ByteBuffer bytes = ByteBuffer.wrap(input).order(ByteOrder.BIG_ENDIAN);
        while (bytes.hasRemaining()) {
            if (bytes.remaining() < 4) throw new IOException("avc_length");
            int length = bytes.getInt(); if (length < 1 || length > bytes.remaining()) throw new IOException("avc_length");
            output.write(new byte[] {0,0,0,1}); byte[] nal = new byte[length]; bytes.get(nal); output.write(nal);
        }
        return output.toByteArray();
    }
    static byte[] read(InputStream input, int length, int max) throws IOException {
        if (length < 0 || length > max) throw new IOException("frame_limit");
        byte[] bytes = new byte[length]; int offset = 0;
        while (offset < length) { int count = input.read(bytes, offset, length - offset); if (count < 0) throw new EOFException("frame_truncated"); if (count == 0) continue; offset += count; }
        return bytes;
    }
    static byte[] control(int command, byte[] payload) {
        if (payload.length > 262128) throw new IllegalArgumentException("control_limit");
        int length = payload.length + 16;
        return ByteBuffer.allocate(length).order(ByteOrder.LITTLE_ENDIAN).putInt(command).putInt(length).putInt(command ^ length).putInt(0).put(payload).array();
    }
    static Frame control(InputStream input) throws IOException {
        ByteBuffer header = ByteBuffer.wrap(read(input, 16, 16)).order(ByteOrder.LITTLE_ENDIAN);
        int command = header.getInt(), length = header.getInt(), check = header.getInt(), reserved = header.getInt();
        if (length < 16 || length > 262144 || (command ^ length) != check || reserved != 0) throw new IOException("control_header");
        return new Frame(command, 0, read(input, length - 16, 262128));
    }
    static byte[] media(int command, int sequence, byte[] payload) {
        if (command < 0 || command > 65535 || payload.length > 65535) throw new IllegalArgumentException("media_limit");
        return ByteBuffer.allocate(payload.length + 8).order(ByteOrder.LITTLE_ENDIAN).putShort((short) command).putShort((short) payload.length).putInt(sequence).put(payload).array();
    }
    static Frame media(InputStream input) throws IOException {
        ByteBuffer header = ByteBuffer.wrap(read(input, 8, 8)).order(ByteOrder.LITTLE_ENDIAN);
        int command = header.getShort() & 65535, length = header.getShort() & 65535, sequence = header.getInt();
        return new Frame(command, sequence, read(input, length, 65535));
    }
    static void wallpaper(OutputStream output, int command, boolean metadata, byte[] payload) throws IOException {
        if (payload.length > 65536) throw new IOException("wallpaper_limit");
        output.write(ByteBuffer.allocate(10).order(ByteOrder.BIG_ENDIAN).put((byte) 1).put((byte) (metadata ? 1 : 0)).putInt(command).putInt(payload.length).array());
        output.write(payload); output.flush();
    }
    static Frame wallpaper(InputStream input, int expected) throws IOException {
        ByteBuffer header = ByteBuffer.wrap(read(input, 10, 10)).order(ByteOrder.BIG_ENDIAN);
        int version = header.get() & 255, flag = header.get() & 255, command = header.getInt(), length = header.getInt();
        if (version != 1 || flag != 2 || command != expected || length < 1 || length > 65536) throw new IOException("wallpaper_ack_header");
        return new Frame(command, 0, read(input, length, 65536));
    }
    static final class Frame {
        final int command, sequence; final byte[] payload;
        Frame(int command, int sequence, byte[] payload) { this.command = command; this.sequence = sequence; this.payload = payload; }
    }
}
