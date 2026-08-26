import UIKit
import WebKit
import Capacitor

/// Native shell tweaks: no root rubber-band scroll; inject fixed-layout CSS;
/// push keyboard height into the web app so the composer can slide up.
class CanderBridgeViewController: CAPBridgeViewController {
    private static let mobileShellCSS = """
    html.cander-mobile{height:100%;height:100dvh;overflow:hidden;overscroll-behavior:none;-webkit-text-size-adjust:100%;touch-action:manipulation}
    html.cander-mobile body{position:fixed;inset:0;width:100%;height:100%;height:100dvh;max-height:100dvh;min-height:0;overflow:hidden;overscroll-behavior:none;touch-action:manipulation}
    html.cander-mobile input,html.cander-mobile textarea,html.cander-mobile select{font-size:16px;touch-action:manipulation}
    html.cander-mobile [data-app-shell],html.cander-mobile .h-svh{height:100%;height:100dvh;max-height:100dvh}
    html.cander-mobile .composer-dock,html.cander-mobile .landing-mark,html.cander-mobile .landing-suggestions{view-transition-name:none!important}
    html.cander-mobile [data-mobile-chat]{padding-bottom:var(--keyboard-inset,0px);transition:padding-bottom .22s cubic-bezier(.22,1,.36,1)}
    html.cander-mobile[data-keyboard="1"] .composer-keyboard-pad{padding-bottom:0.35rem!important}
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

    private var keyboardShowObserver: NSObjectProtocol?
    private var keyboardHideObserver: NSObjectProtocol?

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
        observeKeyboard()
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        disableRootBounce()
    }

    deinit {
        if let keyboardShowObserver {
            NotificationCenter.default.removeObserver(keyboardShowObserver)
        }
        if let keyboardHideObserver {
            NotificationCenter.default.removeObserver(keyboardHideObserver)
        }
    }

    private func disableRootBounce() {
        webView?.scrollView.bounces = false
        webView?.scrollView.alwaysBounceVertical = false
        webView?.scrollView.alwaysBounceHorizontal = false
    }

    private func observeKeyboard() {
        let center = NotificationCenter.default
        keyboardShowObserver = center.addObserver(
            forName: UIResponder.keyboardWillChangeFrameNotification,
            object: nil,
            queue: .main
        ) { [weak self] notification in
            self?.applyKeyboard(from: notification)
        }
        keyboardHideObserver = center.addObserver(
            forName: UIResponder.keyboardWillHideNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.setKeyboardInset(0)
        }
    }

    private func applyKeyboard(from notification: Notification) {
        guard
            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect
        else { return }
        let converted = view.convert(frame, from: nil)
        let overlap = max(0, view.bounds.maxY - converted.origin.y)
        setKeyboardInset(overlap)
    }

    private func setKeyboardInset(_ height: CGFloat) {
        let px = max(0, Int(height.rounded()))
        let flag = px > 24 ? "1" : "0"
        let js = """
        (function(){
          var r=document.documentElement;
          r.style.setProperty('--keyboard-inset','\(px)px');
          r.dataset.keyboard='\(flag)';
        })();
        """
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }
}
