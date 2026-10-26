package ph.basureport.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.ViewGroup;
import android.webkit.CookieManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceError;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/** The hosted Flask app remains the source of accounts, reports, and permissions. */
public class MainActivity extends Activity {
    private static final int PHOTO_REQUEST = 100;
    private WebView web;
    private String server;
    private ValueCallback<Uri[]> uploadCallback;

    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().getDecorView().setOnApplyWindowInsetsListener((view, insets) -> {
            view.setPadding(insets.getSystemWindowInsetLeft(), insets.getSystemWindowInsetTop(),
                    insets.getSystemWindowInsetRight(), insets.getSystemWindowInsetBottom());
            return insets;
        });
        getWindow().getDecorView().requestApplyInsets();
        server = getPreferences(MODE_PRIVATE).getString("server", "");
        if (server.isEmpty()) showConnection(); else openApp(state);
    }

    private LinearLayout layout() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        int pad = (int) (24 * getResources().getDisplayMetrics().density);
        layout.setPadding(pad, pad, pad, pad);
        layout.setBackgroundColor(Color.rgb(21, 29, 25));
        return layout;
    }

    private TextView text(String value) {
        TextView label = new TextView(this);
        label.setText(value);
        label.setTextColor(Color.rgb(220, 230, 223));
        label.setTextSize(18);
        label.setPadding(0, 16, 0, 16);
        return label;
    }

    private void releaseWeb() {
        if (uploadCallback != null) { uploadCallback.onReceiveValue(null); uploadCallback = null; }
        if (web != null) {
            web.stopLoading();
            if (web.getParent() != null) ((ViewGroup) web.getParent()).removeView(web);
            web.destroy();
            web = null;
        }
    }

    private void showConnection() {
        releaseWeb();
        LinearLayout layout = layout();
        layout.addView(text("BasuReport\nConnect to your barangay"));
        layout.addView(text("Enter the secure website address provided by your barangay. Sign in to submit reports, view cleanup photos, and send feedback."));
        EditText address = new EditText(this);
        address.setSingleLine(true);
        address.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_VARIATION_URI);
        address.setHint("https://your-barangay.example");
        address.setHintTextColor(Color.LTGRAY);
        address.setTextColor(Color.WHITE);
        address.setText(server);
        address.setContentDescription("Barangay website address");
        layout.addView(address);
        Button connect = new Button(this);
        connect.setText(R.string.connect);
        layout.addView(connect);
        connect.setOnClickListener(view -> {
            Uri uri = Uri.parse(address.getText().toString().trim());
            if (!"https".equalsIgnoreCase(uri.getScheme()) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
                address.setError("Enter an HTTPS website address without a path, query, or password.");
                return;
            }
            server = uri.buildUpon().path("").build().toString();
            getPreferences(MODE_PRIVATE).edit().putString("server", server).apply();
            openApp(null);
        });
        setContentView(layout);
    }

    private boolean sameOrigin(Uri uri) {
        Uri origin = Uri.parse(server);
        return "https".equalsIgnoreCase(uri.getScheme())
                && origin.getHost().equalsIgnoreCase(uri.getHost()) && origin.getPort() == uri.getPort();
    }

    private void openApp(Bundle state) {
        releaseWeb();
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        Button settings = new Button(this);
        settings.setText(R.string.connection_settings);
        settings.setOnClickListener(view -> new AlertDialog.Builder(this)
                .setMessage("Change the barangay website? You will be signed out of this app.")
                .setPositiveButton("Change", (dialog, which) -> {
                    CookieManager.getInstance().removeAllCookies(null);
                    CookieManager.getInstance().flush();
                    web.clearHistory();
                    web.clearCache(true);
                    getPreferences(MODE_PRIVATE).edit().remove("server").apply();
                    showConnection();
                }).setNegativeButton("Cancel", null).show());
        layout.addView(settings);
        web = new WebView(this);
        web.setBackgroundColor(Color.rgb(21, 29, 25));
        // Report forms, theme controls, and API updates require JavaScript.
        // Only the configured HTTPS origin stays inside this WebView; no native JS bridge exists.
        web.getSettings().setJavaScriptEnabled(true);
        web.getSettings().setDomStorageEnabled(true);
        web.getSettings().setAllowFileAccess(false);
        web.getSettings().setAllowContentAccess(true);
        web.getSettings().setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        CookieManager.getInstance().setAcceptCookie(true);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (sameOrigin(uri)) return false;
                if (request.isForMainFrame() && ("https".equals(uri.getScheme()) || "mailto".equals(uri.getScheme()) || "tel".equals(uri.getScheme()))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (ActivityNotFoundException error) { Toast.makeText(MainActivity.this, "No app can open this link.", Toast.LENGTH_SHORT).show(); }
                }
                return true;
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) new AlertDialog.Builder(MainActivity.this)
                        .setTitle("Unable to connect")
                        .setMessage("Check your internet connection and the barangay website address.")
                        .setPositiveButton("Retry", (dialog, which) -> web.loadUrl(server))
                        .setNegativeButton("Connection settings", (dialog, which) -> showConnection()).show();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                picker.addCategory(Intent.CATEGORY_OPENABLE);
                picker.setType("image/*");
                try { startActivityForResult(picker, PHOTO_REQUEST); }
                catch (ActivityNotFoundException error) {
                    uploadCallback.onReceiveValue(null);
                    uploadCallback = null;
                    Toast.makeText(MainActivity.this, "No photo picker is available.", Toast.LENGTH_SHORT).show();
                }
                return true;
            }
        });
        layout.addView(web, new LinearLayout.LayoutParams(-1, 0, 1));
        setContentView(layout);
        if (state == null || web.restoreState(state) == null) web.loadUrl(server);
    }

    @Override protected void onActivityResult(int request, int result, Intent data) {
        super.onActivityResult(request, result, data);
        if (request == PHOTO_REQUEST && uploadCallback != null) {
            uploadCallback.onReceiveValue(result == RESULT_OK && data != null && data.getData() != null
                    ? new Uri[]{data.getData()} : null);
            uploadCallback = null;
        }
    }
    @Override protected void onSaveInstanceState(Bundle state) {
        if (web != null && web.getParent() != null) web.saveState(state);
        super.onSaveInstanceState(state);
    }
    @Override public void onBackPressed() {
        if (web != null && web.getParent() != null && web.canGoBack()) web.goBack(); else super.onBackPressed();
    }
    @Override protected void onDestroy() {
        releaseWeb();
        super.onDestroy();
    }
}
