import Foundation
import Speech
import AVFoundation

/**
 * CLI helper for Electron → Apple Speech (macOS on-device when available).
 *
 * Build:
 *   cd desktop/native/SpeechHelper
 *   swiftc -parse-as-library -O -framework Speech -framework AVFoundation -o SpeechHelper main.swift
 *
 * Usage:
 *   SpeechHelper availability
 *   SpeechHelper listen --lang en-US
 *     → NDJSON lines on stdout: partial | final | error | end
 *     → stop via SIGTERM / SIGINT / stdin EOF
 *
 * PRIVACY: Recognition stays on-device when supportsOnDeviceRecognition is true.
 */

@main
struct SpeechHelper {
  static func main() {
    let args = Array(CommandLine.arguments.dropFirst())
    guard let command = args.first?.lowercased() else {
      emit(["type": "error", "message": "usage: SpeechHelper availability|listen"])
      exit(2)
    }

    switch command {
    case "availability":
      emit(availabilityPayload())
    case "listen":
      let lang = value(for: "--lang", in: args) ?? "en-US"
      listen(localeId: lang)
    default:
      emit(["type": "error", "message": "Unknown command \(command)"])
      exit(2)
    }
  }

  static func value(for flag: String, in args: [String]) -> String? {
    guard let idx = args.firstIndex(of: flag), idx + 1 < args.count else { return nil }
    return args[idx + 1]
  }

  static func availabilityPayload() -> [String: Any] {
    let locale = Locale(identifier: "en-US")
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
      return [
        "available": false,
        "supportsOnDeviceRecognition": false,
        "message": "Speech recognizer unavailable for en-US.",
      ]
    }
    let onDevice = recognizer.supportsOnDeviceRecognition
    return [
      "available": recognizer.isAvailable,
      "supportsOnDeviceRecognition": onDevice,
      "message": recognizer.isAvailable
        ? (onDevice ? "On-device speech ready." : "Speech ready (may use network).")
        : "Speech recognition is not available.",
    ]
  }

  static func listen(localeId: String) {
    let locale = Locale(identifier: localeId)
    guard let recognizer = SFSpeechRecognizer(locale: locale) else {
      emit(["type": "error", "message": "Speech recognizer unavailable for \(localeId)."])
      emit(["type": "end"])
      exit(1)
    }

    let authStatus = SFSpeechRecognizer.authorizationStatus()
    if authStatus == .notDetermined {
      let sem = DispatchSemaphore(value: 0)
      var granted = false
      SFSpeechRecognizer.requestAuthorization { status in
        granted = status == .authorized
        sem.signal()
      }
      sem.wait()
      if !granted {
        emit(["type": "error", "message": "Speech recognition permission was denied."])
        emit(["type": "end"])
        exit(1)
      }
    } else if authStatus != .authorized {
      emit(["type": "error", "message": "Speech recognition permission was denied."])
      emit(["type": "end"])
      exit(1)
    }

    let micStatus = AVCaptureDevice.authorizationStatus(for: .audio)
    if micStatus == .notDetermined {
      let sem = DispatchSemaphore(value: 0)
      var granted = false
      AVCaptureDevice.requestAccess(for: .audio) { ok in
        granted = ok
        sem.signal()
      }
      sem.wait()
      if !granted {
        emit(["type": "error", "message": "Microphone permission was denied."])
        emit(["type": "end"])
        exit(1)
      }
    } else if micStatus != .authorized {
      emit(["type": "error", "message": "Microphone permission was denied."])
      emit(["type": "end"])
      exit(1)
    }

    let audioEngine = AVAudioEngine()
    let request = SFSpeechAudioBufferRecognitionRequest()
    request.shouldReportPartialResults = true
    if recognizer.supportsOnDeviceRecognition {
      request.requiresOnDeviceRecognition = true
    }

    let input = audioEngine.inputNode
    let format = input.outputFormat(forBus: 0)
    input.installTap(onBus: 0, bufferSize: 1024, format: format) { buffer, _ in
      request.append(buffer)
    }

    var lastPartial = ""
    var finished = false
    let lock = NSLock()

    let task = recognizer.recognitionTask(with: request) { result, error in
      lock.lock()
      defer { lock.unlock() }
      if finished { return }

      if let result {
        let text = result.bestTranscription.formattedString.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty {
          if result.isFinal {
            emit(["type": "final", "text": text])
            lastPartial = ""
          } else if text != lastPartial {
            lastPartial = text
            emit(["type": "partial", "text": text])
          }
        }
      }

      if let error {
        let ns = error as NSError
        if ns.domain == "kAFAssistantErrorDomain", ns.code == 1110 {
          // No speech detected — ignore
        } else {
          emit(["type": "error", "message": error.localizedDescription])
        }
      }

      if result?.isFinal == true || error != nil {
        finished = true
        stopListening(engine: audioEngine, request: request)
        emit(["type": "end"])
        exit(error == nil ? 0 : 1)
      }
    }

    do {
      try audioEngine.start()
    } catch {
      emit(["type": "error", "message": error.localizedDescription])
      emit(["type": "end"])
      exit(1)
    }

    signal(SIGINT) { _ in
      // Handled via DispatchSource below where possible; keep for CLI.
    }

    let sigTerm = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
    let sigInt = DispatchSource.makeSignalSource(signal: SIGINT, queue: .main)
    signal(SIGTERM, SIG_IGN)
    signal(SIGINT, SIG_IGN)

    let stopAll = {
      lock.lock()
      if finished {
        lock.unlock()
        return
      }
      finished = true
      lock.unlock()
      task.cancel()
      stopListening(engine: audioEngine, request: request)
      emit(["type": "end"])
      exit(0)
    }

    sigTerm.setEventHandler(handler: stopAll)
    sigInt.setEventHandler(handler: stopAll)
    sigTerm.resume()
    sigInt.resume()

    // Stop when stdin closes (parent ended the session).
    DispatchQueue.global(qos: .utility).async {
      _ = FileHandle.standardInput.readDataToEndOfFile()
      DispatchQueue.main.async(execute: stopAll)
    }

    RunLoop.main.run()
  }

  static func stopListening(engine: AVAudioEngine, request: SFSpeechAudioBufferRecognitionRequest) {
    request.endAudio()
    engine.stop()
    engine.inputNode.removeTap(onBus: 0)
  }

  static func emit(_ payload: [String: Any]) {
    guard JSONSerialization.isValidJSONObject(payload),
          let data = try? JSONSerialization.data(withJSONObject: payload),
          let line = String(data: data, encoding: .utf8)
    else { return }
    fputs(line + "\n", stdout)
    fflush(stdout)
  }
}
