package app.geometrypanel.mobile;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.net.Socket;
import java.nio.ByteBuffer;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import org.json.JSONObject;

final class WallpaperTransfer implements AutoCloseable {
    interface Progress { void progress(long sent, long size); }
    private volatile Socket socket;
    private volatile boolean cancelled, sent;
    boolean requestSent() { return sent; }
    void send(MeterConnection connection, File file, JSONObject options, Progress progress) throws Exception {
        String number = NativeJson.string(options, "wallpaperNum", 4096), display = NativeJson.string(options, "displayWallpaperSet", 4096);
        int width = options.optInt("width"), height = options.optInt("height");
        if (number.trim().isEmpty() || display.trim().isEmpty() || width < 1 || height < 1) throw new IOException("wallpaper_template_missing");
        String md5 = WallpaperArchive.validate(file, width, height);
        try {
            socket = connection.socket(10950);
            long deadline = System.nanoTime() + 120_000_000_000L;
            JSONObject metadata = NativeJson.obj("fileName", "GeometryPanel.zip", "fileSize", file.length(), "md5", md5, "wallpaperNum", number, "displayWallpaperSet", display);
            check(connection, deadline); sent = true;
            MeterProtocol.wallpaper(socket.getOutputStream(), 0x10000043, true, metadata.toString().getBytes(StandardCharsets.UTF_8));
            ack(socket, 0x80000043);
            MessageDigest digest = MessageDigest.getInstance("MD5");
            try (FileInputStream input = new FileInputStream(file)) {
                byte[] buffer = new byte[65536]; int count; long total = 0;
                while ((count = input.read(buffer)) >= 0) {
                    if (count == 0) continue; check(connection, deadline); digest.update(buffer, 0, count);
                    MeterProtocol.wallpaper(socket.getOutputStream(), 0x10000044, false, java.util.Arrays.copyOf(buffer, count));
                    total += count; progress.progress(total, file.length());
                }
                if (total != file.length() || !BleProtocol.hex(digest.digest()).equals(md5)) throw new IOException("wallpaper_file_changed");
            }
            check(connection, deadline);
            MeterProtocol.wallpaper(socket.getOutputStream(), 0x10000045, true, new byte[0]);
            ack(socket, 0x80000045); ack(socket, 0x10000046);
        } finally { close(); }
    }
    private void check(MeterConnection connection, long deadline) throws IOException { if (cancelled || !connection.valid() || System.nanoTime() > deadline) throw new IOException("transfer_cancelled_or_timeout"); }
    static void ack(Socket socket, int command) throws Exception {
        byte[] payload = MeterProtocol.wallpaper(socket.getInputStream(), command).payload;
        String text = StandardCharsets.UTF_8.newDecoder().onMalformedInput(CodingErrorAction.REPORT).onUnmappableCharacter(CodingErrorAction.REPORT).decode(ByteBuffer.wrap(payload)).toString();
        validateAck(text);
    }
    static void validateAck(String text) throws Exception {
        // Parse root keys ourselves: Android's JSONObject can silently overwrite duplicate keys.
        if (text.length() > 65536) throw new IOException("wallpaper_ack_limit");
        int depth = 0; boolean inString = false, escaped = false;
        for (int i = 0; i < text.length(); i++) {
            char character = text.charAt(i);
            if (inString) { if (escaped) escaped = false; else if (character == '\\') escaped = true; else if (character == '"') inString = false; }
            else if (character == '"') inString = true;
            else if (character == '{' || character == '[') { if (++depth > 16) throw new IOException("wallpaper_ack_depth"); }
            else if (character == '}' || character == ']') { if (--depth < 0) throw new IOException("wallpaper_ack_json"); }
            else if (character == '\'') throw new IOException("wallpaper_ack_json");
        }
        if (inString || depth != 0) throw new IOException("wallpaper_ack_json");
        org.json.JSONTokener reader = new org.json.JSONTokener(text);
        if (reader.nextClean() != '{') throw new IOException("wallpaper_ack_json");
        boolean seen = false; String code = null;
        char next = reader.nextClean();
        if (next != '}') {
            reader.back();
            while (true) {
                if (reader.nextClean() != '"') throw new IOException("wallpaper_ack_key");
                reader.back(); Object key = reader.nextValue();
                if (!(key instanceof String) || reader.nextClean() != ':') throw new IOException("wallpaper_ack_key");
                Object value = reader.nextValue();
                if (key.equals("code")) {
                    if (seen || !(value instanceof String)) throw new IOException("wallpaper_ack_duplicate_or_type");
                    seen = true; code = (String) value;
                }
                char delimiter = reader.nextClean(); if (delimiter == '}') break;
                if (delimiter != ',') throw new IOException("wallpaper_ack_json");
            }
        }
        if (reader.nextClean() != 0 || !seen || !"1".equals(code)) throw new IOException("wallpaper_rejected");
    }
    @Override public void close() { cancelled = true; Socket old = socket; socket = null; if (old != null) try { old.close(); } catch (IOException ignored) { } }
}
