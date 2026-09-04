import Foundation
import Capacitor
import WebKit
import UIKit
import CryptoKit

/**
 * Native right-panel browser surfaces (WKWebView).
 * Do not use Capacitor's Browser plugin (SFSafariViewController) for in-panel tabs.
 *
 * Coordinates from JS are CSS viewport pixels relative to the Capacitor bridge webview.
 */
@objc(CanderBrowserPlugin)
public class CanderBrowserPlugin: CAPPlugin, CAPBridgedPlugin, WKNavigationDelegate, WKUIDelegate {
    public let identifier = "CanderBrowserPlugin"
    public let jsName = "CanderBrowser"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "createTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroyTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "showTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideTab", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "navigate", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "back", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "forward", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "reload", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stop", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "hideAll", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "readPage", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSelection", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "captureViewport", returnType: CAPPluginReturnPromise),
    ]

    private struct TabEntry {
        let webView: WKWebView
        var lastUrl: URL
        let isolated: Bool
        let projectId: String?
    }

    private var tabs: [String: TabEntry] = [:]
    private var keyboardObserver: NSObjectProtocol?
    private var orientationObserver: NSObjectProtocol?
    private var memoryObserver: NSObjectProtocol?
    private var activeTabId: String?

    public override func load() {
        super.load()
        observeLayoutSignals()
    }

    deinit {
        if let keyboardObserver {
            NotificationCenter.default.removeObserver(keyboardObserver)
        }
        if let orientationObserver {
            NotificationCenter.default.removeObserver(orientationObserver)
        }
        if let memoryObserver {
            NotificationCenter.default.removeObserver(memoryObserver)
        }
    }

    // MARK: - Plugin methods

    @objc func createTab(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"),
              let urlString = call.getString("url") else {
            call.reject("tabId and url required")
            return
        }
        let isolated = call.getBool("isolated") ?? false
        let projectId = call.getString("projectId")
        let userId = call.getString("userId")
        DispatchQueue.main.async {
            self.destroyTabSync(tabId)
            guard let url = self.sanitizedURL(urlString) else {
                self.emit(type: "navigationFailed", tabId: tabId, payload: [
                    "url": urlString,
                    "error": "URL not allowed for local browser surface",
                ])
                call.reject("URL not allowed")
                return
            }
            let config = WKWebViewConfiguration()
            // Ordinary web: durable per-user cookie jar (Discord stays signed in).
            // Isolated previews: non-persistent so they never bleed into personal browsing.
            if isolated {
                config.websiteDataStore = .nonPersistent()
            } else {
                config.websiteDataStore = self.persistentDataStore(userId: userId)
            }
            config.allowsInlineMediaPlayback = true
            config.mediaTypesRequiringUserActionForPlayback = []
            config.preferences.javaScriptCanOpenWindowsAutomatically = false
            let webView = WKWebView(frame: .zero, configuration: config)
            webView.navigationDelegate = self
            webView.uiDelegate = self
            webView.isHidden = true
            webView.scrollView.contentInsetAdjustmentBehavior = .never
            webView.allowsBackForwardNavigationGestures = true
            webView.accessibilityIdentifier = "cander-browser-\(tabId)"
            if let host = self.bridge?.webView {
                host.superview?.insertSubview(webView, aboveSubview: host)
            } else {
                self.bridge?.viewController?.view.addSubview(webView)
            }
            self.tabs[tabId] = TabEntry(
                webView: webView,
                lastUrl: url,
                isolated: isolated,
                projectId: projectId
            )
            webView.load(URLRequest(url: url))
            call.resolve()
        }
    }

    @objc func destroyTab(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId") else {
            call.reject("tabId required")
            return
        }
        DispatchQueue.main.async {
            self.destroyTabSync(tabId)
            call.resolve()
        }
    }

    @objc func showTab(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"),
              var entry = tabs[tabId] else {
            call.reject("Unknown tab")
            return
        }
        let x = CGFloat(call.getDouble("x") ?? 0)
        let y = CGFloat(call.getDouble("y") ?? 0)
        let width = CGFloat(call.getDouble("width") ?? 0)
        let height = CGFloat(call.getDouble("height") ?? 0)
        DispatchQueue.main.async {
            self.activeTabId = tabId
            for (id, other) in self.tabs where id != tabId {
                other.webView.isHidden = true
            }
            let frame = self.frameInHostCoordinates(x: x, y: y, width: width, height: height)
            entry.webView.isHidden = false
            entry.webView.frame = frame
            entry.webView.scrollView.contentInset = self.safeAreaInsetsForBrowser()
            self.tabs[tabId] = entry
            call.resolve()
        }
    }

    @objc func hideTab(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId") else {
            call.reject("tabId required")
            return
        }
        DispatchQueue.main.async {
            self.tabs[tabId]?.webView.isHidden = true
            if self.activeTabId == tabId {
                self.activeTabId = nil
            }
            call.resolve()
        }
    }

    @objc func navigate(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"),
              let urlString = call.getString("url"),
              var entry = tabs[tabId] else {
            call.reject("tabId and url required")
            return
        }
        DispatchQueue.main.async {
            guard let url = self.sanitizedURL(urlString) else {
                self.emit(type: "navigationFailed", tabId: tabId, payload: [
                    "url": urlString,
                    "error": "URL not allowed for local browser surface",
                ])
                call.reject("URL not allowed")
                return
            }
            entry.lastUrl = url
            self.tabs[tabId] = entry
            entry.webView.load(URLRequest(url: url))
            call.resolve()
        }
    }

    @objc func back(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"), let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            if webView.canGoBack { webView.goBack() }
            call.resolve()
        }
    }

    @objc func forward(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"), let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            if webView.canGoForward { webView.goForward() }
            call.resolve()
        }
    }

    @objc func reload(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"), let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            webView.reload()
            call.resolve()
        }
    }

    @objc func stop(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"), let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            webView.stopLoading()
            call.resolve()
        }
    }

    @objc func hideAll(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            for (_, entry) in self.tabs {
                entry.webView.isHidden = true
            }
            self.activeTabId = nil
            call.resolve()
        }
    }

    @objc func readPage(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"),
              let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            webView.evaluateJavaScript(Self.pageExtractScript) { result, error in
                if let error {
                    call.reject(error.localizedDescription)
                    return
                }
                if let dict = result as? [String: Any] {
                    call.resolve(dict)
                } else {
                    call.resolve([
                        "url": webView.url?.absoluteString ?? "",
                        "title": webView.title ?? "",
                        "visibleText": "",
                    ])
                }
            }
        }
    }

    @objc func getSelection(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"),
              let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            webView.evaluateJavaScript(Self.selectionScript) { result, error in
                if let error {
                    call.reject(error.localizedDescription)
                    return
                }
                if let dict = result as? [String: Any] {
                    call.resolve(dict)
                } else {
                    call.resolve(["text": "", "url": webView.url?.absoluteString ?? ""])
                }
            }
        }
    }

    @objc func captureViewport(_ call: CAPPluginCall) {
        guard let tabId = call.getString("tabId"),
              let webView = tabs[tabId]?.webView else {
            call.reject("Unknown tab")
            return
        }
        DispatchQueue.main.async {
            let config = WKSnapshotConfiguration()
            if #available(iOS 13.0, *) {
                config.afterScreenUpdates = true
            }
            webView.takeSnapshot(with: config) { image, error in
                if let error {
                    call.reject(error.localizedDescription)
                    return
                }
                guard let image,
                      let data = image.jpegData(compressionQuality: 0.72) else {
                    call.reject("Snapshot failed")
                    return
                }
                call.resolve([
                    "dataBase64": data.base64EncodedString(),
                    "mimeType": "image/jpeg",
                    "width": Int(image.size.width * image.scale),
                    "height": Int(image.size.height * image.scale),
                ])
            }
        }
    }

    private static let pageExtractScript = """
    (() => {
      const MAX = 12000;
      const isHidden = (el) => {
        if (!el || el.nodeType !== 1) return true;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return true;
        if (el.getAttribute('aria-hidden') === 'true') return true;
        const type = (el.getAttribute('type') || '').toLowerCase();
        if (type === 'password' || type === 'hidden') return true;
        if (el.closest('script,style,noscript,template')) return true;
        return false;
      };
      const parts = [];
      let truncated = false;
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
          const parent = node.parentElement;
          if (!parent || isHidden(parent)) return NodeFilter.FILTER_REJECT;
          const t = (node.textContent || '').replace(/\\s+/g, ' ').trim();
          if (!t) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });
      while (walker.nextNode()) {
        const t = (walker.currentNode.textContent || '').replace(/\\s+/g, ' ').trim();
        if (parts.join(' ').length + t.length > MAX) { truncated = true; break; }
        parts.push(t);
      }
      const headings = Array.from(document.querySelectorAll('h1,h2,h3'))
        .filter((el) => !isHidden(el)).slice(0, 40)
        .map((el) => (el.textContent || '').replace(/\\s+/g, ' ').trim()).filter(Boolean);
      const links = Array.from(document.querySelectorAll('a[href]'))
        .filter((el) => !isHidden(el)).slice(0, 40)
        .map((el) => ({ text: (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 120), href: el.href || '' }))
        .filter((l) => l.href && l.text);
      const main = document.querySelector('main,article,[role="main"]') || document.body;
      const mainContent = main ? (main.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, MAX) : '';
      const sel = (window.getSelection && window.getSelection().toString()) || '';
      return {
        url: location.href,
        title: document.title || '',
        visibleText: parts.join(' ').slice(0, MAX),
        mainContent: mainContent || undefined,
        headings,
        links,
        selectedText: sel.trim().slice(0, 4000) || undefined,
        viewport: { width: window.innerWidth || 0, height: window.innerHeight || 0, scrollX: window.scrollX || 0, scrollY: window.scrollY || 0 },
        truncated,
      };
    })()
    """

    private static let selectionScript = """
    (() => {
      const sel = (window.getSelection && window.getSelection().toString()) || '';
      return { text: sel.trim().slice(0, 4000), url: location.href };
    })()
    """


    // MARK: - WKNavigationDelegate

    public func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        guard let tabId = tabId(for: webView) else { return }
        emit(type: "loading", tabId: tabId, payload: ["loading": true])
    }

    public func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let tabId = tabId(for: webView) else { return }
        emit(type: "loading", tabId: tabId, payload: ["loading": false])
        if let url = webView.url?.absoluteString {
            if var entry = tabs[tabId], let parsed = webView.url {
                entry.lastUrl = parsed
                tabs[tabId] = entry
            }
            emit(type: "url", tabId: tabId, payload: ["url": url])
        }
        if let title = webView.title {
            emit(type: "title", tabId: tabId, payload: ["title": title])
        }
    }

    public func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        guard let tabId = tabId(for: webView) else { return }
        emit(type: "loading", tabId: tabId, payload: ["loading": false])
        emit(type: "navigationFailed", tabId: tabId, payload: [
            "url": webView.url?.absoluteString ?? "",
            "error": error.localizedDescription,
        ])
    }

    public func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        guard let tabId = tabId(for: webView) else { return }
        emit(type: "loading", tabId: tabId, payload: ["loading": false])
        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain && nsError.code == NSURLErrorCancelled {
            return
        }
        emit(type: "navigationFailed", tabId: tabId, payload: [
            "url": webView.url?.absoluteString ?? "",
            "error": error.localizedDescription,
        ])
    }

    public func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        guard let tabId = tabId(for: webView), let entry = tabs[tabId] else { return }
        emit(type: "processGone", tabId: tabId, payload: ["reason": "terminated"])
        let url = entry.lastUrl
        DispatchQueue.main.async {
            webView.load(URLRequest(url: url))
        }
    }

    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let url = navigationAction.request.url else {
            decisionHandler(.cancel)
            return
        }
        let scheme = (url.scheme ?? "").lowercased()
        if scheme == "http" || scheme == "https" || scheme == "about" {
            if isBlockedHost(url) {
                if let tabId = tabId(for: webView) {
                    emit(type: "navigationFailed", tabId: tabId, payload: [
                        "url": url.absoluteString,
                        "error": "URL not allowed for local browser surface",
                    ])
                }
                decisionHandler(.cancel)
                return
            }
            decisionHandler(.allow)
            return
        }
        // External schemes (tel, mailto, sms, maps, …)
        if UIApplication.shared.canOpenURL(url) {
            UIApplication.shared.open(url, options: [:], completionHandler: nil)
        }
        decisionHandler(.cancel)
    }

    public func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationResponse: WKNavigationResponse,
        decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void
    ) {
        // Deny downloads / attachments by default.
        if !navigationResponse.canShowMIMEType {
            decisionHandler(.cancel)
            return
        }
        decisionHandler(.allow)
    }

    // MARK: - WKUIDelegate

    public func webView(
        _ webView: WKWebView,
        createWebViewWith configuration: WKWebViewConfiguration,
        for navigationAction: WKNavigationAction,
        windowFeatures: WKWindowFeatures
    ) -> WKWebView? {
        // Deny window.open; load in the same tab when it has a target URL.
        if let url = navigationAction.request.url, navigationAction.targetFrame == nil {
            webView.load(URLRequest(url: url))
        }
        return nil
    }

    @available(iOS 15.0, *)
    public func webView(
        _ webView: WKWebView,
        requestMediaCapturePermissionFor origin: WKSecurityOrigin,
        initiatedByFrame frame: WKFrameInfo,
        type: WKMediaCaptureType,
        decisionHandler: @escaping (WKPermissionDecision) -> Void
    ) {
        // Allow camera / mic for in-panel browsing; OS still prompts on first use.
        decisionHandler(.grant)
    }

    // MARK: - Helpers

    private func destroyTabSync(_ tabId: String) {
        if let entry = tabs.removeValue(forKey: tabId) {
            entry.webView.navigationDelegate = nil
            entry.webView.uiDelegate = nil
            entry.webView.stopLoading()
            entry.webView.removeFromSuperview()
        }
        if activeTabId == tabId {
            activeTabId = nil
        }
    }

    private func tabId(for webView: WKWebView) -> String? {
        tabs.first(where: { $0.value.webView === webView })?.key
    }

    private func emit(type: String, tabId: String, payload: [String: Any]) {
        var body = payload
        body["type"] = type
        body["tabId"] = tabId
        notifyListeners("browserEvent", data: body)
    }

    private func frameInHostCoordinates(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat) -> CGRect {
        // JS getBoundingClientRect is relative to the Capacitor webview viewport.
        guard let host = bridge?.webView else {
            return CGRect(x: x, y: y, width: max(1, width), height: max(1, height))
        }
        let origin = host.convert(CGPoint(x: x, y: y), to: host.superview)
        return CGRect(x: origin.x, y: origin.y, width: max(1, width), height: max(1, height))
    }

    private func safeAreaInsetsForBrowser() -> UIEdgeInsets {
        let insets = bridge?.viewController?.view.safeAreaInsets ?? .zero
        // Bottom inset only — top chrome is owned by the React panel.
        return UIEdgeInsets(top: 0, left: 0, bottom: insets.bottom, right: 0)
    }

    private func observeLayoutSignals() {
        let center = NotificationCenter.default
        keyboardObserver = center.addObserver(
            forName: UIResponder.keyboardWillChangeFrameNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.reapplyActiveTabFrame()
        }
        orientationObserver = center.addObserver(
            forName: UIDevice.orientationDidChangeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.reapplyActiveTabFrame()
        }
        memoryObserver = center.addObserver(
            forName: UIApplication.didReceiveMemoryWarningNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            self?.handleMemoryPressure()
        }
    }

    private func reapplyActiveTabFrame() {
        guard let tabId = activeTabId, let entry = tabs[tabId], !entry.webView.isHidden else { return }
        entry.webView.scrollView.contentInset = safeAreaInsetsForBrowser()
    }

    private func handleMemoryPressure() {
        // Stop loading on hidden tabs to reclaim network/CPU under pressure.
        for (id, entry) in tabs where id != activeTabId {
            entry.webView.stopLoading()
        }
    }

    private func persistentDataStore(userId: String?) -> WKWebsiteDataStore {
        guard let userId, !userId.isEmpty else {
            return .default()
        }
        if #available(iOS 17.0, *) {
            return WKWebsiteDataStore(forIdentifier: Self.stableUUID(from: "cander-web-\(userId)"))
        }
        // Pre-iOS 17: shared persistent default store (still survives relaunch).
        return .default()
    }

    /// Deterministic UUID so the same Cander account reuses one cookie jar.
    private static func stableUUID(from string: String) -> UUID {
        let digest = Insecure.MD5.hash(data: Data(string.utf8))
        var bytes = Array(digest)
        // RFC 4122 variant bits for a synthetic name-based UUID.
        bytes[6] = (bytes[6] & 0x0F) | 0x30
        bytes[8] = (bytes[8] & 0x3F) | 0x80
        return UUID(uuid: (
            bytes[0], bytes[1], bytes[2], bytes[3],
            bytes[4], bytes[5], bytes[6], bytes[7],
            bytes[8], bytes[9], bytes[10], bytes[11],
            bytes[12], bytes[13], bytes[14], bytes[15]
        ))
    }

    private func sanitizedURL(_ raw: String) -> URL? {
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty || trimmed == "about:blank" {
            return URL(string: "about:blank")
        }
        guard let url = URL(string: trimmed), let scheme = url.scheme?.lowercased() else {
            return nil
        }
        guard scheme == "http" || scheme == "https" else { return nil }
        if isBlockedHost(url) { return nil }
        return url
    }

    private func isBlockedHost(_ url: URL) -> Bool {
        let host = (url.host ?? "").lowercased()
        if host.isEmpty { return false }
        if host == "localhost" || host == "127.0.0.1" || host == "0.0.0.0" || host == "::1" {
            return true
        }
        if host.hasPrefix("10.") || host.hasPrefix("192.168.") || host.hasSuffix(".local") {
            return true
        }
        if host.range(of: #"^172\.(1[6-9]|2\d|3[0-1])\."#, options: .regularExpression) != nil {
            return true
        }
        return false
    }
}
