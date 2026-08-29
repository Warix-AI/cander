import Foundation

#if canImport(FoundationModels)
import FoundationModels
#endif

/**
 * CLI helper for Electron → Apple Foundation Models (macOS).
 *
 * Build (macOS 26+ / Xcode with FoundationModels):
 *   cd desktop/native/FoundationModelsHelper
 *   swiftc -parse-as-library -O -o FoundationModelsHelper main.swift
 *
 * Usage:
 *   FoundationModelsHelper availability
 *   echo '{"prompt":"…","instructions":"…"}' | FoundationModelsHelper generate
 *
 * PRIVACY: Runs entirely on-device. Do not network prompts from this binary.
 */

@main
struct FoundationModelsHelper {
  static func main() async {
    let args = Array(CommandLine.arguments.dropFirst())
    guard let command = args.first?.lowercased() else {
      emitError("usage: FoundationModelsHelper availability|generate")
      exit(2)
    }

    switch command {
    case "availability":
      emit(availabilityPayload())
    case "generate":
      let body = readStdinJSON()
      let prompt = stringValue(body["prompt"])?.trimmingCharacters(in: .whitespacesAndNewlines) ?? ""
      let instructions = stringValue(body["instructions"])?.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !prompt.isEmpty else {
        emitError("Prompt is required", code: "invalid_prompt")
        exit(2)
      }
      do {
        let content = try await generateOnDevice(
          prompt: prompt,
          instructions: (instructions?.isEmpty == false) ? instructions : nil,
        )
        emit([
          "content": content,
          "runtime": "apple-local",
        ])
      } catch {
        emitError(error.localizedDescription, code: "generation_failed")
        exit(1)
      }
    default:
      emitError("Unknown command \(command)")
      exit(2)
    }
  }

  static func readStdinJSON() -> [String: Any] {
    let data = FileHandle.standardInput.readDataToEndOfFile()
    guard !data.isEmpty,
          let obj = try? JSONSerialization.jsonObject(with: data),
          let dict = obj as? [String: Any]
    else {
      return [:]
    }
    return dict
  }

  static func stringValue(_ value: Any?) -> String? {
    if let s = value as? String { return s }
    return nil
  }

  static func availabilityPayload() -> [String: Any] {
    #if canImport(FoundationModels)
    if #available(macOS 26.0, *) {
      let model = SystemLanguageModel.default
      switch model.availability {
      case .available:
        return [
          "available": true,
          "reason": "available",
          "streaming": false,
          "message": "Apple Intelligence on-device model is ready.",
        ]
      case .unavailable(let reason):
        let code: String
        let message: String
        switch reason {
        case .deviceNotEligible:
          code = "device_not_eligible"
          message = "This Mac cannot run Apple Intelligence."
        case .appleIntelligenceNotEnabled:
          code = "apple_intelligence_not_enabled"
          message = "Turn on Apple Intelligence in System Settings to use on-device AI."
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
    #endif
    return [
      "available": false,
      "reason": "unsupported_os",
      "streaming": false,
      "message":
        "Apple Foundation Models require a newer macOS with Apple Intelligence. Cloud/Ollama remains available.",
    ]
  }

  static func generateOnDevice(prompt: String, instructions: String?) async throws -> String {
    #if canImport(FoundationModels)
    if #available(macOS 26.0, *) {
      let model = SystemLanguageModel.default
      guard case .available = model.availability else {
        throw NSError(
          domain: "CanderFoundationModels",
          code: 1,
          userInfo: [NSLocalizedDescriptionKey: "On-device model is not available."],
        )
      }
      let session: LanguageModelSession
      if let instructions, !instructions.isEmpty {
        session = LanguageModelSession(instructions: instructions)
      } else {
        session = LanguageModelSession()
      }
      let response = try await session.respond(to: prompt)
      return response.content
    }
    #endif
    throw NSError(
      domain: "CanderFoundationModels",
      code: 2,
      userInfo: [
        NSLocalizedDescriptionKey:
          "On-device Apple AI is not available on this OS/Mac.",
      ],
    )
  }

  static func emit(_ payload: [String: Any]) {
    guard
      let data = try? JSONSerialization.data(withJSONObject: payload),
      let text = String(data: data, encoding: .utf8)
    else {
      fputs("{\"available\":false,\"reason\":\"encode_error\"}\n", stderr)
      exit(1)
    }
    print(text)
  }

  static func emitError(_ message: String, code: String = "error") {
    emit([
      "available": false,
      "reason": code,
      "streaming": false,
      "message": message,
      "error": message,
    ])
  }
}
