package app.geometrypanel.mobile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayDeque;
import java.util.Arrays;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.zip.GZIPInputStream;
import org.json.JSONArray;
import org.json.JSONObject;

/** Bounded HTTP/1 stream observer. It never writes packets, headers, URLs or credentials to logs. */
final class CaptureHttp {
    interface Found { void accept(String token, String uid); }
    private static final int MAX = 262144;
    private static final String[] TOKENS = {"token", "access_token", "accessToken", "satoken", "h5Token", "h5_token"};
    private static final String[] UIDS = {"userId", "user_id", "uid", "userid", "userNo", "memberId", "accountId", "account_id", "bindingUserId"};
    private final Found found;
    private final ArrayDeque<Identity> requests = new ArrayDeque<>();
    private final Stream outgoing = new Stream(false), incoming = new Stream(true);
    private static final class Identity { boolean target; String token = "", uid = ""; }
    CaptureHttp(Found found) { this.found = found; }
    synchronized void feed(boolean response, byte[] bytes, int count) { (response ? incoming : outgoing).feed(bytes, count, false); }
    synchronized void eof(boolean response) { (response ? incoming : outgoing).feed(new byte[0], 0, true); }
    static boolean validToken(String value) { return value != null && value.length() >= 12 && value.length() <= 8192 && !value.matches("(?s).*\\s.*") && !value.matches("(?i)null|undefined|true|false"); }
    static boolean validUid(String value) { return value != null && value.matches("[A-Za-z0-9_-]{1,64}"); }
    private void emit(Identity identity) { if (identity.target && validToken(identity.token) && validUid(identity.uid)) found.accept(identity.token, identity.uid); }
    private final class Stream {
        final boolean response; ByteArrayOutputStream buffer = new ByteArrayOutputStream(); boolean disabled;
        Stream(boolean response) { this.response = response; }
        void feed(byte[] raw, int count, boolean eof) {
            if (disabled) return;
            if (count < 0 || count > raw.length || buffer.size() + count > MAX) { disabled = true; buffer.reset(); return; }
            buffer.write(raw, 0, count);
            try {
                while (buffer.size() > 0) {
                    byte[] bytes = buffer.toByteArray(); int head = headerEnd(bytes);
                    if (head < 0) { if (bytes.length > 32768) disabled = true; return; }
                    String[] lines = new String(bytes, 0, head - 4, StandardCharsets.ISO_8859_1).split("\r\n");
                    Map<String,String> headers = headers(lines);
                    if (headers == null) { disabled = true; return; }
                    int status = response ? status(lines[0]) : 0;
                    boolean nobody = response ? status >= 100 && status < 200 || status == 204 || status == 304 : !headers.containsKey("content-length") && !headers.containsKey("transfer-encoding");
                    int consumed; byte[] body;
                    if (nobody) { consumed = head; body = new byte[0]; }
                    else if ("chunked".equalsIgnoreCase(headers.get("transfer-encoding"))) {
                        Chunk result = chunks(bytes, head); if (result == null) return; consumed = result.end; body = result.bytes;
                    } else if (headers.containsKey("transfer-encoding")) { disabled = true; return; }
                    else if (headers.containsKey("content-length")) {
                        int length = Integer.parseInt(headers.get("content-length")); if (length < 0 || length > MAX - head) { disabled = true; return; }
                        consumed = head + length; if (bytes.length < consumed) return; body = Arrays.copyOfRange(bytes, head, consumed);
                    } else { if (!eof) return; consumed = bytes.length; body = Arrays.copyOfRange(bytes, head, consumed); }
                    process(lines[0], headers, decoded(body, headers.get("content-encoding")), response, status);
                    buffer.reset(); buffer.write(bytes, consumed, bytes.length - consumed);
                }
            } catch (Exception error) { disabled = true; buffer.reset(); }
        }
    }
    private void process(String first, Map<String,String> headers, byte[] bytes, boolean response, int status) throws Exception {
        if (response && status >= 100 && status < 200) return;
        Identity identity;
        if (!response) {
            if (requests.size() >= 16) { outgoing.disabled = true; return; }
            identity = new Identity(); String[] parts = first.split(" ");
            if (parts.length < 3) return;
            URI uri = new URI(parts[1]); String host = headers.getOrDefault("host", "");
            if (uri.getHost() != null) host = uri.getHost();
            identity.target = host.equalsIgnoreCase("h5.zeehoev.com") || host.equalsIgnoreCase("h5.zeehoev.com:443");
            identity.target &= uri.getPath() != null && uri.getPath().toLowerCase(Locale.ROOT).endsWith("/h5/baseinfo");
            requests.add(identity); if (!identity.target) return;
            identity.token = query(uri.getRawQuery(), TOKENS); identity.uid = query(uri.getRawQuery(), UIDS);
            String auth = headers.getOrDefault("authorization", "");
            if (identity.token.isEmpty() && auth.matches("(?is)^bearer\\s+.+")) identity.token = auth.replaceFirst("(?i)^bearer\\s+", "").trim();
            if (identity.token.isEmpty()) for (String key : new String[] {"token", "access_token", "satoken", "x-token"}) if (headers.containsKey(key)) { identity.token = headers.get(key); break; }
            if (identity.uid.isEmpty()) for (String key : new String[] {"userid", "user_id", "uid", "accountid"}) if (headers.containsKey(key)) { identity.uid = headers.get(key); break; }
            cookies(identity, headers.getOrDefault("cookie", ""));
        } else {
            identity = requests.poll(); if (identity == null || !identity.target || status < 200 || status >= 400) return;
            String location = headers.getOrDefault("location", "");
            if (!location.isEmpty()) { URI uri = new URI(location); replace(identity, query(uri.getRawQuery(), TOKENS), query(uri.getRawQuery(), UIDS)); }
            cookies(identity, headers.getOrDefault("set-cookie", ""));
        }
        String verifiedUid = "";
        if (bytes.length > 0) try {
            JSONObject body = new JSONObject(new String(bytes, StandardCharsets.UTF_8));
            String token = field(body, TOKENS, 0), uid = field(body, UIDS, 0);
            if (uid.isEmpty() && response && body.optJSONObject("data") != null) uid = scalar(body.optJSONObject("data").opt("id"));
            replace(identity, token, uid);
            if (response) verifiedUid = uid;
        } catch (Exception ignored) { }
        // Bind the token to the authenticated baseInfo response identity, not an unverified request uid.
        if (response && validUid(verifiedUid)) { identity.uid = verifiedUid; emit(identity); }
    }
    private static void replace(Identity identity, String token, String uid) { if (!token.isEmpty()) identity.token = token.trim().replaceFirst("(?i)^bearer\\s+", ""); if (!uid.isEmpty()) identity.uid = uid; }
    private static String scalar(Object value) { return value instanceof String || value instanceof Number ? String.valueOf(value) : ""; }
    private static String field(Object object, String[] names, int depth) {
        if (depth > 8) return "";
        if (object instanceof JSONObject row) {
            for (String key : names) { String value = scalar(row.opt(key)); if (!value.isEmpty()) return value; }
            for (java.util.Iterator<String> keys = row.keys(); keys.hasNext();) { String result = field(row.opt(keys.next()), names, depth + 1); if (!result.isEmpty()) return result; }
        } else if (object instanceof JSONArray rows) { for (int i = 0; i < Math.min(rows.length(), 64); i++) { String result = field(rows.opt(i), names, depth + 1); if (!result.isEmpty()) return result; } }
        return "";
    }
    private static String query(String raw, String[] keys) {
        if (raw == null || raw.length() > 32768) return "";
        try { for (String pair : raw.split("&")) { String[] parts = pair.split("=", 2); if (parts.length != 2) continue; String key = URLDecoder.decode(parts[0], "UTF-8"); for (String expected : keys) if (expected.equalsIgnoreCase(key)) return URLDecoder.decode(parts[1], "UTF-8"); } } catch (Exception ignored) { }
        return "";
    }
    private static void cookies(Identity identity, String raw) { replace(identity, query(raw.replace(';', '&').replace(",", "&").replace(" ", ""), TOKENS), query(raw.replace(';', '&').replace(",", "&").replace(" ", ""), UIDS)); }
    private static int headerEnd(byte[] raw) { for (int i = 0; i + 3 < raw.length; i++) if (raw[i] == 13 && raw[i+1] == 10 && raw[i+2] == 13 && raw[i+3] == 10) return i+4; return -1; }
    private static int status(String first) { try { return Integer.parseInt(first.split(" ")[1]); } catch (Exception ignored) { return 0; } }
    private static Map<String,String> headers(String[] lines) {
        Map<String,String> result = new HashMap<>();
        for (int i = 1; i < lines.length; i++) { int colon = lines[i].indexOf(':'); if (colon <= 0 || lines[i].startsWith(" ") || lines[i].startsWith("\t")) return null;
            String key = lines[i].substring(0, colon).toLowerCase(Locale.ROOT), value = lines[i].substring(colon+1).trim();
            if (result.containsKey(key) && (key.equals("content-length") || key.equals("transfer-encoding") || key.equals("host"))) return null;
            result.merge(key, value, (oldValue,newValue) -> oldValue + ";" + newValue);
        }
        if (result.containsKey("content-length") && result.containsKey("transfer-encoding")) return null;
        return result;
    }
    private static final class Chunk { int end; byte[] bytes; Chunk(int end, byte[] bytes) { this.end = end; this.bytes = bytes; } }
    private static Chunk chunks(byte[] raw, int start) throws IOException {
        ByteArrayOutputStream output = new ByteArrayOutputStream(); int cursor = start;
        while (true) {
            int line = -1; for (int i = cursor; i+1 < raw.length; i++) if (raw[i] == 13 && raw[i+1] == 10) { line = i; break; }
            if (line < 0) return null; if (line-cursor > 1024) throw new IOException();
            int length; try { length = Integer.parseInt(new String(raw, cursor, line-cursor, StandardCharsets.US_ASCII).split(";", 2)[0], 16); } catch (Exception error) { throw new IOException(); }
            if (length < 0 || length > MAX-output.size()) throw new IOException(); cursor = line+2;
            if (length == 0) {
                if (cursor+2 <= raw.length && raw[cursor] == 13 && raw[cursor+1] == 10) return new Chunk(cursor+2, output.toByteArray());
                byte[] tail = Arrays.copyOfRange(raw, cursor, raw.length); int end = headerEnd(tail); return end < 0 ? null : new Chunk(cursor+end, output.toByteArray());
            }
            if (cursor+length+2 > raw.length) return null;
            if (raw[cursor+length] != 13 || raw[cursor+length+1] != 10) throw new IOException();
            output.write(raw, cursor, length); cursor += length+2;
        }
    }
    private static byte[] decoded(byte[] raw, String encoding) throws IOException {
        if (encoding == null || encoding.equalsIgnoreCase("identity")) return raw;
        if (!encoding.equalsIgnoreCase("gzip")) return new byte[0];
        try (GZIPInputStream input = new GZIPInputStream(new ByteArrayInputStream(raw)); ByteArrayOutputStream output = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192]; int read; while ((read = input.read(buffer)) != -1) { if (output.size()+read > MAX) throw new IOException(); output.write(buffer,0,read); } return output.toByteArray();
        }
    }
}
