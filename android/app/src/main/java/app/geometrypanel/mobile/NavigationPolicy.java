package app.geometrypanel.mobile;

import java.net.URI;
import java.net.URISyntaxException;

/** Main-frame scope is fixed. Map frames may use HTTPS; external links leave the app. */
final class NavigationPolicy {
    private NavigationPolicy() { }

    static boolean isHttps(String value) {
        try {
            URI uri = new URI(value);
            return "https".equalsIgnoreCase(uri.getScheme()) && uri.getHost() != null
                    && uri.getUserInfo() == null && (uri.getPort() == -1 || uri.getPort() == 443);
        } catch (URISyntaxException | NullPointerException ignored) {
            return false;
        }
    }

    static boolean isPanel(String value) {
        if (!isHttps(value)) return false;
        try {
            URI uri = new URI(value);
            if (!"bedlatess.github.io".equalsIgnoreCase(uri.getHost())) return false;
            String path = uri.getPath();
            if (path == null || !path.startsWith("/GeometryPanel/") || path.contains("\\")) return false;
            for (String segment : path.split("/")) if (segment.equals("..") || segment.equals(".")) return false;
            return true;
        } catch (URISyntaxException ignored) {
            return false;
        }
    }
}
