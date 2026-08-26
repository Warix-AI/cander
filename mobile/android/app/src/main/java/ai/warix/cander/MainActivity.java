package ai.warix.cander;

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
                    + "var css='html.cander-mobile{height:100%;height:100dvh;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:manipulation}'"
                    + "+'html.cander-mobile body{position:fixed;inset:0;width:100%;height:100%;height:100dvh;max-height:100dvh;min-height:0;overflow:hidden;overscroll-behavior:none;touch-action:manipulation}'"
                    + "+'html.cander-mobile input,html.cander-mobile textarea,html.cander-mobile select{font-size:16px;touch-action:manipulation}'"
                    + "+'html.cander-mobile [data-app-shell],html.cander-mobile .h-svh{height:100%;height:100dvh;max-height:100dvh}'"
                    + "+'html.cander-mobile .composer-dock,html.cander-mobile .landing-mark,html.cander-mobile .landing-suggestions{view-transition-name:none!important}'"
                    + "+'html.cander-mobile [data-mobile-chat]{padding-bottom:var(--keyboard-inset,0px);transition:padding-bottom .22s cubic-bezier(.22,1,.36,1)}'"
                    + "+'html.cander-mobile[data-keyboard=\"1\"] .composer-keyboard-pad{padding-bottom:0.35rem!important}';"
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
