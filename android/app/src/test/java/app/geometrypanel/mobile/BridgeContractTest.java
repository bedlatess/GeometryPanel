package app.geometrypanel.mobile;

import static org.junit.Assert.*;
import org.junit.Test;

public class BridgeContractTest {
    @Test public void nonceAndSerialIdsFromTheWebClientAreAccepted() {
        assertTrue(BridgeContract.validId("f1bc2d66-3b5f-40ef-8b32-19f59b92fced:1"));
        assertTrue(BridgeContract.validId("f1bc2d66-3b5f-40ef-8b32-19f59b92fced:9999"));
        assertFalse(BridgeContract.validId("request\n1"));
        assertFalse(BridgeContract.validId("<script>"));
        assertFalse(BridgeContract.validId("a".repeat(101)));
    }
}
