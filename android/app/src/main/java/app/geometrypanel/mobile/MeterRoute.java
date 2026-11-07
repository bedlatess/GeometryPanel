package app.geometrypanel.mobile;

import java.net.Inet4Address;
import java.net.InetAddress;

final class MeterRoute {
    private MeterRoute() { }
    static boolean subnet(InetAddress address, int prefix, InetAddress peer) {
        if (!(address instanceof Inet4Address) || !(peer instanceof Inet4Address) || prefix < 0 || prefix > 32) return false;
        byte[] left = address.getAddress(), right = peer.getAddress();
        for (int bit = 0; bit < prefix; bit++) if (((left[bit / 8] ^ right[bit / 8]) & (1 << (7 - bit % 8))) != 0) return false;
        return true;
    }
    static boolean source(InetAddress address, int prefix, InetAddress peer) {
        return prefix >= 16 && prefix <= 30 && address.isSiteLocalAddress() && !address.equals(peer) && subnet(address, prefix, peer);
    }
}
