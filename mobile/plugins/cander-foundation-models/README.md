# Cander Foundation Models plugin

Native Capacitor plugin embedded in the iOS app target.

## Methods

| Method | Result |
|---|---|
| `getAvailability` | `{ available, reason, streaming, message }` |
| `generate` | `{ content, runtime: "apple-local" }` — on-device only |

## Registration

- Swift: `CanderFoundationModelsPlugin.swift`
- `CanderBridgeViewController.capacitorDidLoad` → `registerPluginInstance`

## Privacy

LOCAL prompts never leave the device for inference.

## Build notes

Requires Xcode SDK with `FoundationModels` (`#if canImport`). Older toolchains compile the plugin as always-unavailable.
