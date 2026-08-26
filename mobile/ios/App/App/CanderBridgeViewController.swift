import UIKit
import WebKit
import Capacitor

/// Native shell tweaks: no root rubber-band scroll; inject fixed-layout CSS for any loaded URL.
class CanderBridgeViewController: CAPBridgeViewController {
    private static let mobileShellCSS = """
    html.cander-mobile{height:100%;height:100dvh;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:pan-x pan-y}
    html.cander-mobile body{position:fixed;inset:0;width:100%;height:100%;height:100dvh;min-height:0;overflow:hidden;overscroll-behavior:none;touch-action:pan-x pan-y}
    html.cander-mobile input,html.cander-mobile textarea,html.cander-mobile select{font-size:16px}
    html.cander-mobile [data-app-shell],html.cander-mobile .h-svh{height:100%;height:100dvh;max-height:100dvh}
    """

    private static let mobileShellScript = """
    (function(){
      document.documentElement.classList.add('cander-mobile');
      document.documentElement.dataset.canderMobile='ios';
      var inject=function(){
        if(document.getElementById('cander-mobile-shell')) return;
        var s=document.createElement('style');
        s.id='cander-mobile-shell';
        s.textContent='\(mobileShellCSS)';
        (document.head||document.documentElement).appendChild(s);
      };
      if(document.head){ inject(); }
      else { document.addEventListener('DOMContentLoaded', inject); }
    })();
    """

    override open func webViewConfiguration(for instanceConfiguration: InstanceConfiguration) -> WKWebViewConfiguration {
        let config = super.webViewConfiguration(for: instanceConfiguration)
        let script = WKUserScript(
            source: Self.mobileShellScript,
            injectionTime: .atDocumentStart,
            forMainFrameOnly: true
        )
        config.userContentController.addUserScript(script)
        return config
    }

    override open func capacitorDidLoad() {
        super.capacitorDidLoad()
        disableRootBounce()
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        disableRootBounce()
    }

    private func disableRootBounce() {
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
    }
}
