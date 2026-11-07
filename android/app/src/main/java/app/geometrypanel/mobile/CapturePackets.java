package app.geometrypanel.mobile;

import java.io.IOException;
import java.util.Arrays;

/** Minimal IPv4/TCP NAT and UDP DNS packet codec. No payload parsing or persistence. */
final class CapturePackets {
    private CapturePackets() { }
    static int u16(byte[] packet, int at) { return (packet[at] & 255) << 8 | packet[at+1] & 255; }
    static int ip(byte[] packet, int at) { return (packet[at] & 255) << 24 | (packet[at+1] & 255) << 16 | (packet[at+2] & 255) << 8 | packet[at+3] & 255; }
    static void put16(byte[] packet, int at, int value) { packet[at] = (byte) (value >>> 8); packet[at+1] = (byte) value; }
    static void putIp(byte[] packet, int at, int value) { packet[at] = (byte) (value >>> 24); packet[at+1] = (byte) (value >>> 16); packet[at+2] = (byte) (value >>> 8); packet[at+3] = (byte) value; }
    static int header(byte[] raw, int size) throws IOException {
        if (size < 20 || size > raw.length || (raw[0] & 0xf0) != 0x40) throw new IOException();
        int h = (raw[0] & 15) * 4, length = u16(raw, 2);
        if (h < 20 || h > size || length != size || (u16(raw, 6) & 0x3fff) != 0) throw new IOException();
        int protocol = raw[9] & 255;
        if (protocol == 6 && (size < h+20 || ((raw[h+12] >>> 4) & 15) * 4 < 20 || h+((raw[h+12] >>> 4) & 15) * 4 > size)) throw new IOException();
        if (protocol == 17 && (size < h+8 || u16(raw, h+4) != size-h)) throw new IOException();
        return h;
    }
    static int checksum(byte[] raw, int from, int length, long initial) {
        long sum = initial; for (int i = 0; i < length; i += 2) sum += (raw[from+i] & 255) * 256 + (i+1 < length ? raw[from+i+1] & 255 : 0);
        while ((sum >>> 16) != 0) sum = (sum & 65535) + (sum >>> 16); return (int) (~sum & 65535);
    }
    static void checksums(byte[] raw) throws IOException {
        int h = header(raw, raw.length), protocol = raw[9] & 255; put16(raw, 10, 0); put16(raw, 10, checksum(raw, 0, h, 0));
        if (protocol == 6 || protocol == 17) { int at = h + (protocol == 6 ? 16 : 6); put16(raw, at, 0);
            long pseudo = u16(raw,12)+u16(raw,14)+u16(raw,16)+u16(raw,18)+protocol+raw.length-h;
            int checksum = checksum(raw, h, raw.length-h, pseudo); put16(raw, at, checksum == 0 && protocol == 17 ? 65535 : checksum);
        }
    }
    static byte[] tcp(byte[] raw, int source, int destination, int sourcePort, int destinationPort) throws IOException {
        byte[] packet = raw.clone(); int h = header(packet, packet.length); if (packet[9] != 6) throw new IOException();
        putIp(packet,12,source); putIp(packet,16,destination); put16(packet,h,sourcePort); put16(packet,h+2,destinationPort); checksums(packet); return packet;
    }
    static byte[] dnsReply(byte[] query, byte[] answer) throws IOException {
        int h = header(query, query.length); if (query[9] != 17 || answer.length < 12 || answer.length > 4096 || query.length < h+20 || u16(query,h+2) != 53) throw new IOException();
        if (query[h+8] != answer[0] || query[h+9] != answer[1] || (answer[2] & 0x80) == 0) throw new IOException();
        byte[] packet = Arrays.copyOf(query, h+8+answer.length); put16(packet,2,packet.length); putIp(packet,12,ip(query,16)); putIp(packet,16,ip(query,12));
        put16(packet,h,53); put16(packet,h+2,u16(query,h)); put16(packet,h+4,answer.length+8); System.arraycopy(answer,0,packet,h+8,answer.length); checksums(packet); return packet;
    }
    static String address(int ip) { return ((ip >>> 24) & 255) + "." + ((ip >>> 16) & 255) + "." + ((ip >>> 8) & 255) + "." + (ip & 255); }
}
