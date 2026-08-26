package ai.warix.cander;

import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String MOBILE_SHELL_JS =
            "(function(){"
                    + "document.documentElement.classList.add('cander-mobile');"
                    + "document.documentElement.dataset.canderMobile='android';"
                    + "var css='html.cander-mobile{height:100%;height:100dvh;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:manipulation}'"
                    + "+'html.cander-mobile body{position:fixed;inset:0;width:100%;height:var(--vvh,100dvh);max-height:var(--vvh,100dvh);min-height:0;overflow:hidden;overscroll-behavior:none;touch-action:manipulation}'"
                    + "+'html.cander-mobile input,html.cander-mobile textarea,html.cander-mobile select{font-size:16px;touch-action:manipulation}'"
                    + "+'html.cander-mobile [data-app-shell],html.cander-mobile .h-svh{height:var(--vvh,100dvh);max-height:var(--vvh,100dvh)}';"
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
    public void onStart() {
        super.onStart();
        WebView webView = getBridge().getWebView();
        if (webView == null) {
            return;
        }
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.evaluateJavascript(MOBILE_SHELL_JS, null);
    }
}
