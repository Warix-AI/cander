import UIKit
import WebKit
import Capacitor

/// Native shell: light CSS inject, keyboard inset, recover from WebContent crashes.
class CanderBridgeViewController: CAPBridgeViewController {
    /// Keep this minimal — heavy `position:fixed` at document-start was crashing WKWebView.
    private static let mobileShellCSS = """
    html.cander-mobile{-webkit-text-size-adjust:100%;touch-action:manipulation;overscroll-behavior:none}
    html.cander-mobile input,html.cander-mobile textarea,html.cander-mobile select{font-size:16px;touch-action:manipulation}
    html.cander-mobile .composer-dock,html.cander-mobile .landing-mark,html.cander-mobile .landing-suggestions{view-transition-name:none!important}
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
        bridge?.registerPluginInstance(CanderFoundationModelsPlugin())
        disableRootBounce()
        // Wait until the bridge webview is in a window before keyboard hooks.
        DispatchQueue.main.async { [weak self] in
            self?.observeKeyboard()
        }
    }

    override open func viewDidAppear(_ animated: Bool) {
        super.viewDidAppear(animated)
        disableRootBounce()
        // Ensure AppDelegate.window is set for Capacitor Keyboard plugin lookups.
        if let appDelegate = UIApplication.shared.delegate as? AppDelegate,
           appDelegate.window == nil {
            appDelegate.window = view.window
        }
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
        guard keyboardShowObserver == nil else { return }
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
            let frame = notification.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect,
            webView?.window != nil,
            webView?.isLoading == false
        else { return }
        let converted = view.convert(frame, from: nil)
        let overlap = max(0, view.bounds.maxY - converted.origin.y)
        setKeyboardInset(overlap)
    }

    private func setKeyboardInset(_ height: CGFloat) {
        guard let webView, webView.window != nil else { return }
        let px = max(0, Int(height.rounded()))
        let flag = px > 24 ? "1" : "0"
        let js = """
        (function(){
          var r=document.documentElement;
          if(!r) return;
          r.style.setProperty('--keyboard-inset','\(px)px');
          r.dataset.keyboard='\(flag)';
        })();
        """
        webView.evaluateJavaScript(js, completionHandler: nil)
    }
}
