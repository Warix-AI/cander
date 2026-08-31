package ai.warix.cander;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String MOBILE_SHELL_JS =
            "(function(){"
                    + "document.documentElement.classList.add('cander-mobile');"
                    + "document.documentElement.dataset.canderMobile='android';"
                    + "var css='html.cander-mobile{-webkit-text-size-adjust:100%;touch-action:manipulation;overscroll-behavior:none}'"
                    + "+'html.cander-mobile input,html.cander-mobile textarea,html.cander-mobile select{font-size:16px;touch-action:manipulation}'"
                    + "+'html.cander-mobile .composer-dock,html.cander-mobile .landing-mark,html.cander-mobile .landing-suggestions{view-transition-name:none!important}';"
                    + "var inject=function(){"
                    + "if(document.getElementById('cander-mobile-shell')) return;"
                    + "var s=document.createElement('style');"
                    + "s.id='cander-mobile-shell';"
                    + "s.textContent=css;"
                    + "(document.head||document.documentElement).appendChild(s);"
                    + "};"
                    + "if(document.head){ inject(); }"
                    + "else { document.addEventListener('DOMContentLoaded', inject); }"
                    + "})();";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        handleShareIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleShareIntent(intent);
    }

    /**
     * Share-in → pending composer input (never auto-send).
     */
    private void handleShareIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (Intent.ACTION_SEND.equals(action)) {
            String sharedText = intent.getStringExtra(Intent.EXTRA_TEXT);
            postShareToWeb(sharedText, null);
            return;
        }
        if (Intent.ACTION_VIEW.equals(action) && intent.getData() != null) {
            Uri data = intent.getData();
            if ("cander".equals(data.getScheme()) && "share".equals(data.getHost())) {
                postShareToWeb(data.getQueryParameter("text"), data.getQueryParameter("url"));
            }
        }
    }

    private void postShareToWeb(String text, String url) {
        WebView webView = getBridge() != null ? getBridge().getWebView() : null;
        if (webView == null) return;
        String js =
                "(function(){try{window.postMessage({type:'cander:share',text:"
                        + jsonString(text)
                        + ",url:"
                        + jsonString(url)
                        + "},'*');}catch(e){}})();";
        webView.post(() -> webView.evaluateJavascript(js, null));
    }

    private static String jsonString(String value) {
        if (value == null) return "null";
        return "\""
                + value
                        .replace("\\", "\\\\")
                        .replace("\"", "\\\"")
                        .replace("\n", "\\n")
                        .replace("\r", "")
                + "\"";
    }

    @Override
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.evaluateJavascript(MOBILE_SHELL_JS, null);
        observeKeyboard(webView);
        handleShareIntent(getIntent());
    }

    private void observeKeyboard(WebView webView) {
        View root = findViewById(android.R.id.content);
        if (root == null) {
            return;
        }
        ViewCompat.setOnApplyWindowInsetsListener(
                root,
                (v, insets) -> {
                    Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
                    int px = Math.max(0, ime.bottom);
                    String flag = px > 24 ? "1" : "0";
                    String js =
                            "(function(){"
                                    + "var r=document.documentElement;"
                                    + "r.style.setProperty('--keyboard-inset','"
                                    + px
                                    + "px');"
                                    + "r.dataset.keyboard='"
                                    + flag
                                    + "';"
                                    + "})();";
                    webView.evaluateJavascript(js, null);
                    return insets;
                });
        ViewCompat.requestApplyInsets(root);
    }
}
