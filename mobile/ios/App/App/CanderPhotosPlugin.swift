import Foundation
import Capacitor
import Photos
import UIKit

/**
 * Save generated chat images into the user's Photos library.
 * Requests add-only permission on demand (NSPhotoLibraryAddUsageDescription).
 */
@objc(CanderPhotosPlugin)
public class CanderPhotosPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CanderPhotosPlugin"
    public let jsName = "CanderPhotos"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "saveImage", returnType: CAPPluginReturnPromise),
    ]

    @objc func saveImage(_ call: CAPPluginCall) {
        let dataUrl = call.getString("dataUrl") ?? ""
        guard let image = Self.decodeImage(from: dataUrl) else {
            call.reject("Invalid image data", "invalid_image")
            return
        }

        let status = PHPhotoLibrary.authorizationStatus(for: .addOnly)
        switch status {
        case .authorized, .limited:
            Self.write(image: image, call: call)
        case .notDetermined:
            PHPhotoLibrary.requestAuthorization(for: .addOnly) { newStatus in
                DispatchQueue.main.async {
                    if newStatus == .authorized || newStatus == .limited {
                        Self.write(image: image, call: call)
                    } else {
                        call.reject("Photos permission denied", "permission_denied")
                    }
                }
            }
        case .denied, .restricted:
            call.reject("Photos permission denied", "permission_denied")
        @unknown default:
            call.reject("Photos unavailable", "unavailable")
        }
    }

    private static func write(image: UIImage, call: CAPPluginCall) {
        PHPhotoLibrary.shared().performChanges({
            PHAssetChangeRequest.creationRequestForAsset(from: image)
        }) { success, error in
            DispatchQueue.main.async {
                if success {
                    call.resolve(["ok": true])
                } else {
                    call.reject(
                        error?.localizedDescription ?? "Failed to save image",
                        "save_failed"
                    )
                }
            }
        }
    }

    private static func decodeImage(from dataUrl: String) -> UIImage? {
        let raw: Data?
        if dataUrl.hasPrefix("data:"),
           let comma = dataUrl.firstIndex(of: ",") {
            let b64 = String(dataUrl[dataUrl.index(after: comma)...])
            raw = Data(base64Encoded: b64, options: .ignoreUnknownCharacters)
        } else {
            raw = Data(base64Encoded: dataUrl, options: .ignoreUnknownCharacters)
        }
        guard let raw else { return nil }
        return UIImage(data: raw)
    }
}
