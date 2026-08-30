import Foundation
import Capacitor
import WebKit
import UIKit

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
            // Isolated previews never share the default cookie jar with ordinary browsing.
            if isolated {
                config.websiteDataStore = .nonPersistent()
            }
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
            for (id, entry) in self.tabs {
                entry.webView.isHidden = true
            }
            self.activeTabId = nil
            call.resolve()
        }
    }

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
        decisionHandler(.deny)
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
