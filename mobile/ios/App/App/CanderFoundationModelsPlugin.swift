import Foundation
import Capacitor

#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 * Capacitor bridge to Apple Foundation Models (on-device).
 *
 * PRIVACY: Prompts and responses for LOCAL inference stay on-device.
 * Do not forward call arguments to network APIs from this plugin.
 */
@objc(CanderFoundationModelsPlugin)
public class CanderFoundationModelsPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "CanderFoundationModelsPlugin"
    public let jsName = "CanderFoundationModels"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "getAvailability", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "generate", returnType: CAPPluginReturnPromise),
    ]

    @objc func getAvailability(_ call: CAPPluginCall) {
        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            call.resolve(Self.availabilityPayload())
            return
        }
        #endif
        call.resolve([
            "available": false,
            "reason": "unsupported_os",
            "streaming": false,
            "message": "Apple Foundation Models require a newer iOS with Apple Intelligence.",
        ])
    }

    @objc func generate(_ call: CAPPluginCall) {
        let prompt = call.getString("prompt")?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
        guard !prompt.isEmpty else {
            call.reject("Prompt is required", "invalid_prompt")
            return
        }

        #if canImport(FoundationModels)
        if #available(iOS 26.0, *) {
            Task {
                do {
                    let content = try await Self.generateOnDevice(prompt: prompt)
                    call.resolve([
                        "content": content,
                        "runtime": "apple-local",
                    ])
                } catch {
                    call.reject(error.localizedDescription, "generation_failed")
                }
            }
            return
        }
        #endif
        call.reject(
            "On-device Apple AI is not available on this OS/device.",
            "local_unavailable"
        )
    }

    #if canImport(FoundationModels)
    @available(iOS 26.0, *)
    private static func availabilityPayload() -> [String: Any] {
        let model = SystemLanguageModel.default
        switch model.availability {
        case .available:
            return [
                "available": true,
                "reason": "available",
                "streaming": true,
                "message": "Apple Intelligence on-device model is ready.",
            ]
        case .unavailable(let reason):
            let code: String
            let message: String
            switch reason {
            case .deviceNotEligible:
                code = "device_not_eligible"
                message = "This device cannot run Apple Intelligence."
            case .appleIntelligenceNotEnabled:
                code = "apple_intelligence_not_enabled"
                message = "Turn on Apple Intelligence in Settings to use on-device AI."
            case .modelNotReady:
                code = "model_not_ready"
                message = "The on-device model is still downloading. Try again shortly."
            @unknown default:
                code = "unavailable"
                message = "On-device model is unavailable."
            }
            return [
                "available": false,
                "reason": code,
                "streaming": false,
                "message": message,
            ]
        @unknown default:
            return [
                "available": false,
                "reason": "unavailable",
                "streaming": false,
                "message": "On-device model is unavailable.",
            ]
        }
    }

    @available(iOS 26.0, *)
    private static func generateOnDevice(prompt: String) async throws -> String {
        let model = SystemLanguageModel.default
        guard case .available = model.availability else {
            throw NSError(
                domain: "CanderFoundationModels",
                code: 1,
                userInfo: [NSLocalizedDescriptionKey: "On-device model is not available."]
            )
        }
        let session = LanguageModelSession()
        let response = try await session.respond(to: prompt)
        return response.content
    }
    #endif
}
