package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import org.junit.Test;

public class CapturePacketsTest {
    private byte[] tcp() throws Exception { byte[] raw = new byte[43]; raw[0]=0x45; raw[8]=64; raw[9]=6; CapturePackets.put16(raw,2,raw.length); CapturePackets.putIp(raw,12,0x0a010a01); CapturePackets.putIp(raw,16,0xc0000201); CapturePackets.put16(raw,20,32123); CapturePackets.put16(raw,22,443); raw[32]=0x50; raw[33]=2; raw[40]=1; raw[41]=2; raw[42]=3; CapturePackets.checksums(raw); return raw; }
    @Test public void tcpTranslationPreservesPayloadAndBothChecksums() throws Exception {
        byte[] original = tcp(), translated = CapturePackets.tcp(original,0xc0000201,0x0a010a01,40123,50123);
        assertEquals(0,CapturePackets.checksum(translated,0,20,0)); long pseudo = CapturePackets.u16(translated,12)+CapturePackets.u16(translated,14)+CapturePackets.u16(translated,16)+CapturePackets.u16(translated,18)+6+23;
        assertEquals(0,CapturePackets.checksum(translated,20,23,pseudo));
        assertArrayEquals(original,CapturePackets.tcp(translated,0x0a010a01,0xc0000201,32123,443));
        original[6]=0x20; assertThrows(Exception.class,() -> CapturePackets.header(original,original.length));
    }
    @Test public void dnsRequiresMatchingTransactionAndBuildsValidReply() throws Exception {
        byte[] query = new byte[40]; query[0]=0x45; query[8]=64; query[9]=17; CapturePackets.put16(query,2,40); CapturePackets.putIp(query,12,0x0a010a01); CapturePackets.putIp(query,16,0x0a010a02); CapturePackets.put16(query,20,42001); CapturePackets.put16(query,22,53); CapturePackets.put16(query,24,20); query[28]=1; query[29]=2; CapturePackets.checksums(query);
        byte[] answer = new byte[12]; answer[0]=1; answer[1]=2; answer[2]=(byte)128; byte[] reply = CapturePackets.dnsReply(query,answer);
        assertEquals(53,CapturePackets.u16(reply,20)); assertEquals(42001,CapturePackets.u16(reply,22)); assertEquals(0,CapturePackets.checksum(reply,0,20,0)); answer[1]=3; assertThrows(Exception.class,() -> CapturePackets.dnsReply(query,answer));
    }
}
