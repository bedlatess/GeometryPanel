package app.geometrypanel.mobile;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Build;
import android.os.Bundle;
import android.os.Message;
import android.view.Gravity;
import android.view.View;
import android.view.WindowInsets;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.PermissionRequest;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

/** Thin host for the same HTTPS panel used on iPhone. No account or vehicle bridge. */
public final class MainActivity extends Activity {
    // Return true whenever a dialog owns back. Its normal close button performs cancellation,
    // iframe cleanup and commit protection inside the shared web application.
    static final String CLOSE_DIALOG_SCRIPT = """
            (() => {
              const dialog = document.querySelector('dialog[open]');
              if (!dialog) return false;
              const close = dialog.querySelector('[data-action="close"]');
              if (close && !close.disabled) close.click();
              return true;
            })()
            """;
    private FrameLayout root;
    private WebView panel;
    private LinearLayout errorPanel;
    private ProgressBar progress;
    private boolean loadFailed;
    private volatile boolean snapshotFallback;
    private volatile PanelCache.Session snapshotSession;
    private NativeBridge nativeBridge;
    private java.util.function.Consumer<Boolean> permissionReply;
    private int permissionRequest, permissionCounter = 701;

    void nativePermission(String[] permissions, java.util.function.Consumer<Boolean> reply) {
        if (permissionRequest != 0) { reply.accept(false); return; }
        java.util.ArrayList<String> missing = new java.util.ArrayList<>();
        for (String permission : permissions) if (checkSelfPermission(permission) != android.content.pm.PackageManager.PERMISSION_GRANTED) missing.add(permission);
        if (missing.isEmpty()) { reply.accept(true); return; }
        permissionReply = reply; permissionRequest = permissionCounter++; requestPermissions(missing.toArray(new String[0]), permissionRequest);
    }
    void cancelNativePermission() { permissionReply = null; }
    @Override public void onRequestPermissionsResult(int code, String[] permissions, int[] grants) {
        super.onRequestPermissionsResult(code, permissions, grants);
        if (code != permissionRequest) return;
        permissionRequest = 0;
        java.util.function.Consumer<Boolean> reply = permissionReply; permissionReply = null;
        if (reply == null) return;
        boolean allowed = grants.length > 0; for (int value : grants) allowed &= value == android.content.pm.PackageManager.PERMISSION_GRANTED;
        reply.accept(allowed);
    }

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        WebView.setWebContentsDebuggingEnabled(false);
        if (Build.VERSION.SDK_INT >= 30) getWindow().setDecorFitsSystemWindows(false);
        root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(244, 247, 245));
        root.setOnApplyWindowInsetsListener((view, insets) -> {
            if (Build.VERSION.SDK_INT >= 30) {
                android.graphics.Insets padding = insets.getInsets(WindowInsets.Type.systemBars() | WindowInsets.Type.displayCutout() | WindowInsets.Type.ime());
                view.setPadding(padding.left, padding.top, padding.right, padding.bottom);
            }
            return insets;
        });
        setContentView(root);
        createPanel();
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        int space = Math.round(24 * getResources().getDisplayMetrics().density);
        errorPanel.setPadding(space, space, space, space);
        TextView description = new TextView(this);
        description.setText("无法打开面板，请检查网络后重试");
        description.setTextColor(Color.rgb(24, 49, 37));
        description.setTextSize(17);
        description.setGravity(Gravity.CENTER);
        errorPanel.addView(description);
        Button retry = new Button(this);
        retry.setText("重新打开面板");
        retry.setOnClickListener(view -> {
            if (panel == null) createPanel();
            loadFailed = false;
            snapshotFallback = false;
            PanelCache.release(this,snapshotSession); snapshotSession = null;
            errorPanel.setVisibility(View.GONE);
            panel.setVisibility(View.VISIBLE);
            panel.loadUrl(BuildConfig.PANEL_URL);
        });
        errorPanel.addView(retry);
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        errorPanel.setVisibility(View.GONE);
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new FrameLayout.LayoutParams(-1, Math.round(3 * getResources().getDisplayMetrics().density), Gravity.TOP));
        if (Build.VERSION.SDK_INT >= 33) getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        panel.loadUrl(BuildConfig.PANEL_URL);
        PanelCache.warm(this);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void createPanel() {
        panel = new WebView(this);
        nativeBridge = new NativeBridge(this, panel);
        root.addView(panel, 0, new FrameLayout.LayoutParams(-1, -1));
        WebSettings settings = panel.getSettings();
        // The panel needs JS and localStorage. Native file/content access stays off.
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setGeolocationEnabled(false);
        settings.setSafeBrowsingEnabled(true);
        settings.setSupportMultipleWindows(true);
        settings.setJavaScriptCanOpenWindowsAutomatically(false);
        settings.setMediaPlaybackRequiresUserGesture(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(panel, false);
        panel.setWebViewClient(new WebViewClient() {
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return snapshotFallback && "GET".equals(request.getMethod()) ? PanelCache.response(MainActivity.this,snapshotSession,request.getUrl().toString()) : null;
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                String url = request.getUrl().toString();
                if (!request.isForMainFrame()) return !NavigationPolicy.isHttps(url);
                if (NavigationPolicy.isPanel(url)) return false;
                if (request.hasGesture()) openExternal(url);
                return true;
            }

            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap favicon) {
                if (nativeBridge != null) nativeBridge.navigation();
                if (!NavigationPolicy.isPanel(url)) { view.stopLoading(); return; }
                loadFailed = false;
                if (progress != null) progress.setVisibility(View.VISIBLE);
            }

            @Override public void onPageFinished(WebView view, String url) {
                if (!loadFailed && NavigationPolicy.isPanel(url)) {
                    if (errorPanel != null) errorPanel.setVisibility(View.GONE);
                    view.setVisibility(View.VISIBLE);
                }
            }

            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showLoadError();
            }

            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showLoadError();
            }

            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                // Certificate failures are never bypassed. A failed map must not replace the panel.
                handler.cancel();
                if (error.getUrl() != null && NavigationPolicy.isPanel(error.getUrl())) showLoadError();
            }

            @Override public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                if (nativeBridge != null) nativeBridge.close();
                root.removeView(view);
                view.destroy();
                panel = null;
                showLoadError();
                return true;
            }
        });
        panel.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) {
                if (progress != null) {
                    progress.setProgress(value);
                    progress.setVisibility(!loadFailed && value < 100 ? View.VISIBLE : View.GONE);
                }
            }

            @Override public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                callback.invoke(origin, false, false);
            }

            @Override public void onPermissionRequest(PermissionRequest request) { request.deny(); }

            @Override public boolean onCreateWindow(WebView view, boolean dialog, boolean gesture, Message result) {
                if (!gesture) return false;
                // A temporary, JS-disabled view captures the URL and sends HTTPS links to the browser.
                // Neither external pages nor popup frames replace the signed-in panel.
                WebView popup = new WebView(MainActivity.this);
                popup.getSettings().setAllowFileAccess(false);
                popup.getSettings().setAllowContentAccess(false);
                popup.setWebViewClient(new WebViewClient() {
                    private boolean handled;
                    private void dispatch(String url) {
                        if (handled || "about:blank".equals(url)) return;
                        handled = true;
                        openExternal(url);
                        popup.post(popup::destroy);
                    }
                    @Override public boolean shouldOverrideUrlLoading(WebView child, WebResourceRequest request) {
                        if (request.isForMainFrame()) dispatch(request.getUrl().toString());
                        return true;
                    }
                    @Override public void onPageStarted(WebView child, String url, android.graphics.Bitmap icon) { dispatch(url); }
                });
                WebView.WebViewTransport transport = (WebView.WebViewTransport) result.obj;
                transport.setWebView(popup);
                result.sendToTarget();
                popup.postDelayed(() -> { if (popup.getParent() == null) popup.destroy(); }, 15000);
                return true;
            }
        });
        // Current configuration backup/import uses copy/paste, so no JS/native bridge is needed.
        panel.setDownloadListener((url, agent, disposition, mime, size) -> openExternal(url));
    }

    private void showLoadError() {
        if (!snapshotFallback && panel != null) {
            PanelCache.Session candidate = PanelCache.acquire(this);
            if (candidate != null) { snapshotSession = candidate; snapshotFallback = true; loadFailed = false; panel.post(() -> { if (panel != null) { panel.loadUrl(BuildConfig.PANEL_URL); Toast.makeText(this,"正在使用离线页面",Toast.LENGTH_LONG).show(); } }); return; }
        }
        loadFailed = true;
        if (panel != null) panel.setVisibility(View.GONE);
        if (errorPanel != null) errorPanel.setVisibility(View.VISIBLE);
        if (progress != null) progress.setVisibility(View.GONE);
    }

    private void openExternal(String url) {
        if (!NavigationPolicy.isHttps(url)) {
            Toast.makeText(this, "该链接暂不支持，请使用地图内的网页入口。", Toast.LENGTH_SHORT).show();
            return;
        }
        try { startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE)); }
        catch (ActivityNotFoundException ignored) {
            Toast.makeText(this, "没有可用的浏览器。", Toast.LENGTH_SHORT).show();
        }
    }

    private void handleBack() {
        if (panel == null || !NavigationPolicy.isPanel(panel.getUrl()) || loadFailed) { finish(); return; }
        // Close an open map/confirmation dialog before leaving. No account data crosses this callback.
        panel.evaluateJavascript(CLOSE_DIALOG_SCRIPT, closed -> {
            if ("true".equals(closed)) return;
            if (panel != null && panel.canGoBack()) panel.goBack(); else finish();
        });
    }

    // API 33+ uses the OnBackInvokedCallback registered above; this is only the legacy fallback.
    @SuppressLint("GestureBackNavigation")
    @SuppressWarnings("deprecation") @Override public void onBackPressed() { handleBack(); }

    @Override protected void onPause() {
        if (panel != null) panel.onPause();
        CookieManager.getInstance().flush();
        super.onPause();
    }

    @Override protected void onResume() { super.onResume(); if (panel != null) panel.onResume(); }

    @Override protected void onStop() {
        if (!ProximityService.running) NativeEngine.get(this).ble.disconnect("page_stopped");
        super.onStop();
    }

    @Override protected void onDestroy() {
        PanelCache.release(this,snapshotSession); snapshotSession = null;
        if (nativeBridge != null) nativeBridge.close();
        if (panel != null) {
            root.removeView(panel);
            panel.stopLoading();
            panel.destroy();
            panel = null;
        }
        super.onDestroy();
    }
}
