# AIRuntime runbook

Unified inference entry for Cander. Product code calls `fetchPrivateAiReply` → `generateWithAiRuntime` — never Apple, Android, Ollama, or OpenAI APIs directly.

## Modes

| Mode | Behavior |
|---|---|
| **Auto** | Prefer on-device when available; else cloud |
| **On device (LOCAL)** | Force local. If unavailable → clean error. **Never** silent cloud fallback |
| **Cloud** | Existing Edge `ai-chat` → tunnel → bridge → Ollama |

## Settings → Hosting

In-app **Settings → Hosting** lets users pick Cloud / Auto / On device and see Apple Intelligence eligibility (ready, not enabled, model downloading, unsupported, or web).

Composer still shows a compact Auto / On device / Cloud control for quick checks.

## Privacy

- **LOCAL inference:** prompts/responses must not leave the device for generation (`CanderFoundationModelsPlugin` → Foundation Models).
- **Cloud inference:** prompts go to Edge (owner-private persistence + bridge).
- Thread transcripts may still sync owner-private for history; that is separate from inference routing.

## Phase status

- Phase 3: runtime + CloudProvider + mode control — shipped
- Phase 4: Cap plugin + AppleLocalProvider — shipped (requires Apple Intelligence device + recent Xcode SDK with `FoundationModels`)
- Phase 5: `streamWithAiRuntime` seam — full reply today; native token deltas later
- Phase 6: `lib/ai/runtime/tools.ts` seam — registries adapted; executors still placeholders
- Android: stub only

## Native

- Swift: `mobile/ios/App/App/CanderFoundationModelsPlugin.swift`
- Registered in `CanderBridgeViewController.capacitorDidLoad`
- Rebuild the iOS shell (`npm run mobile:ios` / Xcode) after pulling

## Dev preference key

`localStorage` `cander-ai-runtime-mode` = `auto` | `local` | `cloud`
