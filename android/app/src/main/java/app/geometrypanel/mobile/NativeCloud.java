package app.geometrypanel.mobile;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.Proxy;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.Map;
import java.util.TreeMap;
import org.json.JSONObject;

/** Fixed host and recovered request signer. No logging, cookie jar or redirects. */
final class NativeCloud {
    static final String APP = "/v1.0/app/cfmotoserverapp";
    interface Guard { void check() throws IOException; }
    private static final String SECRET = "c5e0da7f4da28df805694ec3dd1fc6792e9df99d";
    static String digest(String value, String algorithm) throws Exception {
        return BleProtocol.hex(MessageDigest.getInstance(algorithm).digest(value.getBytes(StandardCharsets.UTF_8)));
    }
    static String signature(String canonical, String body, String parameters) throws Exception {
        return digest(digest(canonical + body + parameters + SECRET, "SHA-1"), "MD5");
    }
    static String canonical(Map<String, String> query) {
        StringBuilder text = new StringBuilder();
        for (Map.Entry<String, String> row : new TreeMap<>(query).entrySet()) {
            if (!row.getKey().matches("[A-Za-z][A-Za-z0-9_]{0,63}") || !row.getValue().matches("[A-Za-z0-9_.:-]{0,256}")) throw new IllegalArgumentException("invalid_query");
            if (!row.getValue().isEmpty()) { if (text.length() > 0) text.append('&'); text.append(row.getKey()).append('=').append(row.getValue()); }
        }
        return text.toString();
    }
    Object request(String path, String method, Map<String, String> query, JSONObject body, String token, Guard guard) throws Exception {
        return request(false, path, method, query, body, token, guard);
    }
    Object h5(String path, String method, Map<String, String> query, JSONObject body, String token, Guard guard) throws Exception { return request(true, path, method, query, body, token, guard); }
    private Object request(boolean h5, String path, String method, Map<String, String> query, JSONObject body, String token, Guard guard) throws Exception {
        if (!path.matches(h5 ? "/cfmotoservermine/H5/[A-Za-z0-9/_-]+" : "/v1\\.0/[A-Za-z0-9/_-]+") || !method.matches("GET|POST|PUT|DELETE") || token == null || token.isEmpty() || token.matches("(?s).*\\s.*")) throw new IllegalArgumentException("invalid_cloud_request");
        guard.check(); String canonical = canonical(query), content = body == null ? "" : body.toString();
        long now = System.currentTimeMillis(); byte[] random = new byte[8]; new SecureRandom().nextBytes(random);
        String parameters = h5 ? "appId=AiTXmBrm&nonce=" + java.util.UUID.randomUUID() + "&timestamp=" + now : "appId=S7qPWPU1&nonce=" + now + BleProtocol.hex(random) + "&timestamp=" + now;
        String signed = h5 ? digest(digest(canonical + content + parameters + "70c2c7458ab88ca9504ad0521f170075bc91f2f7", "SHA-1"), "MD5") : signature(canonical, content, parameters);
        HttpURLConnection connection = (HttpURLConnection) new URL((h5 ? "https://h5.zeehoev.com" : "https://tapi.zeehoev.com") + path + (canonical.isEmpty() ? "" : "?" + canonical)).openConnection(Proxy.NO_PROXY);
        try {
            connection.setInstanceFollowRedirects(false); connection.setUseCaches(false); connection.setConnectTimeout(10000); connection.setReadTimeout(15000);
            connection.setRequestMethod(method); connection.setRequestProperty("Authorization", "Bearer " + token);
            connection.setRequestProperty("Content-Type", "application/json;charset=UTF-8"); connection.setRequestProperty("Accept-Language", "zh-CN");
            connection.setRequestProperty("interfaceversion", "2"); connection.setRequestProperty("cfmoto-x-param", parameters);
            connection.setRequestProperty("cfmoto-x-sign", signed); connection.setRequestProperty("cfmoto-x-sign-type", "0");
            connection.setRequestProperty("Accept-Encoding", "identity");
            if (body != null) { byte[] wire = content.getBytes(StandardCharsets.UTF_8); connection.setDoOutput(true); connection.setFixedLengthStreamingMode(wire.length); guard.check(); try (java.io.OutputStream output = connection.getOutputStream()) { output.write(wire); } }
            int status = connection.getResponseCode(); if (status == 401) throw new IOException("auth_expired");
            if (status < 200 || status >= 300) throw new IOException("cloud_http_rejected");
            ByteArrayOutputStream output = new ByteArrayOutputStream();
            try (InputStream input = connection.getInputStream()) {
                byte[] block = new byte[8192]; int read;
                while ((read = input.read(block)) != -1) { guard.check(); if (output.size() + read > 524288) throw new IOException("cloud_response_limit"); output.write(block, 0, read); }
            }
            JSONObject result = new JSONObject(new String(output.toByteArray(), StandardCharsets.UTF_8)); guard.check();
            if (!"10000".equals(String.valueOf(result.opt("code")))) {
                String detail = result.optString("message", "").toLowerCase(java.util.Locale.ROOT);
                if (detail.contains("invalid_token") || detail.contains("登录失效") || detail.contains("登录过期") || detail.contains("重新登录") || detail.contains("token过期")) throw new IOException("auth_expired");
                throw new IOException("cloud_business_rejected");
            }
            return acceptedData(result,method);
        } finally { connection.disconnect(); }
    }
    static Object acceptedData(JSONObject result, String method) throws IOException {
        Object data = result.opt("data"); if (!"GET".equals(method) && Boolean.FALSE.equals(data)) throw new IOException("cloud_business_rejected"); return data;
    }
}
