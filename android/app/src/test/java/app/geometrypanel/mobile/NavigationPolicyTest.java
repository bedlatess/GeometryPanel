package app.geometrypanel.mobile;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import org.junit.Test;

public class NavigationPolicyTest {
    @Test public void panelAllowsOnlyItsHttpsScope() {
        assertTrue(NavigationPolicy.isPanel("https://bedlatess.github.io/GeometryPanel/"));
        assertTrue(NavigationPolicy.isPanel("https://BEDLATESS.github.io:443/GeometryPanel/index.html?from=app#daily"));
        for (String value : new String[] {
                "http://bedlatess.github.io/GeometryPanel/", "https://bedlatess.github.io/GeometryPanelFake/",
                "https://bedlatess.github.io/other/", "https://bedlatess.github.io:8443/GeometryPanel/",
                "https://bedlatess.github.io.evil.example/GeometryPanel/", "https://evil.example@bedlatess.github.io/GeometryPanel/",
                "https://bedlatess.github.io/GeometryPanel/../other/", "https://bedlatess.github.io/GeometryPanel/%2e%2e/other/",
                "https://bedlatess.github.io/GeometryPanel/%5Cevil", "javascript:alert(1)", "file:///data/local/", null }) {
            assertFalse("Unexpected panel navigation accepted", NavigationPolicy.isPanel(value));
        }
    }

    @Test public void externalAndMapLinksMustBeHttps() {
        assertTrue(NavigationPolicy.isHttps("https://uri.amap.com/marker?position=116.397,39.908"));
        assertTrue(NavigationPolicy.isHttps("https://github.com/bedlatess/GeometryPanel"));
        for (String value : new String[] { "http://uri.amap.com/", "intent://map", "tel:10086", "data:text/html,hello",
                "javascript:alert(1)", "content://downloads/1", "file:///sdcard/file", "https://example.org:8000/", "https://u:p@example.org/", "https://", null }) {
            assertFalse("Unexpected external scheme accepted", NavigationPolicy.isHttps(value));
        }
    }
}
