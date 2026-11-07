package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import java.net.InetAddress;
import org.junit.Test;

public class MeterRouteTest {
    @Test public void onlyPrivateVerifiedPeerSubnetsCanSupplyTheBoundSocketSource() throws Exception {
        InetAddress peer = InetAddress.getByName("192.168.49.1");
        assertTrue(MeterRoute.source(InetAddress.getByName("192.168.49.2"), 24, peer));
        assertFalse(MeterRoute.source(InetAddress.getByName("192.168.50.2"), 24, peer));
        assertFalse(MeterRoute.source(peer, 24, peer));
        assertFalse(MeterRoute.source(InetAddress.getByName("192.168.49.2"), 8, peer));
        assertFalse(MeterRoute.source(InetAddress.getByName("192.168.49.2"), 31, peer));
        assertFalse(MeterRoute.source(InetAddress.getByName("8.8.8.2"), 24, InetAddress.getByName("8.8.8.1")));
        assertFalse(MeterRoute.source(InetAddress.getByName("::1"), 24, peer));
    }
    @Test public void competingSubnetDetectionIncludesBroadAndNonByteAlignedRoutes() throws Exception {
        InetAddress peer = InetAddress.getByName("192.168.49.1");
        assertTrue(MeterRoute.subnet(InetAddress.getByName("192.168.50.2"), 16, peer));
        assertTrue(MeterRoute.subnet(InetAddress.getByName("192.168.49.126"), 25, peer));
        assertFalse(MeterRoute.subnet(InetAddress.getByName("192.168.49.129"), 25, peer));
        assertFalse(MeterRoute.subnet(peer, -1, peer));
        assertFalse(MeterRoute.subnet(peer, 33, peer));
    }
}
