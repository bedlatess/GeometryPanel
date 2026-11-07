package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.zip.GZIPOutputStream;
import org.junit.Test;

public class CaptureHttpTest {
    private void send(CaptureHttp capture, boolean response, String text) { byte[] raw = text.getBytes(StandardCharsets.UTF_8); for (int i = 0; i < raw.length; i += 7) { byte[] chunk = java.util.Arrays.copyOfRange(raw,i,Math.min(raw.length,i+7)); capture.feed(response,chunk,chunk.length); } }
    @Test public void onlyExactH5HostAndBaseInfoCanYieldAnIdentity() {
        ArrayList<String> results = new ArrayList<>(); CaptureHttp capture = new CaptureHttp((token,uid) -> results.add(uid));
        send(capture,false,"GET /other?token=synthetic-token-123&uid=user-one HTTP/1.1\r\nHost: h5.zeehoev.com\r\n\r\n");
        send(capture,true,"HTTP/1.1 204 No Content\r\n\r\n");
        send(capture,false,"GET /H5/baseInfo?token=synthetic-token-123&uid=user-two HTTP/1.1\r\nHost: h5.zeehoev.com.evil.test\r\n\r\n");
        send(capture,true,"HTTP/1.1 204 No Content\r\n\r\n");
        assertTrue(results.isEmpty());
        send(capture,false,"GET /cfmotoservermine/H5/baseInfo?token=synthetic-token-123&uid=user-three HTTP/1.1\r\nHost: h5.zeehoev.com\r\n\r\n");
        assertTrue(results.isEmpty()); String body = "{\"data\":{\"id\":\"user-three\"}}";
        send(capture,true,"HTTP/1.1 200 OK\r\nContent-Length: "+body.length()+"\r\n\r\n"+body);
        assertEquals(java.util.List.of("user-three"),results);
    }
    @Test public void responseDataIdPairsOnlyWithItsOwnRequestAndSupportsChunkedGzip() throws Exception {
        ArrayList<String> results = new ArrayList<>(); CaptureHttp capture = new CaptureHttp((token,uid) -> results.add(token+"|"+uid));
        send(capture,false,"GET /H5/baseInfo HTTP/1.1\r\nHost: h5.zeehoev.com\r\nAuthorization: Bearer synthetic-token-123\r\n\r\n");
        ByteArrayOutputStream compressed = new ByteArrayOutputStream(); try (GZIPOutputStream zip = new GZIPOutputStream(compressed)) { zip.write("{\"data\":{\"id\":\"synthetic-user\"}}".getBytes(StandardCharsets.UTF_8)); }
        byte[] gzip = compressed.toByteArray(); send(capture,true,"HTTP/1.1 200 OK\r\nTransfer-Encoding: chunked\r\nContent-Encoding: gzip\r\n\r\n"+Integer.toHexString(gzip.length)+"\r\n"); capture.feed(true,gzip,gzip.length); send(capture,true,"\r\n0\r\n\r\n");
        assertEquals(java.util.List.of("synthetic-token-123|synthetic-user"),results);
        send(capture,false,"GET /H5/baseInfo?uid=another-user HTTP/1.1\r\nHost: h5.zeehoev.com\r\n\r\n"); send(capture,true,"HTTP/1.1 204 No Content\r\n\r\n"); assertEquals(1,results.size());
    }
    @Test public void ambiguousFramingAndOversizedBodiesNeverYieldCredentials() {
        ArrayList<String> results = new ArrayList<>(); CaptureHttp capture = new CaptureHttp((token,uid) -> results.add(uid));
        send(capture,false,"POST /H5/baseInfo?token=synthetic-token-123&uid=user HTTP/1.1\r\nHost: h5.zeehoev.com\r\nContent-Length: 0\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n");
        assertTrue(results.isEmpty()); assertFalse(CaptureHttp.validToken("bad token-long-enough")); assertFalse(CaptureHttp.validUid("id?token=x"));
        CaptureHttp bounded = new CaptureHttp((token,uid) -> fail()); bounded.feed(false,new byte[262145],262145);
    }
}
