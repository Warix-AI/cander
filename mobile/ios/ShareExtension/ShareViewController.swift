/**
 * iOS Share Extension stub — opens cander://share with text/url.
 * Xcode target wiring: add Share Extension target pointing at this file.
 * Share-in NEVER auto-sends; the main app hydrates pending composer input.
 */

import UIKit
import Social
import UniformTypeIdentifiers

@objc(ShareViewController)
class ShareViewController: SLComposeServiceViewController {
    override func isContentValid() -> Bool {
        return true
    }

    override func didSelectPost() {
        var text = contentText ?? ""
        var urlString: String?

        if let items = extensionContext?.inputItems as? [NSExtensionItem] {
            for item in items {
                guard let attachments = item.attachments else { continue }
                for provider in attachments {
                    if provider.hasItemConformingToTypeIdentifier(UTType.url.identifier) {
                        provider.loadItem(forTypeIdentifier: UTType.url.identifier, options: nil) { data, _ in
                            if let url = data as? URL {
                                urlString = url.absoluteString
                            }
                        }
                    }
                    if provider.hasItemConformingToTypeIdentifier(UTType.plainText.identifier) {
                        provider.loadItem(forTypeIdentifier: UTType.plainText.identifier, options: nil) { data, _ in
                            if let s = data as? String, text.isEmpty {
                                text = s
                            }
                        }
                    }
                }
            }
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.15) {
            var comps = URLComponents()
            comps.scheme = "cander"
            comps.host = "share"
            var items: [URLQueryItem] = []
            if !text.isEmpty { items.append(URLQueryItem(name: "text", value: text)) }
            if let urlString { items.append(URLQueryItem(name: "url", value: urlString)) }
            comps.queryItems = items
            if let openURL = comps.url {
                var responder: UIResponder? = self
                while let r = responder {
                    if let app = r as? UIApplication {
                        app.open(openURL, options: [:], completionHandler: nil)
                        break
                    }
                    responder = r.next
                }
                // Fallback open via extension context
                self.extensionContext?.open(openURL, completionHandler: nil)
            }
            self.extensionContext?.completeRequest(returningItems: nil, completionHandler: nil)
        }
    }

    override func configurationItems() -> [Any]! {
        return []
    }
}
