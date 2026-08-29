# AIRuntime Phase 2 — exact file plan

**Status:** Ready for implementation (Phase 3+).  
**Defaults used** (blocking questions unanswered at write time):

| Question | Default |
|---|---|
| LOCAL + history | Persist owner-private thread transcripts to Supabase for UX continuity. **Never** send LOCAL prompts/responses to Edge for *inference*. |
| Work order | Part A (sample data + New menus) shipped before this. |
| Test device | Cap plugin + availability first; real Foundation Models proof requires Apple Intelligence hardware. Simulator may stub `unavailable`. |

---

## Architecture (unchanged UI)

```text
AppProvider.sendMessage
  → fetchPrivateAiReply / AIRuntime.generate
       ├─ mode LOCAL → AppleLocalProvider (Cap) | error if unavailable
       ├─ mode CLOUD → CloudProvider → ai-chat-api → Edge
       └─ mode AUTO  → local if capable else cloud
```

Privacy boundary: LOCAL path must not call `ai-chat` / bridge for generation. Comments required at every boundary where text could leave the device.

---

## Files to create

| File | Purpose |
|---|---|
| `lib/ai/runtime/types.ts` | `AiRuntimeMode`, `AiRuntimeCapabilities`, `AiGenerateRequest`/`Result`, errors |
| `lib/ai/runtime/runtime.ts` | `getAiRuntime()`, `generate()`, `getCapabilities()`, `isAvailable()`, mode get/set |
| `lib/ai/runtime/router.ts` | AUTO / LOCAL / CLOUD selection; never silent LOCAL→cloud |
| `lib/ai/runtime/providers/cloud.ts` | Wraps existing `ai-chat-api` / `fetchPrivateAiReply` path |
| `lib/ai/runtime/providers/apple-local.ts` | TS adapter → Cap plugin; unavailable on web |
| `lib/ai/runtime/providers/android-local.ts` | Interface stub only (`available: false`) |
| `lib/ai/runtime/mode-store.ts` | Persist mode in `localStorage` (`cander-ai-runtime-mode`) |
| `mobile/plugins/cander-foundation-models/` (Phase 4) | Cap plugin package |
| `mobile/ios/.../CanderFoundationModelsPlugin.swift` (Phase 4) | `SystemLanguageModel` / `LanguageModelSession` |
| `docs/runbook/ai-runtime.md` | Privacy + mode semantics |

## Files to modify

| File | Change |
|---|---|
| `lib/ai/send-thread-reply.ts` | Call `AIRuntime.generate` instead of Edge directly |
| `lib/ai/types.ts` | Extend provider ids (`cloud`, `apple-local`, `android-local`) |
| `components/shell/Composer.tsx` or small `AiRuntimeBadge.tsx` | Tiny Auto / On device / Cloud control (dev-visible) |
| `mobile/ios/App/App.xcodeproj` (Phase 4) | Link plugin; raise deploy target with `@available` |
| `mobile/capacitor.config.ts` (Phase 4) | Register plugin |
| `package.json` / `mobile/package.json` (Phase 4) | Plugin dep |

## Non-goals (this track)

- No SwiftUI app rewrite  
- No Ollama on iOS  
- No Android native implementation beyond stub  
- No Build agent behavior change  
- No fake “on device” replies on web  

## Phase order

3. Runtime + CloudProvider + mode UI (web unchanged when CLOUD/AUTO without local)  
4. Apple Cap plugin + availability + proof prompt  
5. Streaming if native API supports cleanly  
6. Tools/MCP through runtime  

---

## Apple APIs to verify in Xcode at Phase 4

- Framework: `FoundationModels`  
- `SystemLanguageModel.default.availability`  
- `LanguageModelSession` + `respond(to:)`  
- Streaming APIs only if present and usable  
- Gate: device eligible / Apple Intelligence enabled / model ready  
